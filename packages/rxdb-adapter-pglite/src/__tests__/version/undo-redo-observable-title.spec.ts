import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - Observable 观察 title 变化', () => {
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

  it('观察 title 值变化：更新 → undo → redo', async () => {
    // 1. 先创建初始数据（在订阅之前）
    const todo = new Todo();
    todo.title = 'Version 1';
    todo.completed = false;
    await todo.save();

    // 等待初始数据稳定
    await new Promise(resolve => setTimeout(resolve, 100));

    // 2. 更新 title
    todo.title = 'Version 2';
    await todo.save();

    // 验证更新后的状态
    let todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('Version 2');

    // 3. Undo：撤销更新
    await rxdb.versionManager.history().undo();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证 Undo 后的状态
    todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('Version 1');

    // 4. Redo：恢复更新
    await rxdb.versionManager.history().redo();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证 Redo 后的状态
    todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('Version 2');
  });
});
