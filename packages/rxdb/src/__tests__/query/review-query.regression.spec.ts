import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import mergeCreate from '../../query/merge_create.js';
import mergeRemove from '../../query/merge_remove.js';
import mergeUpdate from '../../query/merge_update.js';
import { QueryTask } from '../../repository/QueryTask.js';
import type {
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '../../rxdb-events.js';
import { compactChanges } from '../../sync-contract/compact-changes.js';
import type { IRxDBChange } from '../../system/system.interface.js';
import { createHarnessQueryTask, type HarnessTaskOptions } from '../../testing/query-task-harness.js';

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

const create = (id: string): RxDBEntityLocalCreatedEventData<typeof ReviewEntity> => ({
  type: 'INSERT',
  namespace: 'review',
  entity: 'ReviewEntity',
  id,
  entityType: ReviewEntity,
  recordAt: new Date(0),
  patch: { id },
  inversePatch: null
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

  it('Q4 should keep the cursor page within limit when a matching row is created', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'findByCursor',
      options: {
        where: { combinator: 'and', rules: [] },
        limit: 2,
        orderBy: [{ field: 'id', sort: 'asc' }]
      },
      runner: () => of([{ id: 'a' }, { id: 'b' }])
    });
    const subscription = task.result$.subscribe();
    try {
      mergeCreate(task as QueryTask<typeof ReviewEntity>, [create('c')]);
      expect(task.result).toEqual([{ id: 'a' }, { id: 'b' }]);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('Q5 should refresh instead of incrementing a count whose snapshot may already include the row', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'count',
      options: { where: { combinator: 'and', rules: [] } },
      runner: () => of(1)
    });
    const subscription = task.result$.subscribe();
    const refresh = vi.spyOn(task, 'refresh');
    try {
      mergeCreate(task as QueryTask<typeof ReviewEntity>, [create('a')]);
      expect(refresh).toHaveBeenCalled();
      expect(task.result).toBe(1);
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
});
