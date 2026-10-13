/**
 * @fileoverview 声明式存储约束的 transitionMetadata 合并回归测试。
 * 覆盖：属性级 check 编译、显式 checks 覆盖、继承同名覆盖（AC#17）、exclusions 合并、
 * `where` 无 `unique` 的注册期拒绝、合并后数组回填。
 */

import { describe, expect, it } from 'vitest';
import {
  BooleanProperty,
  EntityMetadataOptions,
  PropertyType,
  StringProperty
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.string, ...extra }) as StringProperty;

const boolProp = (name: string, extra: Partial<BooleanProperty> = {}): BooleanProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.boolean, ...extra }) as BooleanProperty;

const mkOptions = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions =>
  ({
    name: 'Part' as Capitalize<string>,
    namespace: 'public',
    properties: [stringProp('id', { primary: true }), stringProp('name')],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  }) as EntityMetadataOptions;

describe('transitionMetadata 存储约束合并', () => {
  it('属性级 check 编译成以属性名为 name 的实体级 CHECK', () => {
    const metadata = transitionMetadata(
      mkOptions({
        properties: [
          stringProp('id', { primary: true }),
          stringProp('qty', { check: { operator: 'notNull' } })
        ]
      })
    );
    const compiled = metadata.checkMap.get('qty');
    expect(compiled).toBeDefined();
    expect(compiled?.rule).toEqual({
      combinator: 'and',
      rules: [{ field: 'qty', operator: 'notNull' }]
    });
    expect(metadata.checks.map(check => check.name)).toEqual(['qty']);
  });

  it('同一实体里显式 checks 与属性级 check 同名时显式声明获胜', () => {
    const metadata = transitionMetadata(
      mkOptions({
        properties: [stringProp('id', { primary: true }), stringProp('qty', { check: { operator: 'notNull' } })],
        checks: [{ name: 'qty', rule: { combinator: 'and', rules: [{ field: 'name', operator: 'notNull' }] } }]
      })
    );
    const compiled = metadata.checkMap.get('qty');
    expect(compiled?.rule).toEqual({ combinator: 'and', rules: [{ field: 'name', operator: 'notNull' }] });
  });

  it('继承时同名 CHECK 子实体覆盖父实体，异名项全部生效（AC#17）', () => {
    const parent = mkOptions({
      name: 'Parent' as Capitalize<string>,
      checks: [{ name: 'name_not_null', rule: { combinator: 'and', rules: [{ field: 'name', operator: 'notNull' }] } }]
    });
    const child = mkOptions({
      name: 'Child' as Capitalize<string>,
      checks: [{ name: 'name_not_null', rule: { combinator: 'and', rules: [{ field: 'id', operator: 'notNull' }] } }]
    });
    const metadata = transitionMetadata(child, [parent]);
    expect(metadata.checkMap.get('name_not_null')?.rule).toEqual({
      combinator: 'and',
      rules: [{ field: 'id', operator: 'notNull' }]
    });
    // 异名项：父实体的另一条保留
    const parentWithExtra = mkOptions({
      name: 'Parent' as Capitalize<string>,
      checks: [
        { name: 'name_not_null', rule: { combinator: 'and', rules: [{ field: 'name', operator: 'notNull' }] } },
        { name: 'id_not_null', rule: { combinator: 'and', rules: [{ field: 'id', operator: 'notNull' }] } }
      ]
    });
    const merged = transitionMetadata(child, [parentWithExtra]);
    expect(merged.checks.map(check => check.name).sort()).toEqual(['id_not_null', 'name_not_null']);
  });

  it('exclusions 按 name 合并、继承同名覆盖', () => {
    const parent = mkOptions({
      name: 'Parent' as Capitalize<string>,
      exclusions: [
        {
          name: 'no_overlap',
          equal: ['name'],
          ranges: [{ from: 'id', to: 'id', bounds: '[)' }]
        }
      ]
    });
    const child = mkOptions({
      name: 'Child' as Capitalize<string>,
      exclusions: [
        {
          name: 'no_overlap',
          equal: ['id'],
          ranges: [{ from: 'id', to: 'id', bounds: '[]' }]
        }
      ]
    });
    const metadata = transitionMetadata(child, [parent]);
    expect(metadata.exclusionMap.get('no_overlap')?.equal).toEqual(['id']);
    expect(metadata.exclusionMap.get('no_overlap')?.ranges[0].bounds).toBe('[]');
  });

  it('checks / exclusions 数组回填合并后全集', () => {
    const parent = mkOptions({
      name: 'Parent' as Capitalize<string>,
      checks: [{ name: 'id_not_null', rule: { combinator: 'and', rules: [{ field: 'id', operator: 'notNull' }] } }]
    });
    const child = mkOptions({
      name: 'Child' as Capitalize<string>,
      properties: [stringProp('id', { primary: true }), boolProp('flag', { check: { operator: 'notNull' } })]
    });
    const metadata = transitionMetadata(child, [parent]);
    expect(metadata.checks.map(check => check.name).sort()).toEqual(['flag', 'id_not_null']);
    expect(metadata.exclusions).toEqual([]);
  });

  it('索引 where 没有 unique 时注册期抛错', () => {
    expect(() =>
      transitionMetadata(
        mkOptions({
          indexes: [{ name: 'released_effective_from', properties: ['name'], where: { combinator: 'and', rules: [] } }]
        })
      )
    ).toThrow(/where 却没有 unique/);
  });
});
