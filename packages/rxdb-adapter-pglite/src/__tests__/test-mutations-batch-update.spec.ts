/**
 * 批量更新不同值的 mutations bug 复现测试
 *
 * 场景：多个实体修改相同字段但赋不同值，通过 mutations 批量更新后，
 * 所有实体应保留各自的值，而非被覆写为同一个值。
 */
import { getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('mutations 批量更新不同值', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });

    rxdb.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  it('相同字段不同值：每个实体应保留各自的更新值', async () => {
    const userA = new User();
    userA.name = 'Alice';
    userA.age = 20;

    const userB = new User();
    userB.name = 'Bob';
    userB.age = 20;

    const userC = new User();
    userC.name = 'Charlie';
    userC.age = 20;

    await adapter.mutations({
      create: new Map([[User, new Set([userA, userB, userC])]]),
      update: new Map(),
      remove: new Map()
    });

    userA.age = 30;
    userB.age = 40;
    userC.age = 50;

    const patchA = getEntityStatus(userA).patch!;
    const patchB = getEntityStatus(userB).patch!;
    const patchC = getEntityStatus(userC).patch!;
    expect(Object.keys(patchA)).toEqual(['age']);
    expect(Object.keys(patchB)).toEqual(['age']);
    expect(Object.keys(patchC)).toEqual(['age']);
    expect(patchA.age).toBe(30);
    expect(patchB.age).toBe(40);
    expect(patchC.age).toBe(50);

    await adapter.mutations({
      create: new Map(),
      update: new Map([[User, new Set([userA, userB, userC])]]),
      remove: new Map()
    });

    const users = await firstValueFrom(
      User.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: [userA.id, userB.id, userC.id] }]
        }
      })
    );

    const byId = new Map(users.map(u => [u.id, u]));
    expect(byId.get(userA.id)!.age).toBe(30);
    expect(byId.get(userB.id)!.age).toBe(40);
    expect(byId.get(userC.id)!.age).toBe(50);
  });

  it('模拟画布位置批量更新：多字段不同值', async () => {
    const userA = new User();
    userA.name = 'NodeA';
    userA.age = 0;

    const userB = new User();
    userB.name = 'NodeB';
    userB.age = 0;

    await adapter.mutations({
      create: new Map([[User, new Set([userA, userB])]]),
      update: new Map(),
      remove: new Map()
    });

    userA.name = 'PosA';
    userA.age = 100;

    userB.name = 'PosB';
    userB.age = 200;

    await adapter.mutations({
      create: new Map(),
      update: new Map([[User, new Set([userA, userB])]]),
      remove: new Map()
    });

    const users = await firstValueFrom(
      User.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: [userA.id, userB.id] }]
        }
      })
    );

    const byId = new Map(users.map(u => [u.id, u]));
    expect(byId.get(userA.id)!.name).toBe('PosA');
    expect(byId.get(userA.id)!.age).toBe(100);
    expect(byId.get(userB.id)!.name).toBe('PosB');
    expect(byId.get(userB.id)!.age).toBe(200);
  });

  it('混合场景：部分相同值 + 部分不同值', async () => {
    const users = Array.from({ length: 4 }, (_, i) => {
      const u = new User();
      u.name = `User${i}`;
      u.age = 10;
      return u;
    });

    await adapter.mutations({
      create: new Map([[User, new Set(users)]]),
      update: new Map(),
      remove: new Map()
    });

    users[0]!.name = 'Alpha';
    users[1]!.name = 'Beta';
    users[2]!.age = 77;
    users[3]!.age = 88;

    await adapter.mutations({
      create: new Map(),
      update: new Map([[User, new Set(users)]]),
      remove: new Map()
    });

    const result = await firstValueFrom(
      User.findAll({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: users.map(u => u.id) }]
        }
      })
    );

    const byId = new Map(result.map(u => [u.id, u]));
    expect(byId.get(users[0]!.id)!.name).toBe('Alpha');
    expect(byId.get(users[1]!.id)!.name).toBe('Beta');
    expect(byId.get(users[2]!.id)!.age).toBe(77);
    expect(byId.get(users[3]!.id)!.age).toBe(88);
  });
});
