import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * 混合 CRUD 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - 混合 CRUD', () => {
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

  it('create → update → delete → undo all → redo all', async () => {
    const todoRepository = adapter.getRepository(Todo);
    const history = rxdb.versionManager.history();

    // 1. 创建。
    const todo = new Todo();
    todo.title = 'original';
    await todo.save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('original');

    // 2. 更新。
    todo.title = 'updated';
    await todo.save();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].title).toBe('updated');

    // 3. 删除。
    await todo.remove();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // 撤销删除。
    await history.undo();
    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('updated');

    // 撤销更新。
    await history.undo();
    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('original');

    // 撤销创建。
    await history.undo();
    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // 重做创建。
    await history.redo();
    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('original');

    // 重做更新。
    await history.redo();
    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos[0].title).toBe('updated');

    // 重做删除。
    await history.redo();
    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);
  });
});
