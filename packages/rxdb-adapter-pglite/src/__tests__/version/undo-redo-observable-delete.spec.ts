import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - Observable 观察删除操作', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await db.getAdapter('pglite');
    await db.connect('pglite');
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('观察删除操作：创建 → 删除 → undo 恢复', async () => {
    // 1. 创建 todo
    const todo = new Todo();
    todo.title = 'To be deleted';
    todo.completed = false;
    await todo.save();

    // 验证创建后的状态
    let todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('To be deleted');

    // 2. 删除 todo
    await todos[0].remove();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证删除后的状态
    todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // 3. Undo：撤销删除，恢复 todo
    await rxdb.versionManager.history().undo();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证 Undo 后的状态
    todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('To be deleted');
  });
});
