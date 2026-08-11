import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 撤销单步操作的测试
 */
describe('undoDatabase/redoDatabase - 撤销一步', () => {
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

  it('多次操作中只撤销最后一次', async () => {
    const todoRepository = adapter.getRepository(Todo);

    await Object.assign(new Todo(), { title: 'todo-1' }).save();
    await Object.assign(new Todo(), { title: 'todo-2' }).save();
    await Object.assign(new Todo(), { title: 'todo-3' }).save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(3);

    // PGlite 使用 undo() 而非 undo(1)
    await rxdb.versionManager.history().undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(2);
    expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);
  });
});
