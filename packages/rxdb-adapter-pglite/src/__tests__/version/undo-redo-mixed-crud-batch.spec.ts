import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 批量混合 CRUD 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - 批量混合 CRUD', () => {
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

  it('批量混合操作 → 全部 undo → 全部 redo', async () => {
    const todoRepository = adapter.getRepository(Todo);

    // 顺序 create 3 个（避免并行竞态）
    const todo1 = await Object.assign(new Todo(), { title: 'a' }).save();
    const todo2 = await Object.assign(new Todo(), { title: 'b' }).save();
    const todo3 = await Object.assign(new Todo(), { title: 'c' }).save();

    // 顺序 update 2 个
    todo1.title = 'a-updated';
    await todo1.save();
    todo2.title = 'b-updated';
    await todo2.save();

    // 顺序 delete 2 个
    await todo1.remove();
    await todo3.remove();

    let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(1);
    expect(savedTodos[0].title).toBe('b-updated');

    // Undo 7 步：2 delete + 2 update + 3 create
    // PGlite 需要逐步调用，undo(n) 行为与 SQLite 不一致
    for (let i = 0; i < 7; i++) {
      await rxdb.versionManager.history().undo();
    }

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(0);

    // Redo 全部 7 步
    // PGlite 需要逐步调用
    for (let i = 0; i < 7; i++) {
      await rxdb.versionManager.history().redo();
    }

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(1);
    expect(savedTodos[0].title).toBe('b-updated');
  });
});
