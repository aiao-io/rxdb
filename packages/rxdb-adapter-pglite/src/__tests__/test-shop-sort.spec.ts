import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('Shop 实体 PGlite 适配器 - 排序', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  let user1: User;
  let user2: User;
  let user3: User;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [...ENTITIES],
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

  beforeEach(async () => {
    user1 = new User();
    user1.name = 'Charlie';
    user1.age = 20;

    user2 = new User();
    user2.name = 'David';
    user2.age = 35;

    user3 = new User();
    user3.name = 'Eve';
    user3.age = 28;

    await user1.save();
    await user2.save();
    await user3.save();
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('按年龄排序查询用户', async () => {
    const findUsers = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: []
        },
        orderBy: [{ field: 'age', sort: 'asc' }]
      })
    );
    expect(findUsers.length).toBeGreaterThan(0);
    for (let i = 1; i < findUsers.length; i++) {
      expect(findUsers[i].age).toBeGreaterThanOrEqual(findUsers[i - 1].age);
    }
  });

  it('按姓名降序排序查询用户', async () => {
    const findUsers = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: []
        },
        orderBy: [{ field: 'name', sort: 'desc' }]
      })
    );
    expect(findUsers.length).toBeGreaterThan(0);
    for (let i = 1; i < findUsers.length; i++) {
      expect(findUsers[i].name.localeCompare(findUsers[i - 1].name)).toBeLessThanOrEqual(0);
    }
  });

  it('复合排序查询', async () => {
    const findUsers = await firstValueFrom(
      User.find({
        where: {
          combinator: 'and',
          rules: []
        },
        orderBy: [
          { field: 'age', sort: 'desc' },
          { field: 'name', sort: 'asc' }
        ]
      })
    );
    expect(findUsers.length).toBeGreaterThan(0);
  });
});
