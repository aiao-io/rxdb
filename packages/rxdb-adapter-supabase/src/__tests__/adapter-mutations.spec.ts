/**
 * @fileoverview Supabase Adapter mutations 测试
 *
 * 测试 adapter.saveMany(), adapter.removeMany(), adapter.mutations() 方法
 *
 * ⚠️ 注意：
 * - saveMany/removeMany/mutations 直接操作实体数据
 * - 实体对象包含 EntityBase 的所有属性 (id, createdAt, createdBy 等)
 * - 这些测试使用 repository 创建初始数据，确保数据库字段正确填充
 */

import { RxDB, SyncType, type EntityType, type RxDBMutationsMap } from '@aiao/rxdb';
import { Category, ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('Supabase Adapter Mutations', () => {
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;
  let tableExists = false;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `mutations-test-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: {
        remote: { adapter: 'supabase' },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();

    // 检查 User 表是否存在
    try {
      tableExists = await adapter.isTableExisted(User);
      if (!tableExists) {
        throw new Error('User 表不存在，请先初始化 Supabase 测试环境');
      }
    } catch (error) {
      throw new Error(`检查 User 表失败: ${(error as Error).message}`, { cause: error });
    }
  });

  afterAll(async () => {
    if (rxdb) {
      await adapter.disconnect();
    }
  });

  describe('saveMany', () => {
    it('空数组返回空数组', async () => {
      const result = await adapter.saveMany([]);
      expect(result).toEqual([]);
    });

    it('保存单个实体', async () => {
      const user = new User();
      user.name = `SaveMany-Single-${Date.now()}`;
      user.age = 25;

      const result = await adapter.saveMany([user]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(user.name);
      expect(result[0].id).toBe(user.id);

      // 清理
      await adapter.removeMany([user]);
    });

    it('批量保存多个实体', async () => {
      const users = Array.from({ length: 5 }, (_, i) => {
        const user = new User();
        user.name = `SaveMany-Batch-${Date.now()}-${i}`;
        user.age = 20 + i;
        return user;
      });

      const result = await adapter.saveMany(users);

      expect(result).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(result[i].id).toBe(users[i].id);
      }

      // 清理
      await adapter.removeMany(users);
    });

    it('upsert 更新已存在的实体', async () => {
      // 先创建
      const user = new User();
      user.name = `SaveMany-Upsert-${Date.now()}`;
      user.age = 25;
      await adapter.saveMany([user]);

      // 修改后再保存（upsert）
      user.name = 'Updated-Name';
      user.age = 30;
      const result = await adapter.saveMany([user]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Updated-Name');
      expect(result[0].age).toBe(30);

      // 清理
      await adapter.removeMany([user]);
    });

    it('混合新增和更新', async () => {
      // 先创建一个
      const existingUser = new User();
      existingUser.name = `SaveMany-Existing-${Date.now()}`;
      existingUser.age = 25;
      await adapter.saveMany([existingUser]);

      // 创建新的并修改已存在的
      const newUser = new User();
      newUser.name = `SaveMany-New-${Date.now()}`;
      newUser.age = 28;

      existingUser.name = 'Updated-Existing';

      const result = await adapter.saveMany([existingUser, newUser]);

      expect(result).toHaveLength(2);

      // 清理
      await adapter.removeMany([existingUser, newUser]);
    });
  });

  describe('removeMany', () => {
    it('空数组返回空数组', async () => {
      const result = await adapter.removeMany([]);
      expect(result).toEqual([]);
    });

    it('删除单个实体', async () => {
      // 先创建
      const user = new User();
      user.name = `RemoveMany-Single-${Date.now()}`;
      user.age = 25;
      await adapter.saveMany([user]);

      // 删除
      const result = await adapter.removeMany([user]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(user.id);

      // 验证已删除
      const repository = adapter.getRepository(User);
      const found = await repository.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: user.id }]
        }
      });
      expect(found).toHaveLength(0);
    });

    it('批量删除多个实体', async () => {
      // 先创建
      const users = Array.from({ length: 3 }, (_, i) => {
        const user = new User();
        user.name = `RemoveMany-Batch-${Date.now()}-${i}`;
        user.age = 20 + i;
        return user;
      });
      await adapter.saveMany(users);

      // 删除
      const result = await adapter.removeMany(users);

      expect(result).toHaveLength(3);

      // 验证全部已删除
      const repository = adapter.getRepository(User);
      const ids = users.map(u => u.id);
      const found = await repository.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: ids }]
        }
      });
      expect(found).toHaveLength(0);
    });

    it('删除不存在的实体抛出数据错误', async () => {
      const user = new User();
      user.name = 'NonExistent';

      await expect(adapter.removeMany([user])).rejects.toMatchObject({
        name: 'SupabaseDataError',
        code: 'DATA_ERROR'
      });
    });
  });

  describe('mutations', () => {
    it('空 mutations 返回空数组', async () => {
      const result = await adapter.mutations({
        create: new Map(),
        update: new Map(),
        remove: new Map()
      });

      expect(result).toHaveLength(0);
    });

    describe('CREATE 操作', () => {
      it('创建单个实体', async () => {
        const user = new User();
        user.name = `Mutations-Create-Single-${Date.now()}`;
        user.age = 25;

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map([[User, new Set([user])]]),
          update: new Map(),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe(user.name);

        // 清理
        await adapter.removeMany([user]);
      });

      it('批量创建多个实体', async () => {
        const users = Array.from({ length: 5 }, (_, i) => {
          const user = new User();
          user.name = `Mutations-Create-Batch-${Date.now()}-${i}`;
          user.age = 20 + i;
          return user;
        });

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map([[User, new Set(users)]]),
          update: new Map(),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(5);

        // 清理
        await adapter.removeMany(users);
      });

      it('不同类型实体批量创建', async () => {
        const user = new User();
        user.name = `Mutations-MultiType-User-${Date.now()}`;
        user.age = 30;

        const category = new Category();
        category.name = `Mutations-MultiType-Cat-${Date.now()}`;

        const mutations: RxDBMutationsMap<EntityType> = {
          create: new Map([
            [User, new Set([user])],
            [Category, new Set([category])]
          ] as [EntityType, Set<unknown>][]),
          update: new Map(),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(2);

        // 清理
        await adapter.removeMany([user]);
        await adapter.removeMany([category]);
      });
    });

    describe('UPDATE 操作', () => {
      it('更新单个实体', async () => {
        // 先创建
        const user = new User();
        user.name = `Mutations-Update-Original-${Date.now()}`;
        user.age = 25;
        await adapter.saveMany([user]);

        // 更新
        user.name = 'Mutations-Update-Modified';
        user.age = 30;

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map(),
          update: new Map([[User, new Set([user])]]),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Mutations-Update-Modified');
        expect(result[0].age).toBe(30);

        // 清理
        await adapter.removeMany([user]);
      });

      it('批量更新多个实体', async () => {
        // 先创建
        const users = Array.from({ length: 3 }, (_, i) => {
          const user = new User();
          user.name = `Mutations-Update-Batch-${Date.now()}-${i}`;
          user.age = 20;
          return user;
        });
        await adapter.saveMany(users);

        // 更新
        users.forEach((user, i) => {
          user.name = `Updated-${i}`;
          user.age = 30 + i;
        });

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map(),
          update: new Map([[User, new Set(users)]]),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(3);
        result.forEach(r => {
          expect(r.age).toBeGreaterThanOrEqual(30);
        });

        // 清理
        await adapter.removeMany(users);
      });
    });

    describe('REMOVE 操作', () => {
      it('删除单个实体', async () => {
        // 先创建
        const user = new User();
        user.name = `Mutations-Remove-Single-${Date.now()}`;
        user.age = 25;
        await adapter.saveMany([user]);

        // 删除
        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map(),
          update: new Map(),
          remove: new Map([[User, new Set([user])]])
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(1);

        // 验证已删除
        const repository = adapter.getRepository(User);
        const found = await repository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: user.id }]
          }
        });
        expect(found).toHaveLength(0);
      });

      it('批量删除多个实体', async () => {
        // 先创建
        const users = Array.from({ length: 3 }, (_, i) => {
          const user = new User();
          user.name = `Mutations-Remove-Batch-${Date.now()}-${i}`;
          user.age = 20 + i;
          return user;
        });
        await adapter.saveMany(users);

        // 删除
        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map(),
          update: new Map(),
          remove: new Map([[User, new Set(users)]])
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(3);
      });
    });

    describe('混合操作', () => {
      it('CREATE + UPDATE + REMOVE 同时执行', async () => {
        // 先创建两个用于更新和删除的实体
        const toUpdate = new User();
        toUpdate.name = `Mutations-Mixed-ToUpdate-${Date.now()}`;
        toUpdate.age = 25;

        const toRemove = new User();
        toRemove.name = `Mutations-Mixed-ToRemove-${Date.now()}`;
        toRemove.age = 30;

        await adapter.saveMany([toUpdate, toRemove]);

        // 准备新建的实体
        const toCreate = new User();
        toCreate.name = `Mutations-Mixed-ToCreate-${Date.now()}`;
        toCreate.age = 28;

        // 修改要更新的实体
        toUpdate.name = 'Mixed-Updated';
        toUpdate.age = 35;

        // 执行混合操作
        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map([[User, new Set([toCreate])]]),
          update: new Map([[User, new Set([toUpdate])]]),
          remove: new Map([[User, new Set([toRemove])]])
        };

        const result = await adapter.mutations(mutations);

        expect(result).toHaveLength(3);

        // 验证创建
        const repository = adapter.getRepository(User);
        const created = await repository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: toCreate.id }]
          }
        });
        expect(created).toHaveLength(1);

        // 验证更新
        const updated = await repository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: toUpdate.id }]
          }
        });
        expect(updated).toHaveLength(1);
        expect(updated[0].name).toBe('Mixed-Updated');
        expect(updated[0].age).toBe(35);

        // 验证删除
        const removed = await repository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: toRemove.id }]
          }
        });
        expect(removed).toHaveLength(0);

        // 清理
        await adapter.removeMany([toCreate, toUpdate]);
      });
    });

    describe('边界情况', () => {
      it('只有 create 操作', async () => {
        const user = new User();
        user.name = `Mutations-OnlyCreate-${Date.now()}`;
        user.age = 25;

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map([[User, new Set([user])]]),
          update: new Map(),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);
        expect(result).toHaveLength(1);

        // 清理
        await adapter.removeMany([user]);
      });

      it('只有 update 操作', async () => {
        const user = new User();
        user.name = `Mutations-OnlyUpdate-${Date.now()}`;
        user.age = 25;
        await adapter.saveMany([user]);

        user.name = 'OnlyUpdate-Modified';

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map(),
          update: new Map([[User, new Set([user])]]),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('OnlyUpdate-Modified');

        // 清理
        await adapter.removeMany([user]);
      });

      it('只有 remove 操作', async () => {
        const user = new User();
        user.name = `Mutations-OnlyRemove-${Date.now()}`;
        user.age = 25;
        await adapter.saveMany([user]);

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map(),
          update: new Map(),
          remove: new Map([[User, new Set([user])]])
        };

        const result = await adapter.mutations(mutations);
        expect(result).toHaveLength(1);
      });

      it('大批量创建', async () => {
        const users = Array.from({ length: 50 }, (_, i) => {
          const user = new User();
          user.name = `Mutations-LargeBatch-${Date.now()}-${i}`;
          user.age = 20 + (i % 30);
          return user;
        });

        const mutations: RxDBMutationsMap<typeof User> = {
          create: new Map([[User, new Set(users)]]),
          update: new Map(),
          remove: new Map()
        };

        const result = await adapter.mutations(mutations);
        expect(result).toHaveLength(50);

        // 清理
        await adapter.removeMany(users);
      });
    });

    describe('事务支持', () => {
      it('事务模式下多操作原子执行', async () => {
        // 先创建一个用于更新的用户
        const existingUser = new User();
        existingUser.name = `Transaction-Existing-${Date.now()}`;
        existingUser.age = 25;
        await adapter.saveMany([existingUser]);

        // 准备一个正常的创建
        const newUser = new User();
        newUser.name = `Transaction-New-${Date.now()}`;
        newUser.age = 30;

        // 验证初始状态
        const repository = adapter.getRepository(User);
        const beforeCount = await repository.count({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: existingUser.id }] }
        });
        expect(beforeCount).toBe(1);

        // 清理
        await adapter.removeMany([existingUser]);
      });
    });
  });
});
