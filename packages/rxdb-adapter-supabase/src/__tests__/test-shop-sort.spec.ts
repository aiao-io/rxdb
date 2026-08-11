/**
 * @fileoverview Shop 排序测试
 * 测试多字段排序、复合排序等场景
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('Shop 排序测试 (Supabase)', () => {
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;
  let tablesExist = false;
  let userRepo: SupabaseRepository<typeof User>;

  // 测试用户
  const testUsers: User[] = [];

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `shop-sort-test-${Date.now()}`,
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

    userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;

    // 检查表是否存在
    try {
      await userRepo.find({ where: { combinator: 'and', rules: [] }, limit: 1 });
      tablesExist = true;
    } catch (error) {
      throw new Error(`检查 User 表失败: ${(error as Error).message}`, { cause: error });
    }

    // 创建测试数据：不同年龄和姓名的用户
    const testData = [
      { name: 'Sort-Alice', age: 30 },
      { name: 'Sort-Bob', age: 25 },
      { name: 'Sort-Charlie', age: 30 }, // 同年龄不同名字
      { name: 'Sort-David', age: 20 },
      { name: 'Sort-Eve', age: 25 } // 同年龄不同名字
    ];

    for (const data of testData) {
      const user = new User();
      user.name = `${data.name}-${Date.now()}`;
      user.age = data.age;
      await userRepo.create(user);
      testUsers.push(user);
    }
  });

  afterAll(async () => {
    if (!tablesExist) return;
    // 清理测试数据
    for (const user of testUsers) {
      try {
        await userRepo.remove(user);
      } catch {
        /* 忽略清理错误。 */
      }
    }
  });

  describe('单字段排序', () => {
    it('按年龄升序排序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'asc' }]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < users.length; i++) {
        expect(users[i].age).toBeGreaterThanOrEqual(users[i - 1].age);
      }
    });

    it('按年龄降序排序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'desc' }]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < users.length; i++) {
        expect(users[i].age).toBeLessThanOrEqual(users[i - 1].age);
      }
    });

    it('按姓名升序排序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'name', sort: 'asc' }]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < users.length; i++) {
        expect(users[i].name.localeCompare(users[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });

    it('按姓名降序排序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'name', sort: 'desc' }]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);
      for (let i = 1; i < users.length; i++) {
        expect(users[i].name.localeCompare(users[i - 1].name)).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('多字段复合排序', () => {
    it('先按年龄升序，再按姓名升序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [
          { field: 'age', sort: 'asc' },
          { field: 'name', sort: 'asc' }
        ]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);

      for (let i = 1; i < users.length; i++) {
        const prev = users[i - 1];
        const curr = users[i];

        if (prev.age === curr.age) {
          // 同年龄时，姓名应该升序
          expect(curr.name.localeCompare(prev.name)).toBeGreaterThanOrEqual(0);
        } else {
          // 不同年龄时，年龄应该升序
          expect(curr.age).toBeGreaterThan(prev.age);
        }
      }
    });

    it('先按年龄降序，再按姓名升序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [
          { field: 'age', sort: 'desc' },
          { field: 'name', sort: 'asc' }
        ]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);

      for (let i = 1; i < users.length; i++) {
        const prev = users[i - 1];
        const curr = users[i];

        if (prev.age === curr.age) {
          // 同年龄时，姓名应该升序
          expect(curr.name.localeCompare(prev.name)).toBeGreaterThanOrEqual(0);
        } else {
          // 不同年龄时，年龄应该降序
          expect(curr.age).toBeLessThan(prev.age);
        }
      }
    });

    it('先按年龄升序，再按姓名降序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [
          { field: 'age', sort: 'asc' },
          { field: 'name', sort: 'desc' }
        ]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);

      for (let i = 1; i < users.length; i++) {
        const prev = users[i - 1];
        const curr = users[i];

        if (prev.age === curr.age) {
          // 同年龄时，姓名应该降序
          expect(curr.name.localeCompare(prev.name)).toBeLessThanOrEqual(0);
        } else {
          // 不同年龄时，年龄应该升序
          expect(curr.age).toBeGreaterThan(prev.age);
        }
      }
    });
  });

  describe('排序与分页组合', () => {
    it('排序后 limit 返回前N条', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'asc' }],
        limit: 2
      });

      expect(users.length).toBe(2);
      // 应该是年龄最小的两个
      expect(users[0].age).toBeLessThanOrEqual(users[1].age);
    });

    it('排序后 offset 跳过前N条', async () => {
      const allUsers = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'asc' }]
      });

      const offsetUsers = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'asc' }],
        offset: 2
      });

      // offset 后的第一条应该等于全部的第三条
      expect(offsetUsers[0].id).toBe(allUsers[2].id);
    });

    it('排序后 limit + offset 实现分页', async () => {
      // 第一页
      const page1 = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'asc' }],
        limit: 2,
        offset: 0
      });

      // 第二页
      const page2 = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'name', operator: 'startsWith', value: 'Sort-' }]
        },
        orderBy: [{ field: 'age', sort: 'asc' }],
        limit: 2,
        offset: 2
      });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);

      // 两页数据不应重复
      const page1Ids = new Set(page1.map(u => u.id));
      for (const user of page2) {
        expect(page1Ids.has(user.id)).toBe(false);
      }
    });
  });
});
