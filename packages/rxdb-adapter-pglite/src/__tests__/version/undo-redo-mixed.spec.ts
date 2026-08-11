import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * 混合操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - 混合操作', () => {
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

  it('单个 + 批量保存 → 撤销 → 重做', async () => {
    const todoRepository = adapter.getRepository(Todo);
    const history = rxdb.versionManager.history();

    await Object.assign(new Todo(), { title: 'single-1' }).save();

    await Promise.all([
      Object.assign(new Todo(), { title: 'batch-1' }).save(),
      Object.assign(new Todo(), { title: 'batch-2' }).save()
    ]);

    await Object.assign(new Todo(), { title: 'single-2' }).save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(4);

    // 撤销最后 3 个操作（逐个撤销）
    await history.undo();
    await history.undo();
    await history.undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('single-1');

    // 重做 2 个
    await history.redo();
    await history.redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(3);
    expect(todos.map(t => t.title).sort()).toEqual(['batch-1', 'batch-2', 'single-1']);
  });
});
