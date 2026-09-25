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

  it('Q6 should keep the page tail put when a matching row is created inside the window', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'findByCursor',
      options: {
        where: { combinator: 'and', rules: [] },
        limit: 2,
        orderBy: [{ field: 'id', sort: 'asc' }]
      },
      runner: () => of([{ id: 'b' }, { id: 'c' }])
    });
    const subscription = task.result$.subscribe();
    try {
      mergeCreate(task as QueryTask<typeof ReviewEntity>, [create('a')]);
      // 与 Q4 成对：那条插在页尾之后（属于下一页，裁掉），这条插在窗口之内。
      // 页内插入必须让本页变长而不是把页尾的 c 挤走——c 正是下一页 `after` 游标指着的那一行，
      // 挤走它下一页就会重锚到 b，夹在 b 与 c 之间的行凭空消失。见 FindByCursorOptions.limit。
      expect(task.result).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('Q7 should still clip to limit when the created rows only extend the open end', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'findByCursor',
      options: {
        where: { combinator: 'and', rules: [] },
        limit: 2,
        orderBy: [{ field: 'id', sort: 'asc' }]
      },
      runner: () => of([{ id: 'a' }])
    });
    const subscription = task.result$.subscribe();
    try {
      mergeCreate(task as QueryTask<typeof ReviewEntity>, [create('b'), create('c'), create('d')]);
      // 未满的一页（SQL 只给回 1 条）尾端是敞开的，新行往尾端堆时仍然按 limit 收口，
      // 否则持续插入会让这一页无限膨胀——Q4/Q6 保的是「原有行不被裁掉」，不是「不再裁剪」。
      expect(task.result).toEqual([{ id: 'a' }, { id: 'b' }]);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('Q10 should re-clip a grown cursor page to limit once a SQL refresh lands', () => {
    // runner 按 SQL 语义出页：数据源已按 id 升序，取前 limit 条
    const rows = [{ id: 'b' }, { id: 'c' }];
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'findByCursor',
      options: {
        where: { combinator: 'and', rules: [] },
        limit: 2,
        orderBy: [{ field: 'id', sort: 'asc' }]
      },
      runner: () => of(rows.slice(0, 2))
    });
    const subscription = task.result$.subscribe();
    try {
      rows.unshift({ id: 'a' });
      mergeCreate(task as QueryTask<typeof ReviewEntity>, [create('a')]);
      expect(task.result?.map(entity => entity.id)).toEqual(['a', 'b', 'c']);

      // 接着 Q6：涨出来的那一行只活在 JS 增量里。之后任何一次回 SQL（这里是 UPDATE 命中页内的 b）
      // 都整页重裁回 limit，页尾从 c 内移到 b，c 既不在本页、也不在锚着 `after c` 的下一页里。
      // 这是契约不是缺陷：页尾本来就会随重排、删除、回 SQL 的 CREATE 移动，链式分页的消费者
      // 必须在页尾变化时重锚下一页（三端 infinite scroll 的 commitPage 即如此）。见 FindByCursorOptions.limit。
      mergeUpdate(task as QueryTask<typeof ReviewEntity>, [update('b', { title: 'B' }, { title: 'b' })]);
      expect(task.result?.map(entity => entity.id)).toEqual(['a', 'b']);
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

  // Q6/Q7 已经被上面 findByCursor 的页窗口回归占用，REMOVE/UPDATE 的对应回归改用 Q8/Q9。
  it('Q8 should refresh instead of decrementing a count whose snapshot may already exclude the row', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'count',
      options: { where: { combinator: 'and', rules: [] } },
      runner: () => of(1)
    });
    const subscription = task.result$.subscribe();
    const refresh = vi.spyOn(task, 'refresh');
    try {
      // 快照（1）已经不含 'a'——它先于这条 DELETE 事件被别的路径（例如同一事件的
      // 重复派发）计入。旧实现按 `current_count - matched.length` 在 JS 侧减,
      // 会把本该保持不变的 1 减成 0。
      mergeRemove(task as QueryTask<typeof ReviewEntity>, [remove('a')]);
      expect(refresh).toHaveBeenCalled();
      expect(task.result).toBe(1);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('Q9 should refresh instead of incrementing a count whose snapshot may already include the newly matching row', () => {
    const task = createHarnessQueryTask(ReviewEntity, {
      type: 'count',
      options: { where: { combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'active' }] } },
      runner: () => of(1)
    });
    const subscription = task.result$.subscribe();
    const refresh = vi.spyOn(task, 'refresh');
    try {
      // 快照（1）已经把 'a' 的 inactive -> active 计进去了,这条 UPDATE 事件是姗姗来迟的
      // 重复派发。旧实现按 `newlyMatchedIds` 在 JS 侧加,会把本该保持不变的 1 加成 2。
      mergeUpdate(task as QueryTask<typeof ReviewEntity>, [update('a', { status: 'active' }, { status: 'inactive' })]);
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
