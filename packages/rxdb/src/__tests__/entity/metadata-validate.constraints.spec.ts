/**
 * @fileoverview 声明式存储约束的注册期校验回归测试。
 * 覆盖：操作符白名单（AC#9）、字段类型拒绝、ref 约束、命名规则与 63 字节门限（AC#15）、
 * 字面量值域（AC#15）、where 校验、排他声明形状。
 */

import { describe, expect, it } from 'vitest';
import {
  EntityMetadataOptions,
  IntegerProperty,
  JSONProperty,
  PropertyType,
  StringProperty
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.string, ...extra }) as StringProperty;

const mkMetadata = (overrides: Partial<EntityMetadataOptions> = {}) =>
  transitionMetadata({
    name: 'Part' as Capitalize<string>,
    namespace: 'public',
    properties: [
      stringProp('id', { primary: true }),
      stringProp('qty'),
      stringProp('name'),
      { name: 'unitFrom', type: PropertyType.integer, nullable: true } as IntegerProperty,
      { name: 'unitTo', type: PropertyType.integer, nullable: true } as IntegerProperty,
      { name: 'payload', type: PropertyType.json } as JSONProperty
    ],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  } as EntityMetadataOptions);

const validateChecks = (checks: unknown[]) =>
  validateEntityMetadata(mkMetadata({ checks: checks as NonNullable<EntityMetadataOptions['checks']> }));

describe('CHECK 声明校验', () => {
  it('exists / contains / startsWith 等白名单外操作符在元数据期拒绝（AC#9）', () => {
    for (const operator of ['exists', 'notExists', 'contains', 'notContains', 'startsWith', 'endsWith']) {
      const errors = validateChecks([
        { name: 'bad_op', rule: { combinator: 'and', rules: [{ field: 'qty', operator: operator as never }] } }
      ]);
      expect(
        errors.some(error => error.rule === 'invalidCheck'),
        operator
      ).toBe(true);
    }
  });

  it('JSON 列与关系路径在元数据期拒绝（AC#9）', () => {
    const errors = validateChecks([
      { name: 'on_json', rule: { combinator: 'and', rules: [{ field: 'payload', operator: 'notNull' }] } },
      { name: 'on_path', rule: { combinator: 'and', rules: [{ field: 'relation.column', operator: 'notNull' }] } }
    ]);
    expect(errors.filter(error => error.rule === 'invalidCheck').length).toBe(2);
  });

  it('ref 只能配比较操作符，且与字面量取值互斥', () => {
    const errors = validateChecks([
      { name: 'bad_ref', rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: 'in', ref: 'unitTo' }] } },
      {
        name: 'both',
        rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo', value: 1 }] }
      }
    ]);
    expect(errors.filter(error => error.rule === 'invalidCheck').length).toBe(2);
  });

  it('integer 列超 int4 值域的字面量在元数据期拒绝（AC#15）', () => {
    const errors = validateChecks([
      { name: 'too_big', rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '=', value: 3000000000 }] } }
    ]);
    expect(errors.some(error => error.rule === 'invalidCheck' && error.message.includes('int4'))).toBe(true);
  });

  it('约束名非法或完整名超 63 字节在元数据期拒绝（AC#15）', () => {
    const badNames = validateChecks([
      { name: 'BadName', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }] } },
      { name: '1start', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }] } },
      { name: 'has-dash', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }] } }
    ]);
    expect(badNames.filter(error => error.rule === 'invalidConstraintName').length).toBe(3);

    const longName = 'a'.repeat(60);
    const tooLong = validateChecks([
      { name: longName, rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }] } }
    ]);
    expect(tooLong.some(error => error.rule === 'invalidConstraintName' && error.message.includes('63'))).toBe(true);
  });

  it('合法声明零违规，字段对字段与 null 组合通过（AC#8 的声明侧）', () => {
    const errors = validateChecks([
      {
        name: 'unit_range',
        rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
      },
      { name: 'qty_not_null', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }] } }
    ]);
    expect(errors).toEqual([]);
  });
});

describe('条件唯一 where 校验', () => {
  it('where 规则组复用 CHECK 白名单（非法操作符拒绝）', () => {
    const metadata = mkMetadata({
      indexes: [
        {
          name: 'released_effective_from',
          properties: ['qty', 'name'],
          unique: true,
          where: { combinator: 'and', rules: [{ field: 'qty', operator: 'exists' as never }] }
        }
      ]
    });
    const errors = validateEntityMetadata(metadata);
    expect(errors.some(error => error.rule === 'invalidIndexWhere')).toBe(true);
  });

  it('合法 where 零违规', () => {
    const metadata = mkMetadata({
      indexes: [
        {
          name: 'released_effective_from',
          properties: ['qty', 'name'],
          unique: true,
          where: { combinator: 'and', rules: [{ field: 'qty', operator: '=', value: 'released' }] }
        }
      ]
    });
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });
});

describe('区间排他声明校验', () => {
  const exclusion = (overrides: Record<string, unknown> = {}) =>
    ({
      name: 'occurrence_no_overlap',
      equal: ['qty'],
      ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[)' }],
      ...overrides
    }) as NonNullable<EntityMetadataOptions['exclusions']>[number];

  it('区间列限时间类与整数列', () => {
    const metadata = mkMetadata({ exclusions: [exclusion({ ranges: [{ from: 'qty', to: 'name', bounds: '[)' }] })] });
    const errors = validateEntityMetadata(metadata);
    expect(
      errors.some(error => error.rule === 'invalidExclusion' && error.message.includes('只支持时间类与整数列'))
    ).toBe(true);
  });

  it('bounds 限 [) 与 []', () => {
    const metadata = mkMetadata({
      exclusions: [exclusion({ ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '(]' }] })]
    });
    const errors = validateEntityMetadata(metadata);
    expect(errors.some(error => error.rule === 'invalidExclusion' && error.message.includes('bounds'))).toBe(true);
  });

  it('equal 与 ranges 至少一列 / 一维', () => {
    const noEqual = mkMetadata({ exclusions: [exclusion({ equal: [] })] });
    expect(validateEntityMetadata(noEqual).some(error => error.rule === 'invalidExclusion')).toBe(true);
    const noRanges = mkMetadata({ exclusions: [exclusion({ ranges: [] })] });
    expect(validateEntityMetadata(noRanges).some(error => error.rule === 'invalidExclusion')).toBe(true);
  });

  it('合法排他声明零违规', () => {
    const metadata = mkMetadata({
      exclusions: [
        exclusion({
          equal: ['qty'],
          ranges: [
            { from: 'unitFrom', to: 'unitTo', bounds: '[)' },
            { from: 'unitTo', to: 'unitFrom', bounds: '[]' }
          ]
        })
      ]
    });
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });
});
