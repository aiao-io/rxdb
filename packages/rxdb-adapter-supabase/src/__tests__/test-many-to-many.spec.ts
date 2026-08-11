/**
 * @fileoverview 多对多关系测试
 * 测试 Category 和 OrderItem 之间的 MANY_TO_MANY 关系
 * 验证 Supabase 适配器对中间表的操作
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { Category, ENTITIES, Order, OrderItem, User } from '@aiao/rxdb-test/shop';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import type { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('MANY_TO_MANY 关系测试 (Supabase)', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterSupabase;
  let tablesExist = false;

  // 仓库。
  let userRepo: SupabaseRepository<typeof User>;
  let orderRepo: SupabaseRepository<typeof Order>;
  let orderItemRepo: SupabaseRepository<typeof OrderItem>;
  let categoryRepo: SupabaseRepository<typeof Category>;

  // 测试数据
  let user: User;
  let order: Order;

  beforeAll(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('VITE_SUPABASE_URL 和 VITE_SUPABASE_KEY 必须配置');
    }

    rxdb = new RxDB({
      dbName: 'supabase-m2m-test',
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: {
        remote: { adapter: 'supabase' },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'supabase',
      db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await rxdb.connect('supabase');
    rxdb.init();

    // 获取 repositories
    userRepo = adapter.getRepository(User) as unknown as SupabaseRepository<typeof User>;
    orderRepo = adapter.getRepository(Order) as unknown as SupabaseRepository<typeof Order>;
    orderItemRepo = adapter.getRepository(OrderItem) as unknown as SupabaseRepository<typeof OrderItem>;
    categoryRepo = adapter.getRepository(Category) as unknown as SupabaseRepository<typeof Category>;

    // 检查表是否存在（包括中间表）
    try {
      await userRepo.find({ where: { combinator: 'and', rules: [] }, limit: 1 });
      await categoryRepo.find({ where: { combinator: 'and', rules: [] }, limit: 1 });

      // 检查中间表是否存在
      const { error: joinTableError } = await adapter.client
        .schema('shop')
        .from('Category_OrderItem')
        .select('*')
        .limit(1);

      if (joinTableError) {
        throw new Error(`Category_OrderItem 中间表不可用: ${joinTableError.message}`);
      }

      tablesExist = true;
    } catch (error) {
      throw new Error(`检查 MANY_TO_MANY 测试表失败: ${(error as Error).message}`, { cause: error });
    }

    // 创建测试基础数据
    user = new User();
    user.name = 'M2M-Test-User-' + Date.now();
    await userRepo.create(user);

    order = new Order();
    order.number = 'M2M-TEST-' + Date.now();
    order.amount = 1000;
    order.ownerId = user.id;
    await orderRepo.create(order);
  });

  afterAll(async () => {
    if (!tablesExist) return;
    try {
      // 清理测试数据
      if (order?.id) await orderRepo.remove(order);
      if (user?.id) await userRepo.remove(user);
    } catch {
      /* 忽略清理错误。 */
    }
  });

  /**
   * 查询中间表数据
   * Supabase 中间表命名: shop$Category_OrderItem
   */
  async function queryJoinTable(categoryId?: string, orderItemId?: string): Promise<Record<string, unknown>[]> {
    let query = adapter.client.schema('shop').from('Category_OrderItem').select('*');

    if (categoryId) {
      query = query.eq('categoriesId', categoryId);
    }
    if (orderItemId) {
      query = query.eq('orderItemsId', orderItemId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as unknown as Record<string, unknown>[];
  }

  /**
   * 向中间表插入关系
   */
  async function insertJoinTableRecord(categoryId: string, orderItemId: string): Promise<void> {
    const { error } = await adapter.client.schema('shop').from('Category_OrderItem').insert({
      categoriesId: categoryId,
      orderItemsId: orderItemId
    });
    if (error) throw error;
  }

  /**
   * 从中间表删除关系
   */
  async function deleteJoinTableRecord(categoryId: string, orderItemId: string): Promise<void> {
    const { error } = await adapter.client
      .schema('shop')
      .from('Category_OrderItem')
      .delete()
      .eq('categoriesId', categoryId)
      .eq('orderItemsId', orderItemId);
    if (error) throw error;
  }

  describe('中间表直接操作', () => {
    let testCategory: Category;
    let testOrderItem: OrderItem;

    beforeAll(async () => {
      // 确保外层 order 已成功创建

      testCategory = new Category();
      testCategory.name = 'M2M-Direct-Category-' + Date.now();
      await categoryRepo.create(testCategory);

      testOrderItem = new OrderItem();
      testOrderItem.productName = 'M2M-Direct-Item-' + Date.now();
      testOrderItem.quantity = 1;
      testOrderItem.price = 100;
      testOrderItem.orderId = order.id;
      await orderItemRepo.create(testOrderItem);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        // 先清理中间表
        await deleteJoinTableRecord(testCategory.id, testOrderItem.id).catch(() => {
          /* 忽略。 */
        });
        if (testOrderItem?.id) await orderItemRepo.remove(testOrderItem);
        if (testCategory?.id) await categoryRepo.remove(testCategory);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    it('应该能向中间表插入关系记录', async () => {
      // 插入关系
      await insertJoinTableRecord(testCategory.id, testOrderItem.id);

      // 验证关系已创建
      const rows = await queryJoinTable(testCategory.id, testOrderItem.id);
      expect(rows.length).toBe(1);
      expect(rows[0].categoriesId).toBe(testCategory.id);
      expect(rows[0].orderItemsId).toBe(testOrderItem.id);
    });

    it('应该能从中间表删除关系记录', async () => {
      // 确保关系存在
      const beforeRows = await queryJoinTable(testCategory.id, testOrderItem.id);
      if (beforeRows.length === 0) {
        await insertJoinTableRecord(testCategory.id, testOrderItem.id);
      }

      // 删除关系
      await deleteJoinTableRecord(testCategory.id, testOrderItem.id);

      // 验证关系已删除
      const afterRows = await queryJoinTable(testCategory.id, testOrderItem.id);
      expect(afterRows.length).toBe(0);
    });
  });

  describe('通过多对多关系查询', () => {
    let category1: Category;
    let category2: Category;
    let orderItem1: OrderItem;
    let orderItem2: OrderItem;

    beforeAll(async () => {
      // 确保外层 order 已成功创建

      // 创建分类
      category1 = new Category();
      category1.name = 'M2M-Query-Electronics-' + Date.now();
      await categoryRepo.create(category1);

      category2 = new Category();
      category2.name = 'M2M-Query-Books-' + Date.now();
      await categoryRepo.create(category2);

      // 创建订单项
      orderItem1 = new OrderItem();
      orderItem1.productName = 'M2M-Query-Laptop-' + Date.now();
      orderItem1.quantity = 1;
      orderItem1.price = 5000;
      orderItem1.orderId = order.id;
      await orderItemRepo.create(orderItem1);

      orderItem2 = new OrderItem();
      orderItem2.productName = 'M2M-Query-Novel-' + Date.now();
      orderItem2.quantity = 2;
      orderItem2.price = 50;
      orderItem2.orderId = order.id;
      await orderItemRepo.create(orderItem2);

      // 建立多对多关系
      // orderItem1 -> category1 (电子产品)
      // orderItem2 -> category2 (书籍)
      await insertJoinTableRecord(category1.id, orderItem1.id);
      await insertJoinTableRecord(category2.id, orderItem2.id);
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        // 清理中间表
        await deleteJoinTableRecord(category1.id, orderItem1.id).catch(() => {
          /* 忽略。 */
        });
        await deleteJoinTableRecord(category2.id, orderItem2.id).catch(() => {
          /* 忽略。 */
        });
        // 清理实体
        if (orderItem1?.id) await orderItemRepo.remove(orderItem1);
        if (orderItem2?.id) await orderItemRepo.remove(orderItem2);
        if (category1?.id) await categoryRepo.remove(category1);
        if (category2?.id) await categoryRepo.remove(category2);
      } catch {
        /* 忽略清理错误。 */
      }
    });

    // TODO: PostgREST 限制 - 双向多对多关系导致 "more than one relationship was found"
    // 需要在查询中指定外键名称来消除歧义
    it('应该能通过分类查询关联的订单项', async () => {
      // 通过 EXISTS 查询有电子产品分类的订单项
      const items = await orderItemRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'categories',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'id',
                    operator: '=',
                    value: category1.id
                  }
                ]
              }
            }
          ]
        }
      });

      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some(item => item.id === orderItem1.id)).toBe(true);
    });

    // TODO: PostgREST 限制 - 双向多对多关系导致 "more than one relationship was found"
    it('应该能通过订单项查询关联的分类', async () => {
      // 通过 EXISTS 查询关联了特定订单项的分类
      const categories = await categoryRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'orderItems',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'id',
                    operator: '=',
                    value: orderItem2.id
                  }
                ]
              }
            }
          ]
        }
      });

      expect(categories.length).toBeGreaterThanOrEqual(1);
      expect(categories.some(cat => cat.id === category2.id)).toBe(true);
    });

    it('应该能查询一个订单项的所有分类', async () => {
      // 查询关联了 orderItem1 的所有分类
      const joinRows = await queryJoinTable(undefined, orderItem1.id);
      expect(joinRows.length).toBeGreaterThanOrEqual(1);

      // 获取分类 ID 列表
      const categoryIds = joinRows.map(row => row.categoriesId);
      expect(categoryIds).toContain(category1.id);
    });

    it('应该能查询一个分类的所有订单项', async () => {
      // 查询关联了 category2 的所有订单项
      const joinRows = await queryJoinTable(category2.id);
      expect(joinRows.length).toBeGreaterThanOrEqual(1);

      // 获取订单项 ID 列表
      const orderItemIds = joinRows.map(row => row.orderItemsId);
      expect(orderItemIds).toContain(orderItem2.id);
    });
  });

  describe('批量关系操作', () => {
    let batchCategory: Category;
    let batchOrderItems: OrderItem[] = [];

    beforeAll(async () => {
      // 确保外层 order 已成功创建

      // 创建一个分类
      batchCategory = new Category();
      batchCategory.name = 'M2M-Batch-Category-' + Date.now();
      await categoryRepo.create(batchCategory);

      // 创建多个订单项
      for (let i = 0; i < 3; i++) {
        const item = new OrderItem();
        item.productName = `M2M-Batch-Item-${i}-${Date.now()}`;
        item.quantity = i + 1;
        item.price = 100 * (i + 1);
        item.orderId = order.id;
        await orderItemRepo.create(item);
        batchOrderItems.push(item);
      }

      // 建立所有关系
      for (const item of batchOrderItems) {
        await insertJoinTableRecord(batchCategory.id, item.id);
      }
    });

    afterAll(async () => {
      if (!tablesExist) return;
      try {
        // 清理中间表
        for (const item of batchOrderItems) {
          await deleteJoinTableRecord(batchCategory.id, item.id).catch(() => {
            /* 忽略。 */
          });
        }
        // 清理实体
        for (const item of batchOrderItems) {
          await orderItemRepo.remove(item).catch(() => {
            /* 忽略。 */
          });
        }
        if (batchCategory?.id) await categoryRepo.remove(batchCategory);
      } catch {
        /* 忽略清理错误。 */
      }
      batchOrderItems = [];
    });

    it('应该能处理一个分类关联多个订单项', async () => {
      // 查询该分类关联的所有订单项
      const joinRows = await queryJoinTable(batchCategory.id);
      expect(joinRows.length).toBe(3);

      // 验证所有订单项都在关系中
      const orderItemIds = joinRows.map(row => row.orderItemsId);
      for (const item of batchOrderItems) {
        expect(orderItemIds).toContain(item.id);
      }
    });

    // TODO: PostgREST 限制 - 双向多对多关系导致 "more than one relationship was found"
    it('应该能通过 EXISTS 查询有特定分类的所有订单项', async () => {
      const items = await orderItemRepo.find({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'categories',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'id',
                    operator: '=',
                    value: batchCategory.id
                  }
                ]
              }
            }
          ]
        }
      });

      expect(items.length).toBeGreaterThanOrEqual(3);
      for (const batchItem of batchOrderItems) {
        expect(items.some(item => item.id === batchItem.id)).toBe(true);
      }
    });
  });
});
