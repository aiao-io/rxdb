import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - 来回切换 completed 状态 - Test 2', () => {
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

  it('completed 状态变化 → undo → redo', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 创建初始 todo
    const todo = new Todo();
    todo.title = 'Observable Test Todo';
    todo.completed = false;
    await todo.save();

    // 验证初始状态
    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].completed).toBe(false);

    // 标记为完成
    todo.completed = true;
    await todo.save();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].completed).toBe(true);

    // 标记为未完成
    todo.completed = false;
    await todo.save();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].completed).toBe(false);

    // Undo: 恢复到 true
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].completed).toBe(true);

    // Undo: 恢复到 false
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].completed).toBe(false);

    // Redo: 重做到 true
    await rxdb.versionManager.history().redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].completed).toBe(true);
  });
});
