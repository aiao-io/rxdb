import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('分支创建 (createBranch)', () => {
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

  beforeEach(async () => await cleanup_db(adapter));

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('从有数据的主分支创建新分支', async () => {
    // 在主分支创建初始数据
    const todo = new Todo();
    todo.title = '1';
    await todo.save();
    // 创建新分支
    const result = await rxdb.versionManager.createBranch('branch_01');
    expect(result).contain({
      activated: false,
      id: 'branch_01',
      fromChangeId: 1,
      parentId: 'main',
      local: true,
      remote: false
    });
  });

  it('从空的主分支创建新分支', async () => {
    // 在没有数据的情况下创建新分支
    const result = await rxdb.versionManager.createBranch('branch_01');
    expect(result).contain({
      activated: false,
      id: 'branch_01',
      fromChangeId: null,
      local: true,
      remote: false
    });
  });
});
