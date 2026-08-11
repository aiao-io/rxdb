/**
 * 简化的 undo 测试
 */
import { RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

describe('simple undo test', () => {
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
    db.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  it('should undo a single todo creation', async () => {
    const todo = new Todo();
    todo.title = 'test-undo';
    await todo.save();

    const todoRepo = adapter.getRepository(Todo);
    let todos = await todoRepo.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);

    const changeRepo = adapter.getRepository(RxDBChange);
    const changes = await changeRepo.find({ where: { combinator: 'and', rules: [] } });
    expect(changes.length).toBe(1);

    await rxdb.versionManager.history().undo();

    todos = await todoRepo.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(0);
  });
});
