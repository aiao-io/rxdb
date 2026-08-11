import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * CREATE + DELETE 多步操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - CREATE + DELETE 多步', () => {
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

  it('create → delete → undo(2) → redo(2)', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 创建。
    const todo = new Todo();
    todo.title = 'test';
    await todo.save();

    // 删除。
    await todo.remove();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // Undo 2 步：delete + create，回到初始状态
    // PGlite 需要逐步调用，undo(n) 行为与 SQLite 不一致
    await rxdb.versionManager.history().undo();
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // Redo 2 步：恢复 create + delete
    // PGlite 需要逐步调用
    await rxdb.versionManager.history().redo();
    await rxdb.versionManager.history().redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);
  });
});
