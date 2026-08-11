import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 复杂混合 CRUD 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - 复杂混合 CRUD', () => {
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

  it('create×2 → update×2 → delete×1 → 部分 undo/redo', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 创建 2 个
    const todo1 = await Object.assign(new Todo(), { title: 'todo-1' }).save();
    const todo2 = await Object.assign(new Todo(), { title: 'todo-2' }).save();

    // 更新 2 个
    todo1.title = 'updated-1';
    await todo1.save();
    todo2.title = 'updated-2';
    await todo2.save();

    // 删除 1 个
    await todo1.remove();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('updated-2');

    // Undo 1 步：撤销 DELETE todo1
    // 结果：todo1 恢复为 updated-1
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(2);
    expect(todos.map(t => t.title).sort()).toEqual(['updated-1', 'updated-2']);

    // Redo 1 步：重做 DELETE todo1
    // 结果：todo1 再次被删除
    await rxdb.versionManager.history().redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('updated-2');
  });
});
