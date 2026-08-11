import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * DELETE 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - DELETE 操作', () => {
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
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  it('create → delete → undo → redo', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 创建数据
    const todo = new Todo();
    todo.title = 'test-todo';
    await todo.save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('test-todo');

    // 删除数据
    await todo.remove();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // Undo delete: 恢复数据
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('test-todo');

    // Redo delete: 再次删除
    await rxdb.versionManager.history().redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);
  });
});
