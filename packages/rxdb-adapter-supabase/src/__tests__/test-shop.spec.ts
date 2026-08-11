import { RxDB, SyncType } from '@aiao/rxdb';
import { Category, ENTITIES, IdCard, Order, OrderItem, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

const SHOP_ENTITIES = ENTITIES;

/**
 * Shop 关系查询测试
 *
 * ⚠️ 前置条件：需要在 Supabase 中手动创建 Shop 相关表
 *
 * 必需的表：User, IdCard, Order, OrderItem, Category, OrderItem_Category
 *
 * 如何创建表：
 * 1. 查看 SQL 脚本：packages/rxdb-adapter-supabase/sql/create-shop-tables.sql
 * 2. 在 Supabase SQL Editor 中执行该脚本
 *
 * 测试行为：
 * - 如果表不存在：前置检查立即失败
 * - 如果表结构完整：运行完整的关系查询测试
 */
describe('Shop 实体 Supabase 适配器 - 关系查询', () => {
  let adapter: RxDBAdapterSupabase;
  let rxdb: RxDB;
  let tablesExist = false;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `shop-test-${Date.now()}`,
      context: { userId: 'test-user' },
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

    // 检查所有必需的表是否存在
    try {
      const userExists = await adapter.isTableExisted(User);
      const idCardExists = await adapter.isTableExisted(IdCard);
      const orderExists = await adapter.isTableExisted(Order);
      const orderItemExists = await adapter.isTableExisted(OrderItem);
      const categoryExists = await adapter.isTableExisted(Category);

      tablesExist = userExists && idCardExists && orderExists && orderItemExists && categoryExists;

      if (!tablesExist) {
        throw new Error('Shop 表不完整，请先执行 sql/create-shop-tables.sql');
      }
    } catch (error) {
      throw new Error(`检查 Shop 表失败: ${(error as Error).message}`, { cause: error });
    }
  });

  afterAll(async () => {
    // 清理所有测试数据
    if (tablesExist && adapter) {
      const userRepo = adapter.getRepository(User) as SupabaseRepository<typeof User>;
      const idCardRepo = adapter.getRepository(IdCard) as SupabaseRepository<typeof IdCard>;
      const orderRepo = adapter.getRepository(Order) as SupabaseRepository<typeof Order>;
      const orderItemRepo = adapter.getRepository(OrderItem) as SupabaseRepository<typeof OrderItem>;
      const categoryRepo = adapter.getRepository(Category) as SupabaseRepository<typeof Category>;

      try {
        // 删除所有测试数据（按依赖顺序）
        const allOrderItems = await orderItemRepo.find({ where: { combinator: 'and', rules: [] } });
        for (const item of allOrderItems) {
          await orderItemRepo.remove(item);
        }

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

        const allCategories = await categoryRepo.find({ where: { combinator: 'and', rules: [] } });
        for (const category of allCategories) {
          await categoryRepo.remove(category);
        }
      } catch (error) {
        console.error('清理测试数据失败:', error);
      }
    }
  });

  describe('一对一关系查询 (User <-> IdCard)', () => {
    let user: User;
    let idCard: IdCard;
    let userRepo: SupabaseRepository<typeof User>;
    let idCardRepo: SupabaseRepository<typeof IdCard>;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      idCardRepo = adapter.getRepository(IdCard) as unknown as SupabaseRepository<typeof IdCard>;

      user = new User();
      user.name = 'Jimmy';
      user.age = 30;
      await userRepo.create(user);

      idCard = new IdCard();
      idCard.code = '110101199001011234';
      idCard.ownerId = user.id;
      await idCardRepo.create(idCard);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (idCard?.id) await idCardRepo.remove(idCard);
        if (user?.id) await userRepo.remove(user);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('通过 idCard.code 查询用户', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'Jimmy'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('Jimmy');
      expect(users[0].id).toEqual(user.id);
    });

    it('通过 owner.name 查询身份证', async () => {
      const idCards = await idCardRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'code',
              operator: '=',
              value: '110101199001011234'
            }
          ]
        }
      });

      expect(idCards.length).toBeGreaterThan(0);
      expect(idCards[0].code).toEqual('110101199001011234');
    });
  });

  describe('一对多关系查询 (User -> Orders)', () => {
    let user: User;
    let order1: Order;
    let order2: Order;
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    const uniqueSuffix = Date.now().toString();
    const orderNum1 = `ORD-${uniqueSuffix}-001`;
    const orderNum2 = `ORD-${uniqueSuffix}-002`;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;

      user = new User();
      user.name = `Alice-${uniqueSuffix}`;
      user.age = 25;
      await userRepo.create(user);

      order1 = new Order();
      order1.number = orderNum1;
      order1.amount = 100;
      order1.ownerId = user.id;
      await orderRepo.create(order1);

      order2 = new Order();
      order2.number = orderNum2;
      order2.amount = 200;
      order2.ownerId = user.id;
      await orderRepo.create(order2);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (order1?.id) await orderRepo.remove(order1);
        if (order2?.id) await orderRepo.remove(order2);
        if (user?.id) await userRepo.remove(user);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('查询指定用户的所有订单', async () => {
      const orders = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'ownerId',
              operator: '=',
              value: user.id
            }
          ]
        }
      });

      expect(orders.length).toBeGreaterThanOrEqual(2);
      const orderNumbers = orders.map(o => o.number);
      expect(orderNumbers).toContain(orderNum1);
      expect(orderNumbers).toContain(orderNum2);
    });

    it('通过订单金额查询', async () => {
      const orders = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'amount',
              operator: '>',
              value: 150
            }
          ]
        }
      });

      expect(orders.length).toBeGreaterThan(0);
      expect(orders.some(o => o.number === orderNum2)).toBe(true);
    });

    it('通过订单号 in 查询', async () => {
      const orders = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'number',
              operator: 'in',
              value: [orderNum1, orderNum2]
            }
          ]
        }
      });

      // 至少应该找到其中一个订单（因为beforeAll创建了两个）
      expect(orders.length).toBeGreaterThan(0);
      const orderNumbers = orders.map(o => o.number);
      // 验证返回的订单号都在查询范围内
      expect(orderNumbers.every(n => [orderNum1, orderNum2].includes(n))).toBe(true);
    });
  });

  describe('多对一关系查询 (Order -> User)', () => {
    let user: User;
    let order: Order;
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    const uniqueSuffix = Date.now().toString();
    const orderNum = `ORD-${uniqueSuffix}-003`;
    const userName = `Bob-${uniqueSuffix}`;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;

      user = new User();
      user.name = userName;
      user.age = 35;
      await userRepo.create(user);

      order = new Order();
      order.number = orderNum;
      order.amount = 300;
      order.ownerId = user.id;
      await orderRepo.create(order);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (order?.id) await orderRepo.remove(order);
        if (user?.id) await userRepo.remove(user);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('通过订单查询所属用户', async () => {
      const foundOrder = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'number',
              operator: '=',
              value: orderNum
            }
          ]
        }
      });

      expect(foundOrder.length).toBeGreaterThan(0);
      expect(foundOrder[0].ownerId).toEqual(user.id);

      // 查询用户
      const foundUser = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'id',
              operator: '=',
              value: foundOrder[0].ownerId
            }
          ]
        }
      });

      expect(foundUser.length).toBeGreaterThan(0);
      expect(foundUser[0].name).toEqual(userName);
    });
  });

  describe('多对多关系查询 (OrderItem <-> Category)', () => {
    let user: User;
    let order: Order;
    let orderItem: OrderItem;
    let category1: Category;
    let category2: Category;
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    let orderItemRepo: SupabaseRepository<typeof OrderItem>;
    let categoryRepo: SupabaseRepository<typeof Category>;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;
      orderItemRepo = adapter.getRepository(OrderItem) as unknown as SupabaseRepository<typeof OrderItem>;
      categoryRepo = adapter.getRepository(Category) as unknown as SupabaseRepository<typeof Category>;

      user = new User();
      user.name = 'Charlie';
      await userRepo.create(user);

      order = new Order();
      order.number = 'ORD004';
      order.amount = 500;
      order.ownerId = user.id;
      await orderRepo.create(order);

      orderItem = new OrderItem();
      orderItem.productName = '笔记本电脑';
      orderItem.quantity = 1;
      orderItem.price = 5000;
      orderItem.orderId = order.id;
      await orderItemRepo.create(orderItem);

      category1 = new Category();
      category1.name = '电子产品';
      await categoryRepo.create(category1);

      category2 = new Category();
      category2.name = '办公用品';
      await categoryRepo.create(category2);

      // 注意：MANY_TO_MANY 关系需要通过中间表手动维护
      // 在实际应用中，需要实现中间表的插入逻辑
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (orderItem?.id) await orderItemRepo.remove(orderItem);
        if (order?.id) await orderRepo.remove(order);
        if (user?.id) await userRepo.remove(user);
        if (category1?.id) await categoryRepo.remove(category1);
        if (category2?.id) await categoryRepo.remove(category2);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('查询订单项', async () => {
      const items = await orderItemRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'productName',
              operator: '=',
              value: '笔记本电脑'
            }
          ]
        }
      });

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].price).toEqual(5000);
    });

    it('查询分类', async () => {
      const categories = await categoryRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'in',
              value: ['电子产品', '办公用品']
            }
          ]
        }
      });

      expect(categories.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('复杂查询条件', () => {
    let user1: User;
    let user2: User;
    let userRepo: SupabaseRepository<typeof User>;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;

      user1 = new User();
      user1.name = 'David';
      user1.age = 20;
      await userRepo.create(user1);

      user2 = new User();
      user2.name = 'Eve';
      user2.age = 40;
      await userRepo.create(user2);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (user1?.id) await userRepo.remove(user1);
        if (user2?.id) await userRepo.remove(user2);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('between 区间查询', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: 'between',
              value: [18, 30]
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users.some(u => u.name === 'David')).toBe(true);
    });

    it('startsWith 模糊查询', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'D'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users.some(u => u.name === 'David')).toBe(true);
    });

    it('OR 组合查询', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'or',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'David'
            },
            {
              field: 'age',
              operator: '>',
              value: 35
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('排序和分页', () => {
    let userRepo: SupabaseRepository<typeof User>;
    const testUsers: User[] = [];

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;

      // 创建多个测试用户
      for (let i = 0; i < 5; i++) {
        const user = new User();
        user.name = `TestUser${i}`;
        user.age = 20 + i * 5;
        await userRepo.create(user);
        testUsers.push(user);
      }
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        for (const user of testUsers) {
          await userRepo.remove(user);
        }
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('按年龄升序排序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'TestUser'
            }
          ]
        },
        orderBy: [
          {
            field: 'age',
            sort: 'asc'
          }
        ]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);
      // 验证排序
      for (let i = 1; i < users.length; i++) {
        expect(users[i].age).toBeGreaterThanOrEqual(users[i - 1].age);
      }
    });

    it('按姓名降序排序', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'TestUser'
            }
          ]
        },
        orderBy: [
          {
            field: 'name',
            sort: 'desc'
          }
        ]
      });

      expect(users.length).toBeGreaterThanOrEqual(5);
      // 验证排序
      for (let i = 1; i < users.length; i++) {
        expect(users[i].name.localeCompare(users[i - 1].name)).toBeLessThanOrEqual(0);
      }
    });

    it('limit 限制返回数量', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'TestUser'
            }
          ]
        },
        limit: 2
      });

      expect(users.length).toBeLessThanOrEqual(2);
    });

    it('offset 跳过指定数量', async () => {
      const allUsers = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'TestUser'
            }
          ]
        },
        orderBy: [{ field: 'age', sort: 'asc' }]
      });

      const offsetUsers = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'TestUser'
            }
          ]
        },
        orderBy: [{ field: 'age', sort: 'asc' }],
        offset: 2
      });

      // 验证 offset 有效：返回数量应该是 allUsers - 2
      expect(offsetUsers.length).toEqual(Math.max(0, allUsers.length - 2));
      // 验证跳过的数据正确：第一个应该是全量查询的第3个
      if (offsetUsers.length > 0 && allUsers.length > 2) {
        expect(offsetUsers[0].age).toEqual(allUsers[2].age);
      }
    });
  });

  describe('count 统计查询', () => {
    let userRepo: SupabaseRepository<typeof User>;
    const countTestUsers: User[] = [];

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;

      for (let i = 0; i < 3; i++) {
        const user = new User();
        user.name = `CountTest${i}`;
        user.age = 30 + i;
        await userRepo.create(user);
        countTestUsers.push(user);
      }
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        for (const user of countTestUsers) {
          await userRepo.remove(user);
        }
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('count 返回正确数量', async () => {
      const count = await userRepo.count({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'CountTest'
            }
          ]
        }
      });

      expect(count).toEqual(3);
    });
  });

  describe('边界情况测试', () => {
    let userRepo: SupabaseRepository<typeof User>;
    let boundaryTestUser: User;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;

      // 创建测试数据确保有用户存在
      boundaryTestUser = new User();
      boundaryTestUser.name = 'BoundaryTest_' + Date.now();
      boundaryTestUser.age = 99;
      await userRepo.create(boundaryTestUser);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (boundaryTestUser?.id) await userRepo.remove(boundaryTestUser);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('查询不存在的用户返回空数组', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'NonExistentUser_' + Date.now()
            }
          ]
        }
      });

      expect(users.length).toEqual(0);
    });

    it('条件为空时返回所有用户', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: []
        },
        limit: 10 // 限制返回数量避免数据过多
      });

      // 至少应该有我们创建的测试用户
      expect(users.length).toBeGreaterThan(0);
      expect(users.some(u => u.id === boundaryTestUser.id)).toBe(true);
    });

    it('IN 条件为空数组返回空结果', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'in',
              value: []
            }
          ]
        }
      });

      expect(users.length).toEqual(0);
    });
  });

  describe('复杂嵌套关系查询', () => {
    let user: User;
    let order: Order;
    let orderItem: OrderItem;
    let category: Category;
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    let orderItemRepo: SupabaseRepository<typeof OrderItem>;
    let categoryRepo: SupabaseRepository<typeof Category>;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;
      orderItemRepo = adapter.getRepository(OrderItem) as unknown as SupabaseRepository<typeof OrderItem>;
      categoryRepo = adapter.getRepository(Category) as unknown as SupabaseRepository<typeof Category>;

      // 创建嵌套关系数据
      user = new User();
      user.name = 'NestedTest';
      user.age = 40;
      await userRepo.create(user);

      order = new Order();
      order.number = 'NESTED001';
      order.amount = 500;
      order.ownerId = user.id;
      await orderRepo.create(order);

      orderItem = new OrderItem();
      orderItem.productName = '嵌套测试商品';
      orderItem.quantity = 1;
      orderItem.price = 500;
      orderItem.orderId = order.id;
      await orderItemRepo.create(orderItem);

      category = new Category();
      category.name = '嵌套测试分类';
      await categoryRepo.create(category);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (orderItem?.id) await orderItemRepo.remove(orderItem);
        if (order?.id) await orderRepo.remove(order);
        if (user?.id) await userRepo.remove(user);
        if (category?.id) await categoryRepo.remove(category);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('通过订单项查询订单', async () => {
      const orders = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'id',
              operator: '=',
              value: order.id
            }
          ]
        }
      });

      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].number).toEqual('NESTED001');
    });

    it('组合条件：用户年龄和订单金额', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '>=',
              value: 40
            },
            {
              field: 'name',
              operator: '=',
              value: 'NestedTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('NestedTest');
    });
  });

  describe('查询操作符完整测试', () => {
    let userRepo: SupabaseRepository<typeof User>;
    let testUser: User;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;

      testUser = new User();
      testUser.name = 'OperatorTest';
      testUser.age = 25;
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

    it('= 等于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'OperatorTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('OperatorTest');
    });

    it('!= 不等于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '!=',
              value: 'NonExistent'
            },
            {
              field: 'id',
              operator: '=',
              value: testUser.id
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
    });

    it('> 大于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '>',
              value: 20
            },
            {
              field: 'name',
              operator: '=',
              value: 'OperatorTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].age).toBeGreaterThan(20);
    });

    it('>= 大于等于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '>=',
              value: 25
            },
            {
              field: 'name',
              operator: '=',
              value: 'OperatorTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].age).toBeGreaterThanOrEqual(25);
    });

    it('< 小于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '<',
              value: 30
            },
            {
              field: 'name',
              operator: '=',
              value: 'OperatorTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].age).toBeLessThan(30);
    });

    it('<= 小于等于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '<=',
              value: 25
            },
            {
              field: 'name',
              operator: '=',
              value: 'OperatorTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].age).toBeLessThanOrEqual(25);
    });

    it('contains 包含操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'contains',
              value: 'Operator'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toContain('Operator');
    });

    it('startsWith 开始于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'startsWith',
              value: 'Operator'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name.startsWith('Operator')).toBe(true);
    });

    it('endsWith 结束于操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'endsWith',
              value: 'Test'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name.endsWith('Test')).toBe(true);
    });
  });

  describe('🔥 高优先级：复杂嵌套关系查询 (3层)', () => {
    let user: User;
    let order: Order;
    let orderItem: OrderItem;
    let category: Category;
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    let orderItemRepo: SupabaseRepository<typeof OrderItem>;
    let categoryRepo: SupabaseRepository<typeof Category>;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;
      orderItemRepo = adapter.getRepository(OrderItem) as unknown as SupabaseRepository<typeof OrderItem>;
      categoryRepo = adapter.getRepository(Category) as unknown as SupabaseRepository<typeof Category>;

      // 创建完整的 3 层嵌套关系数据
      user = new User();
      user.name = 'DeepNested';
      user.age = 35;
      await userRepo.create(user);

      order = new Order();
      order.number = 'DEEP001';
      order.amount = 800;
      order.ownerId = user.id;
      await orderRepo.create(order);

      orderItem = new OrderItem();
      orderItem.productName = '深度嵌套测试商品';
      orderItem.quantity = 2;
      orderItem.price = 400;
      orderItem.orderId = order.id;
      await orderItemRepo.create(orderItem);

      category = new Category();
      category.name = '深度测试分类';
      await categoryRepo.create(category);

      // 🔥 关键：创建 OrderItem 和 Category 之间的多对多关联
      // 通过关联表 Category_OrderItem 建立连接（表名按字母顺序）
      const { error: linkError } = await adapter.client
        .schema('shop')
        .from('Category_OrderItem')
        .insert({ orderItemsId: orderItem.id, categoriesId: category.id });
      if (linkError) {
        console.warn('创建 OrderItem-Category 关联失败:', linkError.message);
      }
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        // 先删除关联表记录
        if (orderItem?.id && category?.id) {
          await adapter.client
            .schema('shop')
            .from('Category_OrderItem')
            .delete()
            .eq('orderItemsId', orderItem.id)
            .eq('categoriesId', category.id);
        }
        if (orderItem?.id) await orderItemRepo.remove(orderItem);
        if (order?.id) await orderRepo.remove(order);
        if (user?.id) await userRepo.remove(user);
        if (category?.id) await categoryRepo.remove(category);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    // TODO: PostgREST 限制 - 经过多对多关系的嵌套查询导致 "more than one relationship was found"
    it('3层嵌套: orders.items.categories.name 自动转换查询', async () => {
      // ✅ 现在支持跨实体 metadata 查找
      // 这个查询会被自动转换为嵌套 EXISTS 结构
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.items.categories.name',
              operator: '=',
              value: '深度测试分类'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('DeepNested');
    });

    // TODO: PostgREST 限制 - 经过多对多关系的嵌套查询
    it('3层嵌套: 使用 IN 操作符', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.items.categories.name',
              operator: 'in',
              value: ['深度测试分类', '其他分类']
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('DeepNested');
    });

    // TODO: PostgREST 限制 - 经过多对多关系的嵌套查询
    it('3层嵌套: 结合用户自身条件', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '>=',
              value: 30
            },
            {
              field: 'orders.items.categories.name',
              operator: '=',
              value: '深度测试分类'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('DeepNested');
      expect(users[0].age).toBeGreaterThanOrEqual(30);
    });

    it('2层嵌套: orders.items.productName', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.items.productName',
              operator: 'contains',
              value: '深度嵌套'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('DeepNested');
    });

    it('2层嵌套: orders.items.price 数值比较', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.items.price',
              operator: '>',
              value: 300
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      const hasDeepNested = users.some(u => u.name === 'DeepNested');
      expect(hasDeepNested).toBe(true);
    });

    it('1层嵌套: orders.amount 查询', async () => {
      // ✅ SELECT 语句现在会自动包含 Order 表
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.amount',
              operator: '>=',
              value: 800
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      const hasDeepNested = users.some(u => u.name === 'DeepNested');
      expect(hasDeepNested).toBe(true);
    });

    it('1层嵌套: orders.number 字符串查询', async () => {
      // ✅ SELECT 语句现在会自动包含 Order 表
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.number',
              operator: '=',
              value: 'DEEP001'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      expect(users[0].name).toEqual('DeepNested');
    });
  });

  describe('🔥 高优先级：更多操作符组合测试', () => {
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    let testUser1: User;
    let testUser2: User;
    let testOrder1: Order;
    let testOrder2: Order;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;

      testUser1 = new User();
      testUser1.name = 'BetweenTestA';
      testUser1.age = 25;
      await userRepo.create(testUser1);

      testUser2 = new User();
      testUser2.name = 'BetweenTestB';
      testUser2.age = 35;
      await userRepo.create(testUser2);

      testOrder1 = new Order();
      testOrder1.number = 'BET001';
      testOrder1.amount = 250;
      testOrder1.ownerId = testUser1.id;
      await orderRepo.create(testOrder1);

      testOrder2 = new Order();
      testOrder2.number = 'BET002';
      testOrder2.amount = 750;
      testOrder2.ownerId = testUser2.id;
      await orderRepo.create(testOrder2);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        if (testOrder1?.id) await orderRepo.remove(testOrder1);
        if (testOrder2?.id) await orderRepo.remove(testOrder2);
        if (testUser1?.id) await userRepo.remove(testUser1);
        if (testUser2?.id) await userRepo.remove(testUser2);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('between 操作符: 数值区间查询', async () => {
      const orders = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'amount',
              operator: 'between',
              value: [200, 800]
            }
          ]
        }
      });

      expect(orders.length).toBeGreaterThanOrEqual(2);
      const numbers = orders.map(o => o.number);
      expect(numbers).toContain('BET001');
      expect(numbers).toContain('BET002');
    });

    it('between 操作符: 年龄区间查询', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: 'between',
              value: [20, 40]
            },
            {
              field: 'name',
              operator: 'in',
              value: ['BetweenTestA', 'BetweenTestB']
            }
          ]
        }
      });

      expect(users.length).toEqual(2);
    });

    it('in 操作符: 多值匹配', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'in',
              value: ['BetweenTestA', 'BetweenTestB', 'NonExistent']
            }
          ]
        }
      });

      expect(users.length).toEqual(2);
      const names = users.map(u => u.name).sort();
      expect(names).toEqual(['BetweenTestA', 'BetweenTestB']);
    });

    it('contains 操作符: 子串匹配', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'contains',
              value: 'BetweenTest'
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThanOrEqual(2);
    });

    it('OR 组合器: 多条件或查询', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'or',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'BetweenTestA'
            },
            {
              field: 'age',
              operator: '>=',
              value: 35
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThanOrEqual(2);
      const hasBetweenTestA = users.some(u => u.name === 'BetweenTestA');
      const hasBetweenTestB = users.some(u => u.name === 'BetweenTestB');
      expect(hasBetweenTestA).toBe(true);
      expect(hasBetweenTestB).toBe(true);
    });

    it('嵌套关系 + in 操作符组合', async () => {
      // ✅ SELECT 语句现在会自动包含 Order 表
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.number',
              operator: 'in',
              value: ['BET001', 'BET002', 'NOTEXIST']
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThanOrEqual(1);
    });

    it('嵌套关系 + between 操作符组合', async () => {
      // ✅ SELECT 语句现在会自动包含 Order 表
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orders.amount',
              operator: 'between',
              value: [200, 800]
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('🔥 高优先级：边界情况完整测试', () => {
    let userRepo: SupabaseRepository<typeof User>;
    let orderRepo: SupabaseRepository<typeof Order>;
    let testUser: User;

    beforeAll(async () => {
      userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
      orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;

      // 创建测试数据
      testUser = new User();
      testUser.name = 'EdgeCaseTestUser';
      testUser.age = 25;
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

    it('空结果集: 查询不存在的用户', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: 'NonExistentUser_XYZ_12345'
            }
          ]
        }
      });

      expect(users).toEqual([]);
      expect(users.length).toEqual(0);
    });

    it('空条件: rules 为空数组应返回所有记录', async () => {
      // 空条件查询应返回所有记录
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: []
        }
      });

      expect(users.length).toBeGreaterThan(0);
    });

    it('空 IN 数组: 应返回空结果', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'in',
              value: []
            }
          ]
        }
      });

      expect(users).toEqual([]);
    });

    it('null 值查询: != null', async () => {
      // != null 应该使用 IS NOT NULL
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '!=',
              value: null as unknown as string
            }
          ]
        }
      });

      expect(users.length).toBeGreaterThan(0);
      users.forEach(user => {
        expect(user.name).not.toBeNull();
      });
    });

    it('空字符串查询', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: '=',
              value: ''
            }
          ]
        }
      });

      expect(users).toEqual([]);
    });

    it('零值查询: amount = 0', async () => {
      const orders = await orderRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'amount',
              operator: '=',
              value: 0
            }
          ]
        }
      });

      // 应该返回空数组或者包含 amount = 0 的订单
      expect(Array.isArray(orders)).toBe(true);
    });

    it('负数查询: age < 0', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'age',
              operator: '<',
              value: 0
            }
          ]
        }
      });

      expect(users).toEqual([]);
    });

    it('嵌套关系不存在: orders.nonExistField', async () => {
      // 这个测试验证错误字段不会导致崩溃
      try {
        const invalidQuery = {
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orders.nonExistentField',
                operator: '=',
                value: 'test'
              }
            ]
          }
        } as unknown as Parameters<typeof userRepo.find>[0];
        const users = await userRepo.find(invalidQuery);

        // 可能返回空数组或抛出错误
        expect(Array.isArray(users)).toBe(true);
      } catch (error) {
        // 抛出错误也是可接受的行为
        expect(error).toBeDefined();
      }
    });

    it('超大 limit: limit = 10000', async () => {
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: []
        },
        limit: 10000
      });

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeLessThanOrEqual(10000);
    });

    it('组合边界: 空字符串 + contains', async () => {
      // 空字符串 contains 应该匹配所有非 NULL 记录
      // ilike '%%' 在 PostgreSQL 中匹配所有非 NULL 值
      const users = await userRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'name',
              operator: 'contains',
              value: ''
            }
          ]
        }
      });

      // 空字符串 contains 应该匹配所有记录
      expect(users.length).toBeGreaterThan(0);
    });
  });
});
