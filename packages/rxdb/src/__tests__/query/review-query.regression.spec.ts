import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import mergeRemove from '../../query/merge_remove.js';
import mergeUpdate from '../../query/merge_update.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type { RxDBEntityLocalRemovedEventData, RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import { compactChanges } from '../../sync-contract/compact-changes.js';
import type { IRxDBChange } from '../../system/system.interface.js';
import { createHarnessQueryTask, type HarnessTaskOptions } from '../fixtures/query-task-harness.js';

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
const remove = (id: string): RxDBEntityLocalRemovedEventData<typeof ReviewEntity> => ({
  type: 'DELETE',
  namespace: 'review',
  entity: 'ReviewEntity',
  id,
  entityType: ReviewEntity,
  recordAt: new Date(0),
  patch: null,
  inversePatch: { id }
});

describe('review query regression probes', () => {
  it.each(['find', 'findOne', 'findByCursor'] as const)(
    'Q1 %s should refresh when a matching outside row moves before the current first row',
    type => {
      const task = createHarnessQueryTask(ReviewEntity, {
        type,
        options: { where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'score', sort: 'asc' }], limit: 1 },
        runner: () => of(type === 'findOne' ? { id: 'a', score: 10 } : [{ id: 'a', score: 10 }])
      } as unknown as HarnessTaskOptions<
        typeof ReviewEntity,
        { id: string; score: number } | { id: string; score: number }[]
      >);
      const subscription = task.result$.subscribe();
      const refresh = vi.spyOn(task, 'refresh');
      try {
        mergeUpdate(task as QueryTask<typeof ReviewEntity>, [update('b', { score: 5 }, { score: 20 })]);
        expect(refresh).toHaveBeenCalled();
      } finally {
        subscription.unsubscribe();
      }
    }
  );

  it('Q2 should refresh an offset page when a row before that page is deleted', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'find',
      options: {
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'id', sort: 'asc' }],
        offset: 1,
        limit: 1
      },
      runner: () => of([{ id: 'b' }])
    });
    const subscription = task.result$.subscribe();
    const refresh = vi.spyOn(task, 'refresh');
    try {
      mergeRemove(task as QueryTask<typeof ReviewEntity>, [remove('a')]);
      expect(refresh).toHaveBeenCalled();
    } finally {
      subscription.unsubscribe();
    }
  });

  it('Q3 should preserve the final delete for a remote row deleted, recreated and deleted offline', () => {
    const changes = [
      { id: 1, type: 'DELETE', patch: null, inversePatch: { id: 'a', name: 'remote' } },
      { id: 2, type: 'INSERT', patch: { id: 'a', name: 'local recreation' }, inversePatch: null },
      { id: 3, type: 'DELETE', patch: null, inversePatch: { id: 'a', name: 'local recreation' } }
    ].map(change => ({
      ...change,
      namespace: 'review',
      entity: 'ReviewEntity',
      entityId: 'a',
      createdAt: new Date(0),
      updatedAt: new Date(0)
    })) as IRxDBChange[];
    const actions = compactChanges(changes);
    expect(actions.deletes.size).toBe(1);
  });

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
