/**
 * @fileoverview 代码评审提出的树查询合并回归探针。
 *
 * @remarks
 * 随 US-025 阶段 E 从核心的 `__tests__/query/review-query.regression.spec.ts` 搬来 ——
 * 那份 spec 的 Q1〜Q3 探的是通用查询类型，留在核心；Q4 探的是 `countDescendants`，
 * 跟着树进插件。放在核心已经证不了任何东西：核心的 merge 不再认识这个任务类型，
 * 「结果不变」会无条件成立，断言变成恒真。
 */
import { ENTITY_STATIC_TYPES, QueryTask, type RxDBEntityLocalUpdatedEventData } from '@aiao/rxdb';
import { createHarnessQueryTask } from '@aiao/rxdb/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { merge_update as mergeUpdate } from '../../query/merge_update.js';

class ReviewEntity {
  [key: string]: unknown;
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id = '';
}

const update = (
  id: string,
  patch: Record<string, unknown>,
  inversePatch: Record<string, unknown>
): RxDBEntityLocalUpdatedEventData<typeof ReviewEntity> => ({
  type: 'UPDATE',
  namespace: 'review',
  entity: 'ReviewEntity',
  id,
  entityType: ReviewEntity,
  recordAt: new Date(0),
  patch: { id, ...patch },
  inversePatch: { id, ...inversePatch }
});

describe('review query regression probes - 树查询', () => {
  it('Q4 countDescendants level 0 should ignore direct-child where transitions', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'countDescendants',
      options: {
        entityId: 'root',
        level: 0,
        where: { combinator: 'and', rules: [{ field: 'active', operator: '=', value: true }] }
      },
      runner: () => of(0)
    });
    const subscription = task.result$.subscribe();
    try {
      mergeUpdate(task as unknown as QueryTask<typeof ReviewEntity>, [
        update('child', { parentId: 'root', active: true }, { parentId: 'root', active: false })
      ]);
      expect(task.result).toBe(0);
    } finally {
      subscription.unsubscribe();
    }
  });
});
