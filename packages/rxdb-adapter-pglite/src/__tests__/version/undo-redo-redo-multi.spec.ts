import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 多步 redo 操作测试
 */
describe('undoDatabase/redoDatabase - 多步 redo', () => {
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

  it('undo 全部后 redo 多步恢复', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 创建 3 个 todo
    await Object.assign(new Todo(), { title: 'todo-1' }).save();
    await Object.assign(new Todo(), { title: 'todo-2' }).save();
    await Object.assign(new Todo(), { title: 'todo-3' }).save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(3);

    // Undo 全部 3 步
    // PGlite 需要逐步调用，undo(n) 行为与 SQLite 不一致
    await rxdb.versionManager.history().undo();
    await rxdb.versionManager.history().undo();
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // Redo 2 步
    // PGlite 需要逐步调用
    await rxdb.versionManager.history().redo();
    await rxdb.versionManager.history().redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(2);
    expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);
  });
});
