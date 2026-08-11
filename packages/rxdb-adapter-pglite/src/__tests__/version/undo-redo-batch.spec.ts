import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * 批量创建操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - 批量创建', () => {
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

  it('Promise.all 批量保存 → 撤销 → 重做', async () => {
    const todoRepository = adapter.getRepository(Todo);
    const history = rxdb.versionManager.history();

    await Promise.all([
      Object.assign(new Todo(), { title: 'batch-1' }).save(),
      Object.assign(new Todo(), { title: 'batch-2' }).save(),
      Object.assign(new Todo(), { title: 'batch-3' }).save()
    ]);

    let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(3);
    expect(savedTodos.map(t => t.title).sort()).toEqual(['batch-1', 'batch-2', 'batch-3']);

    // 撤销 3 步（PGlite 需要逐步调用，undo(n) 行为与 SQLite 不一致）
    await history.undo();
    await history.undo();
    await history.undo();

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(0);

    // 重做 3 步（PGlite 需要逐步调用）
    await history.redo();
    await history.redo();
    await history.redo();

    savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(savedTodos.length).toBe(3);
    expect(savedTodos.map(t => t.title).sort()).toEqual(['batch-1', 'batch-2', 'batch-3']);
  });
});
