/**
 * @fileoverview 条件唯一索引的写入行为契约套件（US-030 阶段 B，AC#3）。
 *
 * SQLite family 与 PGlite 各跑一份：
 * - 不满足 `where` 的重复行不被唯一约束误拒；
 * - 满足 `where` 的重复行被拒，错误与既有唯一冲突同一口径（不新增错误类：PG `23505` /
 *   SQLite `UNIQUE constraint failed`）；
 * - UPDATE 把一行改成满足 `where` 而撞上已有行时同样被拒。
 */

import { describe, expect, it } from 'vitest';
import { ConditionalUniqueRevision, conditionalUniqueFixtures } from './fixtures.js';
import type { CheckConstraintSuiteFactory } from './types.js';

/** 与核心 `isUniqueConstraintViolation` 同一判据：PG `23505` 或两后端的原生唯一冲突文本（错误本身或其 cause）。 */
const isUniqueViolation = (error: unknown): boolean =>
  [error, (error as { cause?: unknown } | null)?.cause].some(candidate => {
    if ((candidate as { code?: unknown } | null)?.code === '23505') return true;
    const message = candidate instanceof Error ? candidate.message : String(candidate);
    return /UNIQUE constraint failed|duplicate key value violates unique constraint/i.test(message);
  });

export const runConditionalUniqueWriteBehaviorSuite = ({ factory }: { factory: CheckConstraintSuiteFactory }): void => {
  describe(`条件唯一索引（${factory.name}）`, () => {
    it('AC#3：不满足 where 的重复行不被误拒；满足 where 的重复行按唯一冲突拒绝', async () => {
      const { rxdb, dispose } = await factory.createDatabase({
        dbName: 'conditional-unique-ac3',
        entities: conditionalUniqueFixtures
      });
      try {
        await rxdb.entityManager.save(new ConditionalUniqueRevision({ itemId: 'item-1', state: 'draft' }));
        await rxdb.entityManager.save(new ConditionalUniqueRevision({ itemId: 'item-1', state: 'draft' }));
        await rxdb.entityManager.save(new ConditionalUniqueRevision({ itemId: 'item-1', state: 'released' }));
        // 另一物料的已发布修订互不影响
        await rxdb.entityManager.save(new ConditionalUniqueRevision({ itemId: 'item-2', state: 'released' }));
        const duplicate = new ConditionalUniqueRevision({ itemId: 'item-1', state: 'released' });
        try {
          await rxdb.entityManager.save(duplicate);
          expect.unreachable('同一物料第二个已发布修订应当被唯一约束拒绝');
        } catch (error) {
          expect(isUniqueViolation(error)).toBe(true);
        }
      } finally {
        await dispose();
      }
    });

    it('AC#3 补充：UPDATE 把草稿改成已发布而撞上已有已发布修订时同样被拒', async () => {
      const { rxdb, dispose } = await factory.createDatabase({
        dbName: 'conditional-unique-ac3-update',
        entities: conditionalUniqueFixtures
      });
      try {
        await rxdb.entityManager.save(new ConditionalUniqueRevision({ itemId: 'item-1', state: 'released' }));
        const draft = new ConditionalUniqueRevision({ itemId: 'item-1', state: 'draft' });
        await rxdb.entityManager.save(draft);
        draft.state = 'released';
        try {
          await rxdb.entityManager.save(draft);
          expect.unreachable('草稿改成已发布应当被唯一约束拒绝');
        } catch (error) {
          expect(isUniqueViolation(error)).toBe(true);
        }
      } finally {
        await dispose();
      }
    });
  });
};
