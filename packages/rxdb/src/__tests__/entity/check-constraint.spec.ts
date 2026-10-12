/**
 * @fileoverview 声明式 CHECK 约束元数据层测试（US-030 阶段 A）。
 *
 * 覆盖：
 * - 白名单编译：字面量按列类型拼装、`ref` 字段对字段、成员 / 区间 / 空值操作符、规则组（AC#1 / #2 / #8 的表达式侧）；
 * - AC#9：exists / contains 系 / startsWith 系 / 关系路径 / JSON / 键值 / 二进制 / 加密列在元数据期拒绝；
 * - AC#15：约束 name 形状与 63 字节上限、字面量超出列类型值域（PG int4 上限等）；
 * - 约束名确定性生成：表名 + name + 规范化表达式 8 位哈希，改表达式不改名即换哈希（AC#11 的命名侧）；
 * - AC#17：继承合并——同名子覆盖父、异名全生效；属性级 check 语法糖与显式 checks 的覆盖关系。
 */

import { describe, expect, it } from 'vitest';
import { compileCheckConstraint, compileCheckExpression, hashCheckExpression } from '../../entity/check-constraint.js';
import { BooleanProperty, IntegerProperty, PropertyType, StringProperty } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import { EntityMetadataOptions } from '../../entity/metadata-options.interface.js';
import { OnDeleteAction, RelationKind } from '../../entity/relation-types.interface.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({
    name: name as Uncapitalize<string>,
    type: PropertyType.string,
    ...extra
  }) as StringProperty;

const intProp = (name: string, extra: Partial<IntegerProperty> = {}): IntegerProperty =>
  ({
    name: name as Uncapitalize<string>,
    type: PropertyType.integer,
    ...extra
  }) as IntegerProperty;

const boolProp = (name: string, extra: Partial<BooleanProperty> = {}): BooleanProperty =>
  ({
    name: name as Uncapitalize<string>,
    type: PropertyType.boolean,
    ...extra
  }) as BooleanProperty;

const metadataOf = (overrides: Partial<EntityMetadataOptions>): ReturnType<typeof transitionMetadata> =>
  transitionMetadata({
    name: 'Item' as Capitalize<string>,
    namespace: 'public',
    properties: [stringProp('id', { primary: true }), intProp('qty', { nullable: true }), stringProp('note', { nullable: true })],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  } as EntityMetadataOptions);

describe('compileCheckConstraint', () => {
  it('编译比较 / 空值 / ref 规则为两后端同一条表达式', () => {
    const metadata = metadataOf({
      properties: [
        stringProp('id', { primary: true }),
        intProp('qty', { nullable: true }),
        intProp('qtyFormula', { nullable: true }),
        intProp('unitFrom', { nullable: true }),
        intProp('unitTo', { nullable: true }),
        stringProp('note', { nullable: true }),
        stringProp('state', { nullable: true }),
        boolProp('active', { nullable: true })
      ],
      checks: [
        { name: 'qty_positive', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } },
        { name: 'unit_range', rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] } },
        { name: 'state_in', rule: { combinator: 'and', rules: [{ field: 'state', operator: 'in', value: ['a', 'b'] }] } },
        { name: 'qty_between', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'between', value: [1, 10] }] } },
        { name: 'qty_not_between', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notBetween', value: [1, 10] }] } },
        { name: 'note_null', rule: { combinator: 'and', rules: [{ field: 'note', operator: 'null' }] } },
        { name: 'note_not_null', rule: { combinator: 'and', rules: [{ field: 'note', operator: 'notNull' }] } },
        { name: 'active_true', rule: { combinator: 'and', rules: [{ field: 'active', operator: '=', value: true }] } }
      ]
    });
    const compiled = new Map(metadata.checkMap.keys().map(name => {
      const check = metadata.checkMap.get(name)!;
      return [name, compileCheckConstraint(metadata, check)] as const;
    }));
    expect(compiled.get('qty_positive')!.expression).toBe('("qty" > 0)');
    expect(compiled.get('unit_range')!.expression).toBe('("unitFrom" <= "unitTo")');
    expect(compiled.get('state_in')!.expression).toBe(`("state" IN ('a', 'b'))`);
    expect(compiled.get('qty_between')!.expression).toBe('("qty" BETWEEN 1 AND 10)');
    expect(compiled.get('qty_not_between')!.expression).toBe('("qty" NOT BETWEEN 1 AND 10)');
    expect(compiled.get('note_null')!.expression).toBe('("note" IS NULL)');
    expect(compiled.get('note_not_null')!.expression).toBe('("note" IS NOT NULL)');
    expect(compiled.get('active_true')!.expression).toBe('("active" = true)');
  });

  it('编译嵌套规则组为带括号的 and/or 表达式', () => {
    const metadata = metadataOf({
      checks: [
        {
          name: 'qty_xor_note',
          rule: {
            combinator: 'or',
            rules: [
              { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }, { field: 'note', operator: 'null' }] },
              { combinator: 'and', rules: [{ field: 'qty', operator: 'null' }, { field: 'note', operator: 'notNull' }] }
            ]
          }
        }
      ]
    });
    const check = metadata.checkMap.get('qty_xor_note')!;
    expect(compileCheckExpression(metadata, check)).toBe(
      '(("qty" IS NOT NULL AND "note" IS NULL) OR ("qty" IS NULL AND "note" IS NOT NULL))'
    );
  });

  it('字符串字面量转义单引号且不转义反斜杠（两后端同为标准 SQL 转义）', () => {
    const metadata = metadataOf({
      checks: [{ name: 'note_no_quote', rule: { combinator: 'and', rules: [{ field: 'note', operator: '!=', value: "o'brien\\x" }] } }]
    });
    expect(compileCheckExpression(metadata, metadata.checkMap.get('note_no_quote')!)).toBe(`("note" != 'o''brien\\x')`);
  });

  it('number / bigint / date 字面量按存储形态编译', () => {
    const metadata = metadataOf({
      properties: [
        stringProp('id', { primary: true }),
        { name: 'ratio', type: PropertyType.number, nullable: true },
        { name: 'amount', type: PropertyType.bigint, nullable: true },
        { name: 'dueAt', type: PropertyType.date, nullable: true }
      ],
      checks: [
        { name: 'ratio_gt_half', rule: { combinator: 'and', rules: [{ field: 'ratio', operator: '>', value: 0.5 }] } },
        { name: 'amount_max', rule: { combinator: 'and', rules: [{ field: 'amount', operator: '<=', value: 9007199254740993n }] } },
        { name: 'due_after', rule: { combinator: 'and', rules: [{ field: 'dueAt', operator: '>', value: new Date('2026-01-01T00:00:00.000Z') }] } }
      ]
    });
    expect(compileCheckExpression(metadata, metadata.checkMap.get('ratio_gt_half')!)).toBe('("ratio" > 0.5)');
    expect(compileCheckExpression(metadata, metadata.checkMap.get('amount_max')!)).toBe('("amount" <= 9007199254740993)');
    expect(compileCheckExpression(metadata, metadata.checkMap.get('due_after')!)).toBe(`("dueAt" > '2026-01-01T00:00:00.000Z')`);
  });

  it('约束名 = ck_ + 表名 + name + 规范化表达式 8 位哈希；改表达式不改名即换哈希（AC#11 命名侧）', () => {
    const a = metadataOf({ checks: [{ name: 'qty_positive', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } }] });
    const b = metadataOf({ checks: [{ name: 'qty_positive', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 1 }] } }] });
    const nameA = compileCheckConstraint(a, a.checkMap.get('qty_positive')!).name;
    const nameB = compileCheckConstraint(b, b.checkMap.get('qty_positive')!).name;
    const expectedA = `ck_Item_qty_positive_${hashCheckExpression(compileCheckExpression(a, a.checkMap.get('qty_positive')!))}`;
    expect(nameA).toBe(expectedA);
    expect(nameA).not.toBe(nameB);
    // 哈希是 8 位小写 hex
    expect(nameA).toMatch(/^ck_Item_qty_positive_[0-9a-f]{8}$/);
  });
});

describe('AC#9 单行子集外的规则在元数据期拒绝', () => {
  const rejectedRules: ReadonlyArray<{ name: string; rule: unknown; reason: RegExp }> = [
    { name: 'bad_exists', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'exists' }] }, reason: /操作符非法/ },
    { name: 'bad_not_exists', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'notExists' }] }, reason: /操作符非法/ },
    { name: 'bad_contains', rule: { combinator: 'and', rules: [{ field: 'note', operator: 'contains', value: 'x' }] }, reason: /操作符非法/ },
    { name: 'bad_starts_with', rule: { combinator: 'and', rules: [{ field: 'note', operator: 'startsWith', value: 'x' }] }, reason: /操作符非法/ },
    { name: 'bad_ends_with', rule: { combinator: 'and', rules: [{ field: 'note', operator: 'endsWith', value: 'x' }] }, reason: /操作符非法/ },
    { name: 'bad_path', rule: { combinator: 'and', rules: [{ field: 'parent.name', operator: '=', value: 'x' }] }, reason: /关系路径/ },
    { name: 'bad_missing', rule: { combinator: 'and', rules: [{ field: 'ghost', operator: '=', value: 1 }] }, reason: /不存在的字段/ },
    { name: 'bad_ref_on_in', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'in', ref: 'unitTo' }] }, reason: /ref 只配比较操作符/ },
    { name: 'bad_ref_value', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '=', value: 1, ref: 'unitTo' }] }, reason: /互斥/ },
    { name: 'bad_value_null', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '=', value: null }] }, reason: /null 作字面量/ },
    { name: 'bad_in_empty', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'in', value: [] }] }, reason: /非空数组/ },
    { name: 'bad_between_shape', rule: { combinator: 'and', rules: [{ field: 'qty', operator: 'between', value: [1] }] }, reason: /二元组/ },
    { name: 'bad_combinator', rule: { combinator: 'xor' as 'or', rules: [] }, reason: /combinator 非法/ },
    { name: 'bad_empty_group', rule: { combinator: 'and', rules: [] }, reason: /不能为空/ }
  ];

  rejectedRules.forEach(({ name, rule, reason }) => {
    it(`拒绝 ${name} 并点名原因`, () => {
      const metadata = metadataOf({ checks: [{ name: name as Uncapitalize<string>, rule: rule as never }] });
      expect(() => compileCheckConstraint(metadata, metadata.checkMap.get(name as Uncapitalize<string>)!)).toThrow(reason);
      // 元数据校验同样以 invalidCheck 产出该违规
      const violations = validateEntityMetadata(metadata);
      expect(violations).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: name, rule: 'invalidCheck', message: expect.stringMatching(reason) })])
      );
    });
  });

  it('拒绝 JSON / 键值 / 二进制 / 数组列与加密列', () => {
    const metadata = metadataOf({
      properties: [
        stringProp('id', { primary: true }),
        { name: 'payload', type: PropertyType.json, nullable: true },
        { name: 'config', type: PropertyType.keyValue, nullable: true, properties: [] },
        { name: 'blob', type: PropertyType.binary, nullable: true },
        { name: 'tags', type: PropertyType.stringArray, nullable: true },
        { name: 'secret', type: PropertyType.string, nullable: true, encrypted: true }
      ],
      checks: [
        { name: 'bad_json', rule: { combinator: 'and', rules: [{ field: 'payload', operator: '=', value: '{}' }] } },
        { name: 'bad_keyvalue', rule: { combinator: 'and', rules: [{ field: 'config', operator: '=', value: 'x' }] } },
        { name: 'bad_binary', rule: { combinator: 'and', rules: [{ field: 'blob', operator: '=', value: 'x' }] } },
        { name: 'bad_array', rule: { combinator: 'and', rules: [{ field: 'tags', operator: 'in', value: ['x'] }] } },
        { name: 'bad_encrypted', rule: { combinator: 'and', rules: [{ field: 'secret', operator: '=', value: 'x' }] } }
      ]
    });
    for (const [checkName, reason] of [
      ['bad_json', /json/],
      ['bad_keyvalue', /keyValue/],
      ['bad_binary', /binary/],
      ['bad_array', /stringArray/],
      ['bad_encrypted', /加密列/]
    ] as const) {
      expect(() => compileCheckConstraint(metadata, metadata.checkMap.get(checkName)!)).toThrow(reason);
    }
  });

  it('拒绝关系外键列（阶段 A 只支持实体自身标量属性）', () => {
    const metadata = metadataOf({
      relations: [
        {
          name: 'parent',
          columnName: 'parentId',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Item',
          mappedProperty: 'id',
          nullable: true,
          onDelete: OnDeleteAction.CASCADE,
          onUpdate: OnDeleteAction.CASCADE
        }
      ],
      checks: [{ name: 'bad_fk', rule: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: 'x' }] } }]
    });
    expect(() => compileCheckConstraint(metadata, metadata.checkMap.get('bad_fk')!)).toThrow(/外键列/);
  });
});

describe('AC#15 约束名与字面量值域在元数据期拒绝', () => {
  it('name 含 [a-z0-9_] 外字符即拒绝', () => {
    for (const bad of ['Uppercase', 'has-dash', '1starts', '有中文', '']) {
      const metadata = metadataOf({
        checks: [{ name: bad as Uncapitalize<string>, rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } }]
      });
      expect(() => compileCheckConstraint(metadata, metadata.checkMap.get(bad as Uncapitalize<string>)!)).toThrow(/只允许 \[a-z\]\[a-z0-9_\]\*/);
    }
  });

  it('约束名超 63 UTF-8 字节即拒绝，不截断', () => {
    const metadata = metadataOf({
      tableName: 'ExtremelyLongTableNameThatAlreadyConsumesFiftyBytes',
      checks: [{ name: 'a_very_long_check_name_that_pushes_total_over_limit', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } }]
    });
    expect(() => compileCheckConstraint(metadata, metadata.checkMap.get('a_very_long_check_name_that_pushes_total_over_limit')!)).toThrow(
      /超过 63 UTF-8 字节/
    );
    // 62 字节的完整名可以过：ck_ + 表名 + _ + name + _ + 8 位哈希
    const boundary = metadataOf({
      tableName: 'T',
      checks: [{ name: 'boundary_ok', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } }]
    });
    const boundaryName = compileCheckConstraint(boundary, boundary.checkMap.get('boundary_ok')!).name;
    expect(new TextEncoder().encode(boundaryName).length).toBeLessThanOrEqual(63);
  });

  it('integer 列字面量超出 PG int4 值域即拒绝（3000000000 / -3000000000）', () => {
    for (const bad of [2147483648, 3000000000, -2147483649]) {
      const metadata = metadataOf({
        checks: [{ name: 'qty_bad', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '=', value: bad }] } }]
      });
      expect(() => compileCheckConstraint(metadata, metadata.checkMap.get('qty_bad')!)).toThrow(/超出 integer 列的值域/);
    }
    const ok = metadataOf({ checks: [{ name: 'qty_ok', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '=', value: 2147483647 }] } }] });
    expect(compileCheckExpression(ok, ok.checkMap.get('qty_ok')!)).toBe('("qty" = 2147483647)');
  });

  it('bigint 列字面量超出 64 位值域即拒绝', () => {
    const metadata = metadataOf({
      properties: [stringProp('id', { primary: true }), { name: 'amount', type: PropertyType.bigint, nullable: true }],
      checks: [{ name: 'amount_bad', rule: { combinator: 'and', rules: [{ field: 'amount', operator: '=', value: 2n ** 63n }] } }]
    });
    expect(() => compileCheckConstraint(metadata, metadata.checkMap.get('amount_bad')!)).toThrow(/64 位有符号整数/);
  });

  it('number 列拒绝 NaN / Infinity；integer 列拒绝非整数', () => {
    const metadata = metadataOf({
      properties: [
        stringProp('id', { primary: true }),
        intProp('qty', { nullable: true }),
        { name: 'ratio', type: PropertyType.number, nullable: true }
      ],
      checks: [
        { name: 'ratio_nan', rule: { combinator: 'and', rules: [{ field: 'ratio', operator: '=', value: NaN }] } },
        { name: 'qty_fraction', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '=', value: 1.5 }] } }
      ]
    });
    expect(() => compileCheckConstraint(metadata, metadata.checkMap.get('ratio_nan')!)).toThrow(/有限数字/);
    expect(() => compileCheckConstraint(metadata, metadata.checkMap.get('qty_fraction')!)).toThrow(/安全整数/);
  });
});

describe('AC#17 继承合并', () => {
  const baseOptions = (): EntityMetadataOptions =>
    ({
      name: 'BaseItem' as Capitalize<string>,
      namespace: 'public',
      abstract: true,
      properties: [
        stringProp('id', { primary: true }),
        intProp('qty', { nullable: true, check: { operator: '>', value: 0 } })
      ],
      checks: [{ name: 'base_only', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '<', value: 100 }] } }],
      computedProperties: [],
      relations: [],
      indexes: []
    }) as EntityMetadataOptions;

  it('同名项子覆盖父、异名项全部生效；属性级语法糖以属性名为键参与覆盖', () => {
    const child = transitionMetadata(
      {
        name: 'ChildItem' as Capitalize<string>,
        extends: ['BaseItem'],
        checks: [{ name: 'base_only', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '<', value: 50 }] } }],
        properties: [],
        computedProperties: [],
        relations: [],
        indexes: []
      } as EntityMetadataOptions,
      [baseOptions()]
    );
    expect([...child.checkMap.keys()].sort()).toEqual(['base_only', 'qty']);
    // 同名：子实体的表达式生效
    expect(compileCheckExpression(child, child.checkMap.get('base_only')!)).toBe('("qty" < 50)');
    // 异名（语法糖编译出的 qty）：父实体的照样生效
    expect(compileCheckExpression(child, child.checkMap.get('qty')!)).toBe('("qty" > 0)');
    // 约束名随子实体表名，与父实体同名约束互不干扰
    expect(compileCheckConstraint(child, child.checkMap.get('base_only')!).name).toMatch(/^ck_ChildItem_base_only_/);
  });

  it('同一层里显式 checks 覆盖属性级语法糖', () => {
    const metadata = transitionMetadata({
      name: 'Item2' as Capitalize<string>,
      namespace: 'public',
      properties: [stringProp('id', { primary: true }), intProp('qty', { nullable: true, check: { operator: '>', value: 0 } })],
      checks: [{ name: 'qty', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>=', value: 1 }] } }],
      computedProperties: [],
      relations: [],
      indexes: []
    } as EntityMetadataOptions);
    expect(metadata.checkMap.size).toBe(1);
    expect(compileCheckExpression(metadata, metadata.checkMap.get('qty')!)).toBe('("qty" >= 1)');
  });

  it('无 checks 的实体 checkMap 为空且校验无违规', () => {
    const metadata = metadataOf({});
    expect(metadata.checkMap.size).toBe(0);
    expect(validateEntityMetadata(metadata)).toEqual([]);
  });
});
