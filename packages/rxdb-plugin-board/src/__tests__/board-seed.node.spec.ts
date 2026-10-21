import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { readFirst, whereEq } from '../query.js';
import {
  ISOLATION_BOARD_ID,
  RELEASE_BOARD_ID,
  seedReleaseBoardDataset
} from '../testing/release-board-dataset.js';

/**
 * 确定性种子（US-532 AC#1）：两个全新内存库装载同一份种子，
 * 五张业务表按主键排序后逐字节相同，ID 与审计时间固定；零随机、零 `Date.now()`。
 */
describe('release-board-dataset 确定性种子（US-532 AC#1）', () => {
  const instances: RxDB[] = [];

  const createSeeded = async (): Promise<RxDB> => {
    const rxdb = new RxDB({
      dbName: `board-seed-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    await seedReleaseBoardDataset(rxdb);
    instances.push(rxdb);
    return rxdb;
  };

  beforeEach(() => {
    void 0;
  });

  afterEach(async () => {
    for (const rxdb of instances.splice(0)) {
      await rxdb.disconnectAll().catch(() => undefined);
    }
  });

  /** 五张业务表按主键排序后的原始行快照（物理表 = schema "board" + 逻辑表名）。 */
  const businessSnapshot = async (rxdb: RxDB): Promise<Record<string, unknown>> => {
    const adapter = await firstValueFrom(rxdb.localAdapter$);
    const snapshot: Record<string, unknown> = {};
    for (const table of ['board', 'column', 'task', 'board_label', 'task_label']) {
      const raw = await adapter.rawQuery(`SELECT * FROM "board"."${table}" ORDER BY id`);
      snapshot[table] = raw.rows;
    }
    return snapshot;
  };

  it('两次装载的五张业务表逐字节相同，ID 与审计时间固定', async () => {
    const first = await createSeeded();
    const second = await createSeeded();

    const a = await businessSnapshot(first);
    const b = await businessSnapshot(second);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    // 主板 4 列 12 任务（5 / 4 / 3 / 0），隔离板 1 列 8 任务
    const columns = await readFirst(first.entityManager.getRepository(Column).find({ where: whereEq('boardId', RELEASE_BOARD_ID) }));
    expect(columns.map(column => column.title)).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    const tasksByColumn = new Map<string, number>();
    for (const column of columns) {
      tasksByColumn.set(column.id, (await readFirst(first.entityManager.getRepository(Task).find({ where: whereEq('columnId', column.id) }))).length);
    }
    expect([...tasksByColumn.values()]).toEqual([5, 4, 3, 0]);
    const isolationTasks = await readFirst(
      first.entityManager.getRepository(Task).find({ where: whereEq('columnId', 'c0000000-0000-4000-8000-000000000005') })
    );
    expect(isolationTasks).toHaveLength(8);

    // 主板至少 6 条任务含「同步」（板内分页超过一页的搜索验收前置）
    const allReleaseTasks = await readFirst(
      first.entityManager.getRepository(Task).find({ where: { combinator: 'and', rules: [{ field: 'columnId', operator: 'in', value: [...columns.map(c => c.id)] }] } })
    );
    const withSync = allReleaseTasks.filter(task => `${task.title}${task.description ?? ''}`.includes('同步'));
    expect(withSync.length).toBeGreaterThanOrEqual(6);
    // 隔离板全部含「同步」且数量超过一页
    expect(isolationTasks.every(task => task.title.includes('同步'))).toBe(true);
    expect(isolationTasks.length).toBeGreaterThan(5);
    expect(ISOLATION_BOARD_ID).not.toBe(RELEASE_BOARD_ID);
  });
});
