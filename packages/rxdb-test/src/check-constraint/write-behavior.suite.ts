/**
 * @fileoverview 声明式 CHECK 约束的写入行为契约套件（US-030 AC#1 / #2 / #8）。
 *
 * SQLite family 与 PGlite 各跑一份：
 * - AC#1：属性级 CHECK（语法糖）拒绝越界值，错误是 `RxDBCheckViolationError`，
 *   携带实体名、确定性约束名与冲突列/冲突值；
 * - AC#2：实体级 CHECK「两字段二选一」两字段同时给值即拒绝；
 * - AC#8：ref 字段对字段比较——`unitFrom > unitTo` 拒绝；`unitFrom` 为 NULL 放行
 *   （SQL 三值逻辑，要拒 NULL 须另加 `notNull`）。
 */

import { RxDBCheckViolationError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { checkConstraintFixtures, CheckQtyItem, CheckRangeItem, CheckXorItem } from './fixtures.js';
import type { CheckConstraintSuiteFactory } from './types.js';

/** 断言「归一后的错误类」：实体、约束名（ck_ 起头）与冲突列值齐全。 */
const expectCheckViolation = (
  error: unknown,
  entity: string,
  constraintName: RegExp,
  conflicts: ReadonlyArray<{ column: string; value: unknown }>
): void => {
  expect(error).toBeInstanceOf(RxDBCheckViolationError);
  const violation = error as RxDBCheckViolationError;
  expect(violation.entity).toBe(entity);
  expect(violation.constraint).toMatch(constraintName);
  expect(violation.conflicts).toEqual(expect.arrayContaining([...conflicts]));
  expect(violation.message).toContain(entity);
  expect(violation.message).toContain(violation.constraint);
};

export const runCheckConstraintWriteBehaviorSuite = ({ factory }: { factory: CheckConstraintSuiteFactory }): void => {
  describe(`CHECK 违约写入被拒（${factory.name}）`, () => {
    it('AC#1：属性级 CHECK 拒绝越界值，归一错误带约束名与冲突值', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'check-ac1', entities: checkConstraintFixtures });
      try {
        const ok = new CheckQtyItem({ qty: 100 });
        await rxdb.entityManager.save(ok);
        const bad = new CheckQtyItem({ qty: 101 });
        try {
          await rxdb.entityManager.save(bad);
          expect.unreachable('越界写入应当被 CHECK 拒绝');
        } catch (error) {
          expectCheckViolation(error, 'CheckQtyItem', /^ck_CheckQtyItem_qty_[0-9a-f]{8}$/, [
            { column: 'qty', value: 101 }
          ]);
        }
      } finally {
        await dispose();
      }
    });

    it('AC#2：实体级 CHECK「两字段二选一」同时给值即拒绝；恰好一项放行', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'check-ac2', entities: checkConstraintFixtures });
      try {
        const onlyQty = new CheckXorItem({ qty: 1, qtyFormula: null });
        await rxdb.entityManager.save(onlyQty);
        const onlyFormula = new CheckXorItem({ qty: null, qtyFormula: 'f' });
        await rxdb.entityManager.save(onlyFormula);
        const both = new CheckXorItem({ qty: 2, qtyFormula: 'f2' });
        try {
          await rxdb.entityManager.save(both);
          expect.unreachable('两字段同时给值应当被 CHECK 拒绝');
        } catch (error) {
          expectCheckViolation(error, 'CheckXorItem', /^ck_CheckXorItem_qty_xor_formula_[0-9a-f]{8}$/, [
            { column: 'qty', value: 2 },
            { column: 'qtyFormula', value: 'f2' }
          ]);
        }
      } finally {
        await dispose();
      }
    });

    it('AC#8：unitFrom > unitTo 拒绝；unitFrom 为 NULL 放行（SQL 三值逻辑）', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'check-ac8', entities: checkConstraintFixtures });
      try {
        const ok = new CheckRangeItem({ unitFrom: 1, unitTo: 2 });
        await rxdb.entityManager.save(ok);
        const inverted = new CheckRangeItem({ unitFrom: 3, unitTo: 2 });
        try {
          await rxdb.entityManager.save(inverted);
          expect.unreachable('unitFrom > unitTo 应当被 CHECK 拒绝');
        } catch (error) {
          expectCheckViolation(error, 'CheckRangeItem', /^ck_CheckRangeItem_unit_range_[0-9a-f]{8}$/, [
            { column: 'unitFrom', value: 3 },
            { column: 'unitTo', value: 2 }
          ]);
        }
        // NULL 端点按三值逻辑放行（结果 unknown 即 CHECK 通过），两后端一致
        const nullFrom = new CheckRangeItem({ unitFrom: null, unitTo: 0 });
        await rxdb.entityManager.save(nullFrom);
        const nullTo = new CheckRangeItem({ unitFrom: null, unitTo: null });
        await rxdb.entityManager.save(nullTo);
      } finally {
        await dispose();
      }
    });

    it('AC#8 补充：UPDATE 扩成 unitFrom > unitTo 同样被拒', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'check-ac8-update', entities: checkConstraintFixtures });
      try {
        const item = new CheckRangeItem({ unitFrom: 1, unitTo: 5 });
        await rxdb.entityManager.save(item);
        item.unitFrom = 6;
        try {
          await rxdb.entityManager.save(item);
          expect.unreachable('UPDATE 扩成 unitFrom > unitTo 应当被 CHECK 拒绝');
        } catch (error) {
          expectCheckViolation(error, 'CheckRangeItem', /^ck_CheckRangeItem_unit_range_[0-9a-f]{8}$/, [
            { column: 'unitFrom', value: 6 },
            { column: 'unitTo', value: 5 }
          ]);
        }
      } finally {
        await dispose();
      }
    });
  });
};
