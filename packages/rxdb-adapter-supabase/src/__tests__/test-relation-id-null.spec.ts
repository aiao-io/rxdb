/**
 * @fileoverview 关系外键设置为 null 测试
 * 测试当设置 entity.xxxId = null 时的行为
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, IdCard, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('关系外键设置为 null (Supabase)', () => {
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;
  let tablesExist = false;
  let userRepo: SupabaseRepository<typeof User>;
  let idCardRepo: SupabaseRepository<typeof IdCard>;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `relation-null-test-${Date.now()}`,
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
    idCardRepo = adapter.getRepository(IdCard) as unknown as SupabaseRepository<typeof IdCard>;

    // 检查表是否存在
    try {
      await userRepo.find({ where: { combinator: 'and', rules: [] }, limit: 1 });
      await idCardRepo.find({ where: { combinator: 'and', rules: [] }, limit: 1 });
      tablesExist = true;
    } catch (error) {
      throw new Error(`检查 User/IdCard 表失败: ${(error as Error).message}`, { cause: error });
    }
  });

  afterAll(async () => {
    // 清理将在每个测试的 afterEach 中进行
  });

  describe('直接设置外键为 null', () => {
    let testUser: User;
    let testIdCard: IdCard;

    beforeAll(async () => {
      // 创建用户
      testUser = new User();
      testUser.name = 'FK-Null-User-' + Date.now();
      await userRepo.create(testUser);

      // 创建身份证
      testIdCard = new IdCard();
      testIdCard.code = 'FK-NULL-' + Date.now();
      testIdCard.ownerId = testUser.id;
      await idCardRepo.create(testIdCard);

      // 设置用户的身份证
      testUser.idCardId = testIdCard.id;
      await userRepo.update(testUser, { idCardId: testIdCard.id });
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (testIdCard?.id) await idCardRepo.remove(testIdCard);
        if (testUser?.id) await userRepo.remove(testUser);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('设置 idCardId = null 后应该能保存', async () => {
      // 验证初始状态
      let users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: testUser.id }]
        }
      });
      expect(users[0].idCardId).toBe(testIdCard.id);

      // 设置外键为 null
      await userRepo.update(testUser, { idCardId: null });

      // 验证更新后的状态
      users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: testUser.id }]
        }
      });
      expect(users[0].idCardId).toBeNull();
    });
  });

  describe('通过关系字段查询', () => {
    it('通过 idCard.code 查询用户', async () => {
      // 每个测试创建自己的数据，使用唯一的 code
      const uniqueCode = 'FK-QUERY-UNIQUE-' + Date.now() + '-' + Math.random().toString(36).slice(2);

      const testUser = new User();
      testUser.name = 'FK-Query-User-' + Date.now();
      await userRepo.create(testUser);

      const testIdCard = new IdCard();
      testIdCard.code = uniqueCode;
      testIdCard.ownerId = testUser.id;
      await idCardRepo.create(testIdCard);

      // 设置用户的身份证
      await userRepo.update(testUser, { idCardId: testIdCard.id });

      try {
        // 验证可以通过关系字段查询
        const users = await userRepo.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'idCard.code', operator: '=', value: uniqueCode }]
          }
        });

        // 应该至少找到我们创建的用户
        expect(users.length).toBeGreaterThanOrEqual(1);
        expect(users.some(u => u.id === testUser.id)).toBe(true);
      } finally {
        // 清理
        await idCardRepo.remove(testIdCard).catch(() => {
          /* 忽略。 */
        });
        await userRepo.remove(testUser).catch(() => {
          /* 忽略。 */
        });
      }
    });

    it('设置外键为 null 后，直接查询该用户应该显示 idCardId 为 null', async () => {
      // 每个测试创建自己的数据
      const testUser = new User();
      testUser.name = 'FK-Null-Query-User-' + Date.now();
      await userRepo.create(testUser);

      const testIdCard = new IdCard();
      testIdCard.code = 'FK-NULL-QUERY-' + Date.now();
      testIdCard.ownerId = testUser.id;
      await idCardRepo.create(testIdCard);

      // 设置用户的身份证
      await userRepo.update(testUser, { idCardId: testIdCard.id });

      try {
        // 验证关系存在
        let users = await userRepo.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: testUser.id }]
          }
        });
        expect(users[0].idCardId).toBe(testIdCard.id);

        // 设置外键为 null
        await userRepo.update(testUser, { idCardId: null });

        // 直接查询该用户应该显示 idCardId 为 null
        users = await userRepo.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: testUser.id }]
          }
        });

        expect(users[0].idCardId).toBeNull();
      } finally {
        // 清理
        await idCardRepo.remove(testIdCard).catch(() => {
          /* 忽略。 */
        });
        await userRepo.remove(testUser).catch(() => {
          /* 忽略。 */
        });
      }
    });
  });

  describe('查询 idCardId 为 null 的用户', () => {
    let testUser: User;

    beforeAll(async () => {
      // 创建没有身份证的用户
      testUser = new User();
      testUser.name = 'No-IdCard-User-' + Date.now();
      await userRepo.create(testUser);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (testUser?.id) await userRepo.remove(testUser);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('使用 isNull 查询外键为 null 的记录', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'name', operator: 'startsWith', value: 'No-IdCard-User-' },
            { field: 'idCardId', operator: 'null' }
          ]
        }
      });

      expect(users.length).toBeGreaterThanOrEqual(1);
      expect(users.some(u => u.id === testUser.id)).toBe(true);
    });

    it('使用 isNotNull 排除外键为 null 的记录', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'name', operator: 'startsWith', value: 'No-IdCard-User-' },
            { field: 'idCardId', operator: 'notNull' }
          ]
        }
      });

      // 该用户不应该在结果中
      expect(users.some(u => u.id === testUser.id)).toBe(false);
    });

    it('使用 null 操作符查找外键为 null 的记录', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'name', operator: 'startsWith', value: 'No-IdCard-User-' },
            { field: 'idCardId', operator: 'null' }
          ]
        }
      });

      expect(users.length).toBeGreaterThanOrEqual(1);
      expect(users.some(u => u.id === testUser.id)).toBe(true);
    });

    it('使用 notNull 操作符排除外键为 null 的记录', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'name', operator: 'startsWith', value: 'No-IdCard-User-' },
            { field: 'idCardId', operator: 'notNull' }
          ]
        }
      });

      // 该用户不应该在结果中
      expect(users.some(u => u.id === testUser.id)).toBe(false);
    });
  });
});
