/**
 * @fileoverview 区间排他的写入行为契约套件（US-030 阶段 C）。
 *
 * SQLite family（触发器）与 PGlite（`EXCLUDE USING gist`）各跑一份，断言归一后的同一个错误类
 * `RxDBExclusionViolationError` 与同样的落库行为：
 * - AC#4：同一相等键插入重叠区间被拒，错误给出双方区间；不同相等键互不影响；
 * - AC#13：两维同时相交才算冲突；整数 `[]` 维相邻（136 / 137）放行；日期 `[)` 维首尾相接放行；
 *   NULL 端点按无界比较；倒置区间当空区间、不与任何行冲突；
 * - AC#12：UPDATE 扩成与他行重叠被拒（SQLite 的 UPDATE 路径同样设防）；只在自身范围内扩区间放行；
 * - 批量写入：同一批「截旧 + 新开」「删旧 + 新增」不经过重叠的中间态；
 * - AC#14：「截旧 + 新开」同一事务写入后 undo 再 redo、经分支切换重放，均不被误拒，终态与直接写入一致。
 */

import {
  MAIN_BRANCH_ID,
  RxDBExclusionViolationError,
  type ExclusionRangeConflict,
  type RxDB,
  type RxDBAdapterLocalBase
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { exclusionFixtures, ExclusionOccurrence, ExclusionSegment } from './fixtures.js';
import type {
  CheckConstraintSuiteDatabase,
  CheckConstraintSuiteFactory,
  CheckConstraintSuiteVersionManager
} from './types.js';

const day = (month: number, date: number): Date => new Date(Date.UTC(2026, month - 1, date));

/** 断言「归一后的错误类」：实体、约束名（ex_ 起头）齐全；给了 ranges 时逐维比对双方区间。 */
const expectExclusionViolation = (
  error: unknown,
  entity: string,
  constraintName: RegExp,
  ranges?: ReadonlyArray<ExclusionRangeConflict>
): RxDBExclusionViolationError => {
  expect(error).toBeInstanceOf(RxDBExclusionViolationError);
  const violation = error as RxDBExclusionViolationError;
  expect(violation.entity).toBe(entity);
  expect(violation.constraint).toMatch(constraintName);
  expect(violation.message).toContain(entity);
  expect(violation.message).toContain(violation.constraint);
  if (ranges) expect(violation.ranges).toEqual(ranges);
  return violation;
};

const OCCURRENCE_CONSTRAINT = /^ex_ExclusionOccurrence_occurrence_no_overlap_[0-9a-f]{8}$/;
const SEGMENT_CONSTRAINT = /^ex_ExclusionSegment_segment_no_overlap_[0-9a-f]{8}$/;

const occurrence = (init: Partial<ExclusionOccurrence>): ExclusionOccurrence =>
  new ExclusionOccurrence({
    effectiveFrom: null,
    effectiveTo: null,
    unitFrom: null,
    unitTo: null,
    ...init
  } as ExclusionOccurrence);

/** AC#14 的用例按 `history: true` 建库，runner 必须交回 versionManager。 */
const versionManagerOf = (database: CheckConstraintSuiteDatabase): CheckConstraintSuiteVersionManager => {
  if (!database.versionManager) {
    throw new Error('runner 没有按 history: true 交回 versionManager（须先装 @aiao/rxdb-plugin-history）');
  }
  return database.versionManager;
};

const localAdapterOf = async (rxdb: RxDB): Promise<RxDBAdapterLocalBase> =>
  (await rxdb.getAdapter(rxdb.config.sync.local!.adapter)) as unknown as RxDBAdapterLocalBase;

/** 某条线上的全部区间段，按起点排序（`[起点, 终点]`，`null` 即无界）。 */
const segmentsOf = async (rxdb: RxDB, lineId: string): Promise<Array<[number | null, number | null]>> => {
  const local = await localAdapterOf(rxdb);
  const rows = await local
    .getRepository(ExclusionSegment)
    .find({ where: { combinator: 'and', rules: [{ field: 'lineId', operator: '=', value: lineId }] } });
  return (rows as ExclusionSegment[])
    .map(
      row =>
        [row.effectiveFrom?.getTime() ?? null, row.effectiveTo?.getTime() ?? null] as [number | null, number | null]
    )
    .sort((a, b) => (a[0] ?? -Infinity) - (b[0] ?? -Infinity));
};

export const runExclusionWriteBehaviorSuite = ({ factory }: { factory: CheckConstraintSuiteFactory }): void => {
  describe(`区间排他（${factory.name}）`, () => {
    it('AC#4 / #13：两维同时相交才冲突，错误给出双方区间；相邻、无界、倒置与他键各按语义放行', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'exclusion-ac4', entities: exclusionFixtures });
      try {
        const save = (init: Partial<ExclusionOccurrence>) => rxdb.entityManager.save(occurrence(init));
        // A：日期 [01-01, 02-01)，序列 [100, 136]
        await save({ lineId: 'L1', effectiveFrom: day(1, 1), effectiveTo: day(2, 1), unitFrom: 100, unitTo: 136 });

        // AC#4：两维都相交（日期 [01-15, ∞) 与序列 [120, 200]）→ 拒绝，给出双方区间
        try {
          await save({ lineId: 'L1', effectiveFrom: day(1, 15), unitFrom: 120, unitTo: 200 });
          expect.unreachable('两维都相交的一行应当被排他拒绝');
        } catch (error) {
          expectExclusionViolation(error, 'ExclusionOccurrence', OCCURRENCE_CONSTRAINT, [
            {
              from: 'effectiveFrom',
              to: 'effectiveTo',
              bounds: '[)',
              incoming: [day(1, 15), null],
              existing: [day(1, 1), day(2, 1)]
            },
            { from: 'unitFrom', to: 'unitTo', bounds: '[]', incoming: [120, 200], existing: [100, 136] }
          ]);
        }

        // AC#13：整数 [] 维相邻（136 / 137）不相交 → 放行
        await save({ lineId: 'L1', effectiveFrom: day(1, 15), unitFrom: 137, unitTo: 200 });
        // 日期 [) 维首尾相接（A 止于 02-01、本行起于 02-01）不相交 → 放行
        await save({ lineId: 'L1', effectiveFrom: day(2, 1), effectiveTo: day(3, 1), unitFrom: 100, unitTo: 136 });
        // NULL 端点即无界：日期全无界、序列 (-∞, 99] 与已有各行的序列都不相交 → 放行
        await save({ lineId: 'L1', unitTo: 99 });
        // 倒置区间（起点晚于终点）当空区间，不与任何行冲突（要拒绝须另加 CHECK）→ 放行
        await save({ lineId: 'L1', effectiveFrom: day(3, 1), effectiveTo: day(1, 1), unitFrom: 100, unitTo: 136 });
        // 不同相等键互不影响
        await save({ lineId: 'L2', effectiveFrom: day(1, 15), unitFrom: 120, unitTo: 200 });

        // NULL 端点按无界参与冲突：日期 (-∞, 01-02) 与序列全无界 → 与 A 两维都相交 → 拒绝
        try {
          await save({ lineId: 'L1', effectiveTo: day(1, 2) });
          expect.unreachable('无界端点覆盖到已有行应当被排他拒绝');
        } catch (error) {
          expectExclusionViolation(error, 'ExclusionOccurrence', OCCURRENCE_CONSTRAINT);
        }
      } finally {
        await dispose();
      }
    });

    it('AC#12：UPDATE 扩成与他行重叠被拒；只在自身范围内扩区间、不碰他行放行', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'exclusion-ac12', entities: exclusionFixtures });
      try {
        const x = occurrence({ lineId: 'U', unitFrom: 1, unitTo: 5 });
        await rxdb.entityManager.save(x);
        await rxdb.entityManager.save(occurrence({ lineId: 'U', unitFrom: 10, unitTo: 20 }));

        // 自身扩区间（[1, 5] → [1, 8]）不与自身旧值比，也不碰他行 → 放行
        x.unitTo = 8;
        await rxdb.entityManager.save(x);

        // 扩到与 [10, 20] 重叠 → 拒绝（SQLite 的 UPDATE 触发器同样设防）
        x.unitTo = 12;
        try {
          await rxdb.entityManager.save(x);
          expect.unreachable('UPDATE 扩成与他行重叠应当被排他拒绝');
        } catch (error) {
          const violation = expectExclusionViolation(error, 'ExclusionOccurrence', OCCURRENCE_CONSTRAINT);
          // 区间端点为空（全无界）的日期维与序列维都参与比较；序列维给出双方区间
          expect(violation.ranges.find(range => range.from === 'unitFrom')).toEqual({
            from: 'unitFrom',
            to: 'unitTo',
            bounds: '[]',
            incoming: [1, 12],
            existing: [10, 20]
          });
        }
      } finally {
        await dispose();
      }
    });

    it('批量写入：同一批「截旧 + 新开」与「删旧 + 新增」不经过重叠的中间态', async () => {
      const { rxdb, dispose } = await factory.createDatabase({
        dbName: 'exclusion-batch',
        entities: exclusionFixtures
      });
      try {
        const current = new ExclusionSegment({ lineId: 'B', effectiveFrom: day(1, 1), effectiveTo: null });
        await rxdb.entityManager.save(current);

        // 截旧 + 新开：一次 saveMany（更新 + 创建）
        current.effectiveTo = day(6, 1);
        const next = new ExclusionSegment({ lineId: 'B', effectiveFrom: day(6, 1), effectiveTo: null });
        await rxdb.entityManager.saveMany([current, next]);
        expect(await segmentsOf(rxdb, 'B')).toEqual([
          [day(1, 1).getTime(), day(6, 1).getTime()],
          [day(6, 1).getTime(), null]
        ]);

        // 删旧 + 新增覆盖同一区间：一次 mutations（删除 + 创建）
        const replacement = new ExclusionSegment({ lineId: 'B', effectiveFrom: day(6, 1), effectiveTo: null });
        await rxdb.entityManager.mutations({
          create: new Map([[ExclusionSegment, new Set([replacement])]]),
          update: new Map(),
          remove: new Map([[ExclusionSegment, new Set([next])]])
        });
        expect(await segmentsOf(rxdb, 'B')).toEqual([
          [day(1, 1).getTime(), day(6, 1).getTime()],
          [day(6, 1).getTime(), null]
        ]);
      } finally {
        await dispose();
      }
    });

    it('AC#14：「截旧 + 新开」同一事务写入后 undo 再 redo，不被排他误拒，终态与直接写入一致', async () => {
      const database = await factory.createDatabase({
        dbName: 'exclusion-ac14-history',
        entities: exclusionFixtures,
        history: true
      });
      const { rxdb, dispose } = database;
      const versionManager = versionManagerOf(database);
      try {
        const current = new ExclusionSegment({ lineId: 'H', effectiveFrom: day(1, 1), effectiveTo: null });
        await rxdb.entityManager.save(current);
        // 同一事务（一个历史条目）里先截旧、后新开——直接写入的合法顺序
        const local = await localAdapterOf(rxdb);
        await local.transaction(async executor => {
          current.effectiveTo = day(6, 1);
          await executor.saveMany([current]);
          await executor.saveMany([new ExclusionSegment({ lineId: 'H', effectiveFrom: day(6, 1), effectiveTo: null })]);
        });
        const written = [
          [day(1, 1).getTime(), day(6, 1).getTime()],
          [day(6, 1).getTime(), null]
        ];
        expect(await segmentsOf(rxdb, 'H')).toEqual(written);

        await versionManager.history().undo();
        expect(await segmentsOf(rxdb, 'H')).toEqual([[day(1, 1).getTime(), null]]);

        // redo 一次重放整组：先插新行、后截旧行就会经过重叠的中间态
        await versionManager.history().redo();
        expect(await segmentsOf(rxdb, 'H')).toEqual(written);
      } finally {
        await dispose();
      }
    });

    it('AC#14：经分支切换重放同一组变更，不被排他误拒，终态与直接写入一致', async () => {
      const database = await factory.createDatabase({
        dbName: 'exclusion-ac14-branch',
        entities: exclusionFixtures,
        history: true
      });
      const { rxdb, dispose } = database;
      const versionManager = versionManagerOf(database);
      try {
        const current = new ExclusionSegment({ lineId: 'S', effectiveFrom: day(1, 1), effectiveTo: null });
        await rxdb.entityManager.save(current);
        await versionManager.createBranch('exclusion_replay');
        await versionManager.switchBranch('exclusion_replay');

        current.effectiveTo = day(6, 1);
        await rxdb.entityManager.save(current);
        await rxdb.entityManager.save(
          new ExclusionSegment({ lineId: 'S', effectiveFrom: day(6, 1), effectiveTo: null })
        );
        const written = [
          [day(1, 1).getTime(), day(6, 1).getTime()],
          [day(6, 1).getTime(), null]
        ];
        expect(await segmentsOf(rxdb, 'S')).toEqual(written);

        await versionManager.switchBranch(MAIN_BRANCH_ID);
        expect(await segmentsOf(rxdb, 'S')).toEqual([[day(1, 1).getTime(), null]]);

        // 切回来一次重放两条变更（插入新行 + 截短旧行）
        await versionManager.switchBranch('exclusion_replay');
        expect(await segmentsOf(rxdb, 'S')).toEqual(written);
      } finally {
        await dispose();
      }
    });

    it('AC#14 边界：两行互换区间无论什么顺序都要经过重叠，仍被拒（不放宽约束）', async () => {
      const { rxdb, dispose } = await factory.createDatabase({ dbName: 'exclusion-swap', entities: exclusionFixtures });
      try {
        const first = new ExclusionSegment({ lineId: 'W', effectiveFrom: day(1, 1), effectiveTo: day(2, 1) });
        const second = new ExclusionSegment({ lineId: 'W', effectiveFrom: day(2, 1), effectiveTo: day(3, 1) });
        await rxdb.entityManager.saveMany([first, second]);
        first.effectiveFrom = day(2, 1);
        first.effectiveTo = day(3, 1);
        second.effectiveFrom = day(1, 1);
        second.effectiveTo = day(2, 1);
        const error = await rxdb.entityManager.saveMany([first, second]).catch((cause: unknown) => cause);
        expectExclusionViolation(error, 'ExclusionSegment', SEGMENT_CONSTRAINT);
      } finally {
        await dispose();
      }
    });
  });
};
