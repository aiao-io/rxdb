import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('RxDBAdapterPGlite - liveQuery', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: `live-query-test-${Date.now()}`,
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    db.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('应在数据变更时收到新的结果', async () => {
    const handle = await adapter.liveQuery<{ total: number }>(
      'SELECT count(*)::int AS total FROM "public"."todos" WHERE completed = $1',
      [false]
    );

    const initialTotal = handle.initialResults.rows[0]?.total ?? 0;

    const results: number[] = [];
    handle.subscribe(res => {
      const total = res.rows[0]?.total ?? 0;
      results.push(total);
    });

    const todoRepo = adapter.getRepository(Todo);
    const firstTodo = new Todo();
    firstTodo.title = 'live-a';
    firstTodo.completed = false;
    const secondTodo = new Todo();
    secondTodo.title = 'live-b';
    secondTodo.completed = false;
    await todoRepo.create(firstTodo);
    await todoRepo.create(secondTodo);

    // live 插件异步推送，等待一轮事件循环 + 触发器批次
    await new Promise(r => setTimeout(r, 100));

    expect(results.length).toBeGreaterThanOrEqual(1);
    const last = results[results.length - 1];
    expect(last).toBe(initialTotal + 2);

    await handle.unsubscribe();
  });
});
