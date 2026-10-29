import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, IdCard, Order, OrderItem, User, type UserStaticTypes } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

const SHOP_ENTITIES = ENTITIES;

/**
 * EXISTS 操作符测试
 *
 * ⚠️ 前置条件：需要在 Supabase 中手动创建 Shop 相关表
 */
describe('Supabase EXISTS 操作符测试', () => {
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;
  let tablesExist = false;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `exists-test-${Date.now()}`,
      context: { userId: 'exists-test-user' },
      entities: SHOP_ENTITIES,
      sync: {
        remote: {
          adapter: 'supabase'
        },
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

    // 检查表是否存在
    try {
      const userExists = await adapter.isTableExisted(User);
      const idCardExists = await adapter.isTableExisted(IdCard);
      const orderExists = await adapter.isTableExisted(Order);

      tablesExist = userExists && idCardExists && orderExists;
      if (!tablesExist) {
        throw new Error('Shop 表不完整');
      }
    } catch (error) {
      throw new Error(`检查 Shop 表失败: ${(error as Error).message}`, { cause: error });
    }
  });

  afterAll(async () => {
    if (tablesExist && adapter) {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;
      const idCardRepo = adapter.getRepository(IdCard) as SupabaseRepository<typeof IdCard>;
      const orderRepo = adapter.getRepository(Order) as SupabaseRepository<typeof Order>;

      try {
        const allOrders = await orderRepo.find({ where: { combinator: 'and', rules: [] } });
        for (const order of allOrders) {
          await orderRepo.remove(order);
        }

        const allIdCards = await idCardRepo.find({ where: { combinator: 'and', rules: [] } });
        for (const card of allIdCards) {
          await idCardRepo.remove(card);
        }

        const allUsers = await userRepo.find({ where: { combinator: 'and', rules: [] } });
        for (const user of allUsers) {
          await userRepo.remove(user);
        }
      } catch (error) {
        console.error('清理测试数据失败:', error);
      }
    }

    if (adapter) {
      await adapter.disconnect();
    }
  });

  describe('ONE_TO_ONE 关系 EXISTS', () => {
    let userWithCard: User;
    let userWithoutCard: User;
    let idCard: IdCard;

    beforeAll(async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;
      const idCardRepo = adapter.getRepository(IdCard) as SupabaseRepository<typeof IdCard>;

      // 创建有身份证的用户
      userWithCard = new User();
      userWithCard.name = 'EXISTS_Alice';
      userWithCard.age = 30;
      await userRepo.create(userWithCard);

      // 创建身份证，关联到用户
      idCard = new IdCard();
      idCard.code = `EXISTS-ID-${Date.now()}`; // 使用时间戳确保唯一性
      idCard.ownerId = userWithCard.id;
      await idCardRepo.create(idCard);

      // 🔥 关键：更新 User.idCardId 建立双向关联
      // 使用原始 Supabase client 直接更新
      const { error: updateError } = await adapter.client
        .schema('shop')
        .from('user')
        .update({ idCardId: idCard.id })
        .eq('id', userWithCard.id);

      if (updateError) {
        console.error('更新 User.idCardId 失败:', updateError.message);
      }

      // 创建没有身份证的用户
      userWithoutCard = new User();
      userWithoutCard.name = 'EXISTS_Bob';
      userWithoutCard.age = 25;
      await userRepo.create(userWithoutCard);
    });

    // ⚠️ 双向 ONE_TO_ONE 关系测试：User ↔ IdCard 有两个外键
    // User.idCardId → IdCard.id 和 IdCard.ownerId → User.id
    // 需要代码正确消歧，使用外键约束名
    it('应该查询有 IdCard 的 User (exists)', async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;

      const result = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'idCard', operator: 'exists' },
            { field: 'name', operator: '=', value: 'EXISTS_Alice' }
          ]
        }
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('EXISTS_Alice');
      expect(result[0].id).toBe(userWithCard.id);
    });

    it('应该查询没有 IdCard 的 User (notExists)', async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;

      const result = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'idCard', operator: 'notExists' },
            { field: 'name', operator: '=', value: 'EXISTS_Bob' }
          ]
        }
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('EXISTS_Bob');
      expect(result[0].id).toBe(userWithoutCard.id);
    });
  });

  describe('ONE_TO_MANY 关系 EXISTS', () => {
    let userWithOrders: User;
    let userWithoutOrders: User;

    beforeAll(async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;
      const orderRepo = adapter.getRepository(Order) as SupabaseRepository<typeof Order>;

      // 创建有订单的用户
      userWithOrders = new User();
      userWithOrders.name = 'EXISTS_Charlie';
      userWithOrders.age = 35;
      await userRepo.create(userWithOrders);

      const order1 = new Order();
      order1.number = `EXISTS-ORD-${Date.now()}`; // 使用时间戳确保唯一性
      order1.amount = 100;
      order1.ownerId = userWithOrders.id;
      await orderRepo.create(order1);

      // 创建没有订单的用户
      userWithoutOrders = new User();
      userWithoutOrders.name = 'EXISTS_David';
      userWithoutOrders.age = 28;
      await userRepo.create(userWithoutOrders);
    });

    it('应该查询有订单的 User (exists)', async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;

      const result = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'orders', operator: 'exists' },
            { field: 'name', operator: '=', value: 'EXISTS_Charlie' }
          ]
        }
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('EXISTS_Charlie');
      expect(result[0].id).toBe(userWithOrders.id);
    });

    it('应该查询没有订单的 User (notExists)', async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;

      const result = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'orders', operator: 'notExists' },
            { field: 'name', operator: '=', value: 'EXISTS_David' }
          ]
        }
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('EXISTS_David');
      expect(result[0].id).toBe(userWithoutOrders.id);
    });
  });

  describe('COUNT 查询', () => {
    it('应该正确统计满足 EXISTS 条件的记录数', async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;

      const count = await userRepo.count({
        where: {
          combinator: 'and',
          rules: [
            { field: 'orders', operator: 'notExists' },
            { field: 'name', operator: '=', value: 'EXISTS_David' }
          ]
        }
      });

      expect(count).toBe(1);
    });

    it('应该正确统计满足 NOT EXISTS 条件的记录数', async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;

      const count = await userRepo.count({
        where: {
          combinator: 'and',
          rules: [{ field: 'orders', operator: 'notExists' }]
        }
      });

      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * exists 子查询里的 OR 作用于同一条关联行：「有一笔金额为 100 或 999 的订单」。
   * 组合子被丢掉时它变成「同一笔订单金额同时是 100 和 999」，服务端不报错，静默返回空集。
   */
  describe('exists 子查询内的 OR', () => {
    const suffix = Date.now();
    const nameA = `EXISTS_OR_A_${suffix}`;
    const nameB = `EXISTS_OR_B_${suffix}`;

    /** 建一笔订单并挂一个订单项，供两层关系的查询用 */
    const createOrder = async (owner: User, amount: number, quantity: number): Promise<void> => {
      const order = new Order();
      order.number = `EXISTS-OR-${suffix}-${amount}`;
      order.amount = amount;
      order.ownerId = owner.id;
      await (adapter.getRepository(Order) as SupabaseRepository<typeof Order>).create(order);

      const item = new OrderItem();
      item.productName = `EXISTS-OR-${amount}`;
      item.quantity = quantity;
      item.price = amount;
      item.orderId = order.id;
      await (adapter.getRepository(OrderItem) as SupabaseRepository<typeof OrderItem>).create(item);
    };

    const findNames = async (where: UserStaticTypes['findOptions']['where']): Promise<string[]> => {
      const rows = await (adapter.getRepository(User) as SupabaseRepository<typeof User>).find({ where });
      return rows.map(row => row.name).sort();
    };

    beforeAll(async () => {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;
      const userA = new User();
      userA.name = nameA;
      userA.age = 30;
      await userRepo.create(userA);
      const userB = new User();
      userB.name = nameB;
      userB.age = 31;
      await userRepo.create(userB);

      // A：金额 100（订单项数量 7）与 200（数量 2）；B：金额 300（数量 3）
      await createOrder(userA, 100, 7);
      await createOrder(userA, 200, 2);
      await createOrder(userB, 300, 3);
    });

    it('exists 下直接 OR：任一分支命中同一笔订单即可', async () => {
      const names = await findNames({
        combinator: 'and',
        rules: [
          { field: 'name', operator: 'in', value: [nameA, nameB] },
          {
            field: 'orders',
            operator: 'exists',
            where: {
              combinator: 'or',
              rules: [
                { field: 'amount', operator: '=', value: 100 },
                { field: 'amount', operator: '=', value: 999 }
              ]
            }
          }
        ]
      });

      expect(names).toEqual([nameA]);
    });

    it('exists 下 AND 包 OR：两个条件落在同一笔订单上', async () => {
      // A 的 100 过不了 >= 150，200 过不了 OR；只有 B 的 300 两条都满足
      const names = await findNames({
        combinator: 'and',
        rules: [
          { field: 'name', operator: 'in', value: [nameA, nameB] },
          {
            field: 'orders',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [
                { field: 'amount', operator: '>=', value: 150 },
                {
                  combinator: 'or',
                  rules: [
                    { field: 'amount', operator: '=', value: 100 },
                    { field: 'amount', operator: '=', value: 300 }
                  ]
                }
              ]
            }
          }
        ]
      });

      expect(names).toEqual([nameB]);
    });

    it('两层关系：订单项上的 OR 作用于完整嵌入路径', async () => {
      const names = await findNames({
        combinator: 'and',
        rules: [
          { field: 'name', operator: 'in', value: [nameA, nameB] },
          {
            field: 'orders',
            operator: 'exists',
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'items',
                  operator: 'exists',
                  where: {
                    combinator: 'or',
                    rules: [
                      { field: 'quantity', operator: '=', value: 1 },
                      { field: 'quantity', operator: '=', value: 7 }
                    ]
                  }
                }
              ]
            }
          }
        ]
      });

      expect(names).toEqual([nameA]);
    });
  });
});
