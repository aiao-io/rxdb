import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * 撤销多步操作的测试
 */
describe('undoDatabase/redoDatabase - 撤销多步', () => {
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

  it('连续撤销多次操作', async () => {
    const todoRepository = adapter.getRepository(Todo);
    const history = rxdb.versionManager.history();

    for (let i = 1; i <= 5; i++) {
      await Object.assign(new Todo(), { title: `todo-${i}` }).save();
    }

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(5);

    // 撤销最后 3 个（逐个撤销）
    await history.undo();
    await history.undo();
    await history.undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(2);
    expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);

    // 再撤销 2 个
    await history.undo();
    await history.undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);

    // 重做 2 个
    await history.redo();
    await history.redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(2);
    expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);
  });
});
