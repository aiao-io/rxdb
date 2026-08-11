import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * 批量 DELETE 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - 批量 DELETE', () => {
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

  it('批量 delete → undo → redo', async () => {
    const todoRepository = adapter.getRepository(Todo);
    const history = rxdb.versionManager.history();

    // 创建 3 个数据
    const todos = await Promise.all([
      Object.assign(new Todo(), { title: 'todo-1' }).save(),
      Object.assign(new Todo(), { title: 'todo-2' }).save(),
      Object.assign(new Todo(), { title: 'todo-3' }).save()
    ]);

    let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(3);

    // 批量删除
    await Promise.all(todos.map(todo => todo.remove()));

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(0);

    // Undo 3 个 delete（逐个撤销）
    await history.undo();
    await history.undo();
    await history.undo();

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(3);
    expect(savedTodos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2', 'todo-3']);

    // Redo 3 个 delete（逐个重做）
    await history.redo();
    await history.redo();
    await history.redo();

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(0);
  });
});
