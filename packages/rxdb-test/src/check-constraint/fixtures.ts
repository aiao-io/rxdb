/**
 * @fileoverview 声明式 CHECK 约束契约套件的共享夹具（US-030 阶段 A）。
 *
 * 三个夹具对应三条行为 AC：
 * - {@link CheckQtyItem}：AC#1 属性级 CHECK 语法糖（`qty` 上限）；
 * - {@link CheckXorItem}：AC#2 实体级 CHECK「两字段二选一」；
 * - {@link CheckRangeItem}：AC#8 实体级 CHECK `unitFrom <= unitTo`（ref 字段对字段）。
 *
 * 断言的对象是**归一后的错误类**（`RxDBCheckViolationError`）与落库行为，
 * 与具体后端无关——两后端跑同一份套件。
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
          { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }, { field: 'qtyFormula', operator: 'null' }] },
          { combinator: 'and', rules: [{ field: 'qty', operator: 'null' }, { field: 'qtyFormula', operator: 'notNull' }] }
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
