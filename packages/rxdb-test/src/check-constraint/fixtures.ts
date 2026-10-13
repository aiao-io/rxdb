/**
 * @fileoverview 声明式存储约束契约套件的共享夹具（US-030）。
 *
 * CHECK（阶段 A）三个夹具对应三条行为 AC：
 * - {@link CheckQtyItem}：AC#1 属性级 CHECK 语法糖（`qty` 上限）；
 * - {@link CheckXorItem}：AC#2 实体级 CHECK「两字段二选一」；
 * - {@link CheckRangeItem}：AC#8 实体级 CHECK `unitFrom <= unitTo`（ref 字段对字段）。
 *
 * 条件唯一（阶段 B）：{@link ConditionalUniqueRevision}（AC#3）。
 * 区间排他（阶段 C）：{@link ExclusionOccurrence}（AC#4 / #12 / #13）、{@link ExclusionSegment}（AC#14 重放）。
 *
 * 断言的对象是**归一后的错误类**与落库行为，与具体后端无关——两后端跑同一份套件。
 */

import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * AC#1：属性级 `check` 语法糖——`qty` 必须是 ≤ 100 的整数。
 * 编译成名为 `qty` 的实体级 CHECK，约束名以 `ck_` 起头。
 */
@Entity({
  name: 'CheckQtyItem',
  namespace: 'check-constraint-fixtures',
  log: false,
  properties: [{ name: 'qty', type: PropertyType.integer, nullable: true, check: { operator: '<=', value: 100 } }]
})
export class CheckQtyItem extends EntityBase {
  qty!: number | null;
}

/**
 * AC#2：实体级 CHECK「两字段二选一」——`qty` 与 `qtyFormula` 恰好一项非空。
 */
@Entity({
  name: 'CheckXorItem',
  namespace: 'check-constraint-fixtures',
  log: false,
  properties: [
    { name: 'qty', type: PropertyType.integer, nullable: true },
    { name: 'qtyFormula', type: PropertyType.string, nullable: true }
  ],
  checks: [
    {
      name: 'qty_xor_formula',
      rule: {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'notNull' },
              { field: 'qtyFormula', operator: 'null' }
            ]
          },
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'null' },
              { field: 'qtyFormula', operator: 'notNull' }
            ]
          }
        ]
      }
    }
  ]
})
export class CheckXorItem extends EntityBase {
  qty!: number | null;
  qtyFormula!: string | null;
}

/**
 * AC#8：实体级 CHECK「下界 ≤ 上界」（ref 字段对字段比较）。
 *
 * 字段对字段比较遇 NULL 按 SQL 三值逻辑放行（结果 unknown 即 CHECK 通过），
 * 要拒 NULL 须显式写 `notNull`——两个后端行为一致。
 */
@Entity({
  name: 'CheckRangeItem',
  namespace: 'check-constraint-fixtures',
  log: false,
  properties: [
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  checks: [
    {
      name: 'unit_range',
      rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
    }
  ]
})
export class CheckRangeItem extends EntityBase {
  unitFrom!: number | null;
  unitTo!: number | null;
}

/** 套件全部夹具（建库用）。 */
export const checkConstraintFixtures = [CheckQtyItem, CheckXorItem, CheckRangeItem] as const;

/**
 * AC#3：条件唯一（阶段 B）——同一物料至多一个已发布修订，草稿不受唯一约束限制。
 */
@Entity({
  name: 'ConditionalUniqueRevision',
  namespace: 'check-constraint-fixtures',
  log: false,
  properties: [
    { name: 'itemId', type: PropertyType.string },
    { name: 'state', type: PropertyType.string }
  ],
  indexes: [
    {
      name: 'released_item',
      properties: ['itemId'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ]
})
export class ConditionalUniqueRevision extends EntityBase {
  itemId!: string;
  state!: string;
}

/** 条件唯一套件的夹具（建库用）。 */
export const conditionalUniqueFixtures = [ConditionalUniqueRevision] as const;

/**
 * AC#4 / #12 / #13：区间排他（阶段 C）——相等列 `lineId` + 日期 `[)` 与整数 `[]` 两维，端点可空（NULL 即无界）。
 * 全部维同时相交才算冲突。
 */
@Entity({
  name: 'ExclusionOccurrence',
  namespace: 'check-constraint-fixtures',
  log: false,
  properties: [
    { name: 'lineId', type: PropertyType.string },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['lineId'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
        { from: 'unitFrom', to: 'unitTo', bounds: '[]' }
      ]
    }
  ]
})
export class ExclusionOccurrence extends EntityBase {
  lineId!: string;
  effectiveFrom!: Date | null;
  effectiveTo!: Date | null;
  unitFrom!: number | null;
  unitTo!: number | null;
}

/**
 * AC#14：带变更日志的单维日期区间——undo / redo 与切分支要重放它（`log` 保持默认开启）。
 */
@Entity({
  name: 'ExclusionSegment',
  namespace: 'check-constraint-fixtures',
  properties: [
    { name: 'lineId', type: PropertyType.string },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true }
  ],
  exclusions: [
    {
      name: 'segment_no_overlap',
      equal: ['lineId'],
      ranges: [{ from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' }]
    }
  ]
})
export class ExclusionSegment extends EntityBase {
  lineId!: string;
  effectiveFrom!: Date | null;
  effectiveTo!: Date | null;
}

/** 区间排他套件的夹具（建库用）。 */
export const exclusionFixtures = [ExclusionOccurrence, ExclusionSegment] as const;
