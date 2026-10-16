/**
 * @fileoverview CHECK / 排他编译与约束命名回归测试。
 * 覆盖：命名确定性（哈希）、规则组编译形状、字面量渲染与值域拒绝（AC#15 的编译侧）。
 */

import { describe, expect, it } from 'vitest';
import {
  buildExclusionConstraintName,
  buildStorageConstraintName,
  compileCheckConstraint,
  compileCheckRuleGroup,
  renderCheckLiteral,
  serializeExclusion
} from '../../entity/check-sql.js';
import {
  BooleanProperty,
  EntityExclusionMetadataOptions,
  EntityMetadataOptions,
  IntegerProperty,
  PropertyType,
  StringProperty
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.string, ...extra }) as StringProperty;

const mkMetadata = (overrides: Partial<EntityMetadataOptions> = {}) =>
  transitionMetadata({
    name: 'Part' as Capitalize<string>,
    namespace: 'bom',
    properties: [
      stringProp('id', { primary: true }),
      stringProp('qty'),
      stringProp('qtyFormula'),
      { name: 'unitFrom', type: PropertyType.integer } as IntegerProperty,
      { name: 'unitTo', type: PropertyType.integer } as IntegerProperty,
      { name: 'flag', type: PropertyType.boolean } as BooleanProperty
    ],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  } as EntityMetadataOptions);

describe('约束命名', () => {
  it('同一表达式同一名字、不同表达式哈希不同', () => {
    const first = buildStorageConstraintName('ck_', 'bom', 'bom_line', 'qty_not_null', '("qty" IS NOT NULL)');
    const same = buildStorageConstraintName('ck_', 'bom', 'bom_line', 'qty_not_null', '("qty" IS NOT NULL)');
    const other = buildStorageConstraintName('ck_', 'bom', 'bom_line', 'qty_not_null', '("qty" IS NULL)');
    expect(first).toBe(same);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^ck_bom\$bom_line_qty_not_null_[0-9a-f]{8}$/);
  });

  it('排他约束名由规范串派生、随声明变化', () => {
    const metadata = mkMetadata();
    const exclusion: EntityExclusionMetadataOptions = {
      name: 'occurrence_no_overlap',
      equal: ['qty'],
      ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[)' }]
    };
    const name = buildExclusionConstraintName(metadata, exclusion);
    expect(name).toMatch(/^ex_bom\$Part_occurrence_no_overlap_[0-9a-f]{8}$/);
    expect(serializeExclusion(exclusion)).toBe('equal=qty;ranges=unitFrom:unitTo:[)');
  });
});

describe('CHECK 规则编译', () => {
  it('字段对字段 ref 比较', () => {
    const metadata = mkMetadata();
    const sql = compileCheckRuleGroup(
      { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] },
      metadata
    );
    expect(sql).toBe('("unitFrom" <= "unitTo")');
  });

  it('and / or 组合与括号', () => {
    const metadata = mkMetadata();
    const sql = compileCheckRuleGroup(
      {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'notNull' },
              { field: 'qtyFormula', operator: 'null' }
            ]
          },
          { field: 'flag', operator: '=', value: true }
        ]
      },
      metadata
    );
    expect(sql).toBe('(("qty" IS NOT NULL AND "qtyFormula" IS NULL) OR "flag" = true)');
  });

  it('in / between / null 全形态', () => {
    const metadata = mkMetadata();
    expect(
      compileCheckRuleGroup(
        { combinator: 'and', rules: [{ field: 'qty', operator: 'in', values: ['1', '2'] }] },
        metadata
      )
    ).toBe(`("qty" IN ('1', '2'))`);
    expect(
      compileCheckRuleGroup(
        { combinator: 'and', rules: [{ field: 'unitFrom', operator: 'between', low: 0, high: 100 }] },
        metadata
      )
    ).toBe('("unitFrom" BETWEEN 0 AND 100)');
    expect(compileCheckRuleGroup({ combinator: 'and', rules: [{ field: 'qty', operator: 'null' }] }, metadata)).toBe(
      '("qty" IS NULL)'
    );
  });

  it('compileCheckConstraint 产出完整名称与谓词', () => {
    const metadata = mkMetadata();
    const { name, sql } = compileCheckConstraint(metadata, {
      name: 'unit_range',
      rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
    });
    expect(name).toMatch(/^ck_bom\$Part_unit_range_[0-9a-f]{8}$/);
    expect(sql).toBe('("unitFrom" <= "unitTo")');
  });
});

describe('字面量渲染', () => {
  it('integer 列超 int4 值域拒绝（AC#15）', () => {
    const rendered = renderCheckLiteral(3000000000, PropertyType.integer);
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.reason).toContain('int4');
  });

  it('integer 列接受边界内整数', () => {
    expect(renderCheckLiteral(2147483647, PropertyType.integer)).toEqual({ ok: true, sql: '2147483647' });
  });

  it('bigint 列接受 bigint、拒绝超 int8 域', () => {
    expect(renderCheckLiteral(9007199254740993n, PropertyType.bigint)).toEqual({ ok: true, sql: '9007199254740993' });
    expect(renderCheckLiteral(2n ** 63n, PropertyType.bigint).ok).toBe(false);
  });

  it('number 列拒绝非有限值', () => {
    expect(renderCheckLiteral(Number.NaN, PropertyType.number).ok).toBe(false);
    expect(renderCheckLiteral(0.5, PropertyType.number)).toEqual({ ok: true, sql: '0.5' });
  });

  it('date 列接受 Date 与 ISO 串并折叠成同一字面量', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const fromDate = renderCheckLiteral(date, PropertyType.date);
    const fromString = renderCheckLiteral('2026-01-01T00:00:00.000Z', PropertyType.date);
    expect(fromDate.ok && fromString.ok && fromDate.sql === fromString.sql).toBe(true);
  });

  it('enum 列拒绝集合外的字面量', () => {
    expect(renderCheckLiteral('x', PropertyType.enum, ['a', 'b']).ok).toBe(false);
    expect(renderCheckLiteral('a', PropertyType.enum, ['a', 'b'])).toEqual({ ok: true, sql: "'a'" });
  });

  it('数组 / 对象列不能作字面量载体', () => {
    expect(renderCheckLiteral('x', PropertyType.stringArray).ok).toBe(false);
    expect(renderCheckLiteral({}, PropertyType.json).ok).toBe(false);
  });
});
