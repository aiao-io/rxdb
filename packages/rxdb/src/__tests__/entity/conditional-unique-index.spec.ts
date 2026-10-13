/**
 * @fileoverview 条件唯一索引元数据层测试（US-030 阶段 B）。
 *
 * 覆盖：
 * - `where` 与 CHECK 共用单行白名单编译（含 `ref`），产出两后端同一条部分索引谓词；
 * - 只对 `unique: true` 有意义，单独出现在元数据期报错（不静默忽略）；
 * - AC#9：白名单外的规则在元数据期拒绝并点名索引；
 * - AC#15：索引 name 形状与 63 字节上限；
 * - 确定性命名：`uq_` + 表名 + name + 规范化定义哈希，定义含 namespace（SQLite 索引名是库级的）。
 */

import { describe, expect, it } from 'vitest';
import {
  compileConditionalUniqueIndex,
  conditionalUniqueIndexesOf,
  isConditionalUniqueIndex
} from '../../entity/conditional-unique-index.js';
import {
  BooleanProperty,
  EntityMetadataOptions,
  PropertyType,
  StringProperty
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import type { EntityIndexMetadataOptions } from '../../entity/property-types.interface.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.string, ...extra }) as StringProperty;

const boolProp = (name: string, extra: Partial<BooleanProperty> = {}): BooleanProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.boolean, ...extra }) as BooleanProperty;

const releasedWhere = { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] } as const;

const metadataOf = (indexes: EntityIndexMetadataOptions[], namespace = 'public') =>
  transitionMetadata({
    name: 'Revision' as Capitalize<string>,
    namespace,
    properties: [
      stringProp('id', { primary: true }),
      stringProp('itemId'),
      stringProp('code', { nullable: true }),
      stringProp('state'),
      boolProp('active', { nullable: true }),
      { name: 'ownerId', type: PropertyType.uuid, nullable: true }
    ],
    computedProperties: [],
    relations: [],
    indexes
  } as EntityMetadataOptions);

describe('compileConditionalUniqueIndex', () => {
  it('编译部分唯一索引：确定性 uq_ 名、物理列与只拼字面量的 where', () => {
    const metadata = metadataOf([
      { name: 'released_item', properties: ['itemId', 'code'], unique: true, where: releasedWhere }
    ]);
    const index = metadata.indexMap.get('released_item')!;
    expect(isConditionalUniqueIndex(index)).toBe(true);
    const compiled = compileConditionalUniqueIndex(metadata, index);
    expect(compiled.name).toMatch(/^uq_Revision_released_item_[0-9a-f]{8}$/);
    expect(compiled.columns).toEqual(['itemId', 'code']);
    expect(compiled.normalized).toBe(false);
    expect(compiled.where).toBe(`("state" = 'released')`);
  });

  it('普通索引不是条件唯一索引，不进 conditionalUniqueIndexesOf', () => {
    const metadata = metadataOf([
      { name: 'plain', properties: ['code'] },
      { name: 'released_item', properties: ['itemId'], unique: true, where: releasedWhere }
    ]);
    expect(conditionalUniqueIndexesOf(metadata).map(index => index.name)).toEqual(['released_item']);
  });

  it('where 支持 ref 与 null / notNull 组合（与 CHECK 同一白名单）', () => {
    const metadata = metadataOf([
      {
        name: 'active_code',
        properties: ['code'],
        unique: true,
        where: {
          combinator: 'and',
          rules: [
            { field: 'active', operator: '=', value: true },
            { field: 'code', operator: 'notNull' },
            { field: 'itemId', operator: '!=', ref: 'code' }
          ]
        }
      }
    ]);
    const compiled = compileConditionalUniqueIndex(metadata, metadata.indexMap.get('active_code')!);
    expect(compiled.where).toBe(`("active" = true AND "code" IS NOT NULL AND "itemId" != "code")`);
  });

  it('改 where 不改 name 即换哈希（漂移可检出，AC#11）；normalized 也进定义', () => {
    const a = metadataOf([{ name: 'released_item', properties: ['itemId'], unique: true, where: releasedWhere }]);
    const b = metadataOf([
      {
        name: 'released_item',
        properties: ['itemId'],
        unique: true,
        where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'draft' }] }
      }
    ]);
    const c = metadataOf([
      { name: 'released_item', properties: ['itemId'], unique: true, normalized: true, where: releasedWhere }
    ]);
    const names = [a, b, c].map(m => compileConditionalUniqueIndex(m, m.indexMap.get('released_item')!).name);
    expect(new Set(names).size).toBe(3);
  });

  it('同表同定义在不同 namespace 下名字不同（SQLite 索引名是库级的）', () => {
    const index: EntityIndexMetadataOptions = {
      name: 'released_item',
      properties: ['itemId'],
      unique: true,
      where: releasedWhere
    };
    const a = metadataOf([index], 'alpha');
    const b = metadataOf([index], 'beta');
    expect(compileConditionalUniqueIndex(a, a.indexMap.get('released_item')!).name).not.toBe(
      compileConditionalUniqueIndex(b, b.indexMap.get('released_item')!).name
    );
  });

  it.each([
    ['没有 unique', { name: 'no_unique', properties: ['code'], where: releasedWhere }, /没有 unique/],
    [
      '白名单外的操作符（AC#9）',
      {
        name: 'bad_op',
        properties: ['code'],
        unique: true,
        where: { combinator: 'and', rules: [{ field: 'code', operator: 'contains', value: 'x' }] }
      },
      /操作符非法/
    ],
    [
      '关系路径（AC#9）',
      {
        name: 'bad_path',
        properties: ['code'],
        unique: true,
        where: { combinator: 'and', rules: [{ field: 'item.code', operator: '=', value: 'x' }] }
      },
      /关系路径/
    ],
    ['列不存在', { name: 'bad_col', properties: ['missing'], unique: true, where: releasedWhere }, /不存在的字段/],
    ['name 含大写（AC#15）', { name: 'BadName', properties: ['code'], unique: true, where: releasedWhere }, /非法/],
    [
      'uuid 字面量不是小写规范 UUID（PG 建索引时按 uuid 解析）',
      {
        name: 'bad_uuid',
        properties: ['code'],
        unique: true,
        where: { combinator: 'and', rules: [{ field: 'ownerId', operator: '=', value: 'not-a-uuid' }] }
      },
      /不是小写规范 UUID/
    ]
  ])('%s → 元数据期拒绝并点名索引', (_label, index, reason) => {
    const metadata = metadataOf([index as EntityIndexMetadataOptions]);
    const declared = metadata.indexMap.get((index as EntityIndexMetadataOptions).name)!;
    expect(() => compileConditionalUniqueIndex(metadata, declared)).toThrow(reason);
    // 元数据校验同样以 invalidIndexWhere 产出该违规（消息即编译原因）
    expect(validateEntityMetadata(metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'invalidIndexWhere',
          field: (index as EntityIndexMetadataOptions).name,
          message: expect.stringMatching(reason)
        })
      ])
    );
  });

  it('整名超 63 UTF-8 字节在元数据期拒绝，不截断（AC#15）', () => {
    const metadata = metadataOf([
      {
        name: 'a_very_long_conditional_unique_index_name_over_the_limit',
        properties: ['code'],
        unique: true,
        where: releasedWhere
      }
    ]);
    const index = metadata.indexMap.get('a_very_long_conditional_unique_index_name_over_the_limit')!;
    expect(() => compileConditionalUniqueIndex(metadata, index)).toThrow(/超过 63 UTF-8 字节/);
  });

  it('继承：同名索引子覆盖父（与 indexes 既有的 Map 覆盖同一套）', () => {
    const child = transitionMetadata(
      {
        name: 'ChildRevision' as Capitalize<string>,
        extends: ['Revision'],
        properties: [],
        computedProperties: [],
        relations: [],
        indexes: [
          {
            name: 'released_item',
            properties: ['itemId'],
            unique: true,
            where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'draft' }] }
          }
        ]
      } as EntityMetadataOptions,
      [
        {
          name: 'Revision' as Capitalize<string>,
          namespace: 'public',
          abstract: true,
          properties: [stringProp('id', { primary: true }), stringProp('itemId'), stringProp('state')],
          computedProperties: [],
          relations: [],
          indexes: [{ name: 'released_item', properties: ['itemId'], unique: true, where: releasedWhere }]
        } as EntityMetadataOptions
      ]
    );
    const compiled = compileConditionalUniqueIndex(child, child.indexMap.get('released_item')!);
    expect(compiled.where).toBe(`("state" = 'draft')`);
    expect(compiled.name).toMatch(/^uq_ChildRevision_released_item_/);
  });
});
