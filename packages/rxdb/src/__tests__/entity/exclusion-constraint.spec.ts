/**
 * @fileoverview 区间排他元数据层测试（US-030 阶段 C）。
 *
 * 覆盖：
 * - 编译：相等列 + 区间维，时间维取 `tstzrange`、整数维取 `int8range`，倒置区间以 `CASE` 映射成空区间；
 * - AC#15：相等列 / 区间维为空、列不存在或类型不符、bounds 非法、同列重复、name 形状与 63 字节上限；
 * - 确定性命名：`ex_` + 表名 + name + 规范化定义哈希，定义含 namespace（SQLite 触发器名是库级的）；
 *   SQLite 侧两个触发器名 `_i` / `_u`；
 * - AC#17：继承合并——同名子覆盖父、异名全生效；
 * - 按约束名反查（违约归一化用）。
 */

import { describe, expect, it } from 'vitest';
import {
  compileExclusionConstraint,
  exclusionRangeExpressionPG,
  exclusionTriggerNames,
  findExclusionByConstraintName,
  type EntityExclusionMetadataOptions
} from '../../entity/exclusion-constraint.js';
import {
  DateProperty,
  EntityMetadataOptions,
  IntegerProperty,
  PropertyType,
  StringProperty
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.string, ...extra }) as StringProperty;

const intProp = (name: string, extra: Partial<IntegerProperty> = {}): IntegerProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.integer, ...extra }) as IntegerProperty;

const dateProp = (name: string, extra: Partial<DateProperty> = {}): DateProperty =>
  ({ name: name as Uncapitalize<string>, type: PropertyType.date, ...extra }) as DateProperty;

const occurrenceProperties = () => [
  stringProp('id', { primary: true }),
  stringProp('lineId'),
  stringProp('note', { nullable: true }),
  { name: 'payload', type: PropertyType.json, nullable: true },
  dateProp('effectiveFrom', { nullable: true }),
  dateProp('effectiveTo', { nullable: true }),
  intProp('unitFrom', { nullable: true }),
  intProp('unitTo', { nullable: true })
];

const twoDimensional: EntityExclusionMetadataOptions = {
  name: 'occurrence_no_overlap',
  equal: ['lineId'],
  ranges: [
    { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
    { from: 'unitFrom', to: 'unitTo', bounds: '[]' }
  ]
};

const metadataOf = (exclusions: EntityExclusionMetadataOptions[], namespace = 'public') =>
  transitionMetadata({
    name: 'Occurrence' as Capitalize<string>,
    namespace,
    properties: occurrenceProperties(),
    computedProperties: [],
    relations: [],
    indexes: [],
    exclusions
  } as EntityMetadataOptions);

describe('compileExclusionConstraint', () => {
  it('编译相等列 + 两维区间：确定性 ex_ 名、物理列与值域', () => {
    const metadata = metadataOf([twoDimensional]);
    const compiled = compileExclusionConstraint(metadata, metadata.exclusionMap.get('occurrence_no_overlap')!);
    expect(compiled.name).toMatch(/^ex_Occurrence_occurrence_no_overlap_[0-9a-f]{8}$/);
    expect(compiled.equal).toEqual([{ field: 'lineId', column: 'lineId' }]);
    expect(compiled.ranges.map(range => [range.from.column, range.to.column, range.bounds, range.kind])).toEqual([
      ['effectiveFrom', 'effectiveTo', '[)', 'timestamp'],
      ['unitFrom', 'unitTo', '[]', 'integer']
    ]);
  });

  it('PG 区间表达式：时间取 tstzrange、整数取 int8range，倒置区间以 CASE 映射成空区间', () => {
    const metadata = metadataOf([twoDimensional]);
    const [dates, units] = compileExclusionConstraint(
      metadata,
      metadata.exclusionMap.get('occurrence_no_overlap')!
    ).ranges;
    expect(exclusionRangeExpressionPG(dates)).toBe(
      `(CASE WHEN "effectiveFrom" > "effectiveTo" THEN 'empty'::tstzrange ELSE tstzrange("effectiveFrom", "effectiveTo", '[)') END)`
    );
    expect(exclusionRangeExpressionPG(units)).toBe(
      `(CASE WHEN "unitFrom" > "unitTo" THEN 'empty'::int8range ELSE int8range("unitFrom", "unitTo", '[]') END)`
    );
  });

  it('SQLite 侧两个触发器名：约束名加 _i / _u，仍以 ex_ 起头', () => {
    expect(exclusionTriggerNames('ex_T_x_12345678')).toEqual(['ex_T_x_12345678_i', 'ex_T_x_12345678_u']);
  });

  it('改定义不改 name 即换哈希；同定义不同 namespace 名字不同', () => {
    const base = compileExclusionConstraint(metadataOf([twoDimensional]), twoDimensional).name;
    const changed = compileExclusionConstraint(
      metadataOf([{ ...twoDimensional, ranges: [twoDimensional.ranges[0]] }]),
      {
        ...twoDimensional,
        ranges: [twoDimensional.ranges[0]]
      }
    ).name;
    const otherNamespace = compileExclusionConstraint(metadataOf([twoDimensional], 'other'), twoDimensional).name;
    expect(new Set([base, changed, otherNamespace]).size).toBe(3);
  });

  it.each([
    ['equal 为空', { ...twoDimensional, name: 'no_equal', equal: [] }, /equal 至少一列/],
    ['ranges 为空', { ...twoDimensional, name: 'no_ranges', ranges: [] }, /ranges 至少一维/],
    ['相等列不存在', { ...twoDimensional, name: 'bad_equal', equal: ['missing'] }, /不存在的字段/],
    ['相等列是 JSON', { ...twoDimensional, name: 'json_equal', equal: ['payload'] }, /是 json 列/],
    ['相等列是关系路径', { ...twoDimensional, name: 'path_equal', equal: ['line.id'] }, /关系路径/],
    [
      '区间维是字符串列',
      { ...twoDimensional, name: 'string_range', ranges: [{ from: 'note', to: 'note', bounds: '[)' }] },
      /区间维只接受 date \/ integer \/ bigint/
    ],
    [
      '起止列类型不一致',
      { ...twoDimensional, name: 'mixed_range', ranges: [{ from: 'effectiveFrom', to: 'unitTo', bounds: '[)' }] },
      /起止列类型不一致/
    ],
    [
      'bounds 非法',
      {
        ...twoDimensional,
        name: 'bad_bounds',
        ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '(]' as never }]
      },
      /bounds 非法/
    ],
    ['同一列出现两次', { ...twoDimensional, name: 'dup_column', equal: ['lineId', 'unitFrom'] }, /出现了不止一次/],
    ['name 含大写', { ...twoDimensional, name: 'NoOverlap' as never }, /非法/]
  ])('%s → 元数据期拒绝并点名约束（AC#15）', (_label, exclusion, reason) => {
    const metadata = metadataOf([exclusion as EntityExclusionMetadataOptions]);
    expect(() => compileExclusionConstraint(metadata, exclusion as EntityExclusionMetadataOptions)).toThrow(reason);
    expect(validateEntityMetadata(metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'invalidExclusion',
          field: exclusion.name,
          message: expect.stringMatching(reason)
        })
      ])
    );
  });

  it('加密列不能做相等列或区间端点', () => {
    const metadata = transitionMetadata({
      name: 'Occurrence' as Capitalize<string>,
      namespace: 'public',
      properties: [
        stringProp('id', { primary: true }),
        stringProp('lineId', { encrypted: true } as Partial<StringProperty>),
        intProp('unitFrom', { nullable: true }),
        intProp('unitTo', { nullable: true })
      ],
      computedProperties: [],
      relations: [],
      indexes: [],
      exclusions: [{ name: 'enc', equal: ['lineId'], ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }] }]
    } as EntityMetadataOptions);
    expect(() => compileExclusionConstraint(metadata, metadata.exclusionMap.get('enc')!)).toThrow(/加密列/);
  });

  it('整名超 63 UTF-8 字节在元数据期拒绝，不截断（AC#15）', () => {
    const exclusion = { ...twoDimensional, name: 'an_exclusion_name_long_enough_to_push_the_total_over' as never };
    expect(() => compileExclusionConstraint(metadataOf([exclusion]), exclusion)).toThrow(/超过 63 UTF-8 字节/);
  });

  it('按约束名反查声明；名字对不上返回 undefined', () => {
    const metadata = metadataOf([twoDimensional]);
    const { name } = compileExclusionConstraint(metadata, twoDimensional);
    expect(findExclusionByConstraintName(metadata, name)?.name).toBe(name);
    expect(findExclusionByConstraintName(metadata, 'ex_Occurrence_other_00000000')).toBeUndefined();
  });
});

describe('AC#17 区间排他的继承合并', () => {
  const base = (): EntityMetadataOptions =>
    ({
      name: 'BaseOccurrence' as Capitalize<string>,
      namespace: 'public',
      abstract: true,
      properties: occurrenceProperties(),
      computedProperties: [],
      relations: [],
      indexes: [],
      exclusions: [
        twoDimensional,
        { name: 'units_only', equal: ['lineId'], ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }] }
      ]
    }) as EntityMetadataOptions;

  it('同名项子覆盖父、异名项全部生效', () => {
    const child = transitionMetadata(
      {
        name: 'ChildOccurrence' as Capitalize<string>,
        extends: ['BaseOccurrence'],
        properties: [],
        computedProperties: [],
        relations: [],
        indexes: [],
        exclusions: [{ ...twoDimensional, ranges: [twoDimensional.ranges[0]] }]
      } as EntityMetadataOptions,
      [base()]
    );
    expect([...child.exclusionMap.keys()].sort()).toEqual(['occurrence_no_overlap', 'units_only']);
    // 同名：子实体的定义生效（只剩日期一维）
    expect(compileExclusionConstraint(child, child.exclusionMap.get('occurrence_no_overlap')!).ranges).toHaveLength(1);
    // 约束名随子实体表名
    expect(compileExclusionConstraint(child, child.exclusionMap.get('units_only')!).name).toMatch(
      /^ex_ChildOccurrence_units_only_/
    );
    // 「自身」数组只含本类定义
    expect(child.exclusions.map(exclusion => exclusion.name)).toEqual(['occurrence_no_overlap']);
  });

  it('没有排他声明的实体 exclusionMap 为空且校验无违规', () => {
    const metadata = metadataOf([]);
    expect(metadata.exclusionMap.size).toBe(0);
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });
});
