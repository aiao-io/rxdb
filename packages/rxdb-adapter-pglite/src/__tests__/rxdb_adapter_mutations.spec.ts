/**
 * T062: rxdb_adapter_mutations 测试
 *
 * 通过 adapter.mutations() 测试批量修改功能
 * 目标：将覆盖率从 37.68% 提升到 90%+
 */

import { EntityType, getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { Category, ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('rxdb_adapter_mutations', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  const dbName = `mutations-test-${Date.now()}`;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName,
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });

    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('CREATE', () => {
    it('单个实体', async () => {
      const user = new User();
      user.name = 'Alice';
      user.age = 30;

      const result = await adapter.mutations({
        create: new Map([[User, new Set([user])]]),
        update: new Map(),
        remove: new Map()
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Alice');
    });

    it('批量插入', async () => {
      const users = Array.from({ length: 10 }, (_, i) => {
        const u = new User();
        u.name = `User${i}`;
        u.age = 20 + i;
        return u;
      });

      const result = await adapter.mutations({
        create: new Map([[User, new Set(users)]]),
        update: new Map(),
        remove: new Map()
      });

      expect(result).toHaveLength(10);
    });

    it('不同类型实体', async () => {
      const user = new User();
      user.name = 'Bob';

      const category = new Category();
      category.name = 'Cat1';

      const create = new Map<EntityType, Set<object>>([
        [User, new Set<object>([user])],
        [Category, new Set<object>([category])]
      ]);
      const result = await adapter.mutations<EntityType>({
        create,
        update: new Map(),
        remove: new Map()
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('UPDATE', () => {
    it('单个实体', async () => {
      const user = new User();
      user.name = 'Original';
      user.age = 25;

      await adapter.mutations({
        create: new Map([[User, new Set([user])]]),
        update: new Map(),
        remove: new Map()
      });

      user.name = 'Updated';
      user.age = 30;

      const result = await adapter.mutations({
        create: new Map(),
        update: new Map([[User, new Set([user])]]),
        remove: new Map()
      });

      expect(result[0]!.name).toBe('Updated');
      expect(result[0]!.age).toBe(30);
    });

    it('按 patch 分组', async () => {
      const users = Array.from({ length: 5 }, (_, i) => {
        const u = new User();
        u.name = `User${i}`;
        u.age = 20;
        return u;
      });

      await adapter.mutations({
        create: new Map([[User, new Set(users)]]),
        update: new Map(),
        remove: new Map()
      });

      // 前 3 个只修改 name
      users[0]!.name = 'A';
      users[1]!.name = 'B';
      users[2]!.name = 'C';

      // 后 2 个只修改 age
      users[3]!.age = 99;
      users[4]!.age = 88;

      const result = await adapter.mutations({
        create: new Map(),
        update: new Map([[User, new Set(users)]]),
        remove: new Map()
      });

      expect(result).toHaveLength(5);
      expect(result[0]!.name).toBe('A');
      expect(result[3]!.age).toBe(99);
    });
  });

  describe('DELETE', () => {
    it('单个实体', async () => {
      const user = new User();
      user.name = 'ToDelete';

      await adapter.mutations({
        create: new Map([[User, new Set([user])]]),
        update: new Map(),
        remove: new Map()
      });

      const result = await adapter.mutations({
        create: new Map(),
        update: new Map(),
        remove: new Map([[User, new Set([user])]])
      });

      expect(result).toHaveLength(1);
      const status = getEntityStatus(result[0]!);
      expect(status.removed).toBeTruthy();
    });

    it('批量删除', async () => {
      const users = Array.from({ length: 3 }, (_, i) => {
        const u = new User();
        u.name = `Del${i}`;
        return u;
      });

      await adapter.mutations({
        create: new Map([[User, new Set(users)]]),
        update: new Map(),
        remove: new Map()
      });

      const result = await adapter.mutations({
        create: new Map(),
        update: new Map(),
        remove: new Map([[User, new Set(users)]])
      });

      expect(result.every(r => getEntityStatus(r).removed === true)).toBe(true);
    });
  });

  describe('混合操作', () => {
    it('CREATE + UPDATE + DELETE', async () => {
      const existing = new User();
      existing.name = 'Existing';

      const toDelete = new User();
      toDelete.name = 'ToDelete';

      await adapter.mutations({
        create: new Map([[User, new Set([existing, toDelete])]]),
        update: new Map(),
        remove: new Map()
      });

      const newUser = new User();
      newUser.name = 'New';

      existing.name = 'Updated';

      const result = await adapter.mutations({
        create: new Map([[User, new Set([newUser])]]),
        update: new Map([[User, new Set([existing])]]),
        remove: new Map([[User, new Set([toDelete])]])
      });

      expect(result).toHaveLength(3);
      const names = result.map(r => r.name).sort();
      expect(names).toEqual(['New', 'ToDelete', 'Updated']);
    });
  });

  describe('边界情况', () => {
    it('空 mutations', async () => {
      const result = await adapter.mutations({
        create: new Map(),
        update: new Map(),
        remove: new Map()
      });
      expect(result).toHaveLength(0);
    });
  });
});
