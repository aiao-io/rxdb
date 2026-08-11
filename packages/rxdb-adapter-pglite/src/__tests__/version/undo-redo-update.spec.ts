import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * UPDATE 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - UPDATE 操作', () => {
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

  it('单个 update → undo → redo', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 创建初始数据
    const todo = new Todo();
    todo.title = 'v1';
    await todo.save();

    // 更新数据
    todo.title = 'v2';
    await todo.save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('v2');

    // Undo: v2 → v1
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('v1');

    // Redo: v1 → v2
    await rxdb.versionManager.history().redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('v2');
  });
});
