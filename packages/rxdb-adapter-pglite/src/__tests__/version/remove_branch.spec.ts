import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('removeBranch', () => {
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

  it('should throw error when trying to remove non-existent branch', async () => {
    await expect(rxdb.versionManager.removeBranch('non-existent-branch')).rejects.toThrow(
      "Branch 'non-existent-branch' not found"
    );
  });

  it('should throw error when trying to remove main branch', async () => {
    await expect(rxdb.versionManager.removeBranch('main')).rejects.toThrow('Cannot remove main branch');
  });

  it('should remove branch successfully', async () => {
    const todo = new Todo();
    todo.title = '1';
    await todo.save();
    await rxdb.versionManager.createBranch('branch_01');
    await rxdb.versionManager.removeBranch('branch_01');
    const branches = await adapter.localRxDBBranch().find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'branch_01' }]
      }
    });
    expect(branches.length).toBe(0);
  });
});
