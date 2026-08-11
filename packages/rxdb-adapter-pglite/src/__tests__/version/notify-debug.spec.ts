import { RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

describe('notify trigger debug', () => {
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

  it('should have notify_change function', async () => {
    const funcResult = await adapter.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname = 'notify_change'
    `);
    expect(funcResult.rows.length).toBeGreaterThan(0);
  });

  it('should trigger NOTIFY when inserting into RxDBChange', async () => {
    const todo = new Todo();
    todo.title = 'test';
    await todo.save();

    await new Promise(resolve => setTimeout(resolve, 1000));

    const changes = await adapter.getRepository(RxDBChange).find({
      where: { combinator: 'and', rules: [] }
    });

    expect(changes.length).toBeGreaterThan(0);
  });
});
