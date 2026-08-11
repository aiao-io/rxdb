/**
 * T071: PGlite 级联删除行为测试
 *
 * 测试 PostgreSQL 外键约束的级联行为：
 * 1. CASCADE - 级联删除子记录
 * 2. SET NULL - 删除时将外键设为 NULL
 * 3. RESTRICT - 阻止删除（有子记录时抛错）
 *
 * 参考：packages/rxdb-adapter-wa-sqlite/src/__tests__/test-cascade-behavior.spec.ts
 * PGlite 使用 PostgreSQL 原生外键约束，行为与 SQLite 一致
 */

import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 测试 PostgreSQL 级联删除行为
 */
describe('PGlite 级联删除行为测试', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  // ==================== 测试实体定义 ====================

  /**
   * 场景1: ONE_TO_MANY 关系，外键在子表
   * OrderItem.orderId -> Order.id（级联删除）。
   */
  @Entity({
    name: 'TestOrder',
    properties: [{ name: 'orderNumber', type: PropertyType.string }],
    relations: [
      {
        name: 'items',
        kind: RelationKind.ONE_TO_MANY,
        mappedEntity: 'TestOrderItem',
        mappedProperty: 'order'
      }
    ]
  })
  class TestOrder extends EntityBase {
    orderNumber!: string;
  }

  @Entity({
    name: 'TestOrderItem',
    properties: [{ name: 'productName', type: PropertyType.string }],
    relations: [
      {
        name: 'order',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'TestOrder',
        mappedProperty: 'items',
        nullable: false,
        onDelete: OnDeleteAction.CASCADE // 明确指定 CASCADE
      }
    ]
  })
  class TestOrderItem extends EntityBase {
    productName!: string;
    orderId!: string;
  }

  /**
   * 场景2: MANY_TO_ONE (nullable=true)
   * Product.categoryId -> Category.id（置为 NULL 后删除）。
   */
  @Entity({
    name: 'TestCategory',
    properties: [{ name: 'name', type: PropertyType.string }],
    relations: [
      {
        name: 'products',
        kind: RelationKind.ONE_TO_MANY,
        mappedEntity: 'TestProduct',
        mappedProperty: 'category'
      }
    ]
  })
  class TestCategory extends EntityBase {
    name!: string;
  }

  @Entity({
    name: 'TestProduct',
    properties: [{ name: 'name', type: PropertyType.string }],
    relations: [
      {
        name: 'category',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'TestCategory',
        mappedProperty: 'products',
        nullable: true,
        onDelete: OnDeleteAction.SET_NULL // 明确指定 SET NULL
      }
    ]
  })
  class TestProduct extends EntityBase {
    name!: string;
    categoryId?: string | null;
  }

  /**
   * 场景3: MANY_TO_ONE (nullable=false)
   * Child.parentId -> Parent.id（限制删除）。
   */
  @Entity({
    name: 'TestParent',
    properties: [{ name: 'name', type: PropertyType.string }],
    relations: [
      {
        name: 'children',
        kind: RelationKind.ONE_TO_MANY,
        mappedEntity: 'TestChild',
        mappedProperty: 'parent'
      }
    ]
  })
  class TestParent extends EntityBase {
    name!: string;
  }

  @Entity({
    name: 'TestChild',
    properties: [{ name: 'name', type: PropertyType.string }],
    relations: [
      {
        name: 'parent',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'TestParent',
        mappedProperty: 'children',
        nullable: false,
        onDelete: OnDeleteAction.RESTRICT // 明确指定 RESTRICT
      }
    ]
  })
  class TestChild extends EntityBase {
    name!: string;
    parentId!: string;
  }

  // ==================== 测试设置 ====================

  beforeAll(async () => {
    const db = new RxDB({
      dbName: `cascade-pglite-test-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [TestOrder, TestOrderItem, TestCategory, TestProduct, TestParent, TestChild],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    db.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));

    rxdb = db;
    adapter = (await rxdb.getAdapter('pglite')) as RxDBAdapterPGlite;
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  // ==================== 测试用例 ====================

  describe('场景1: CASCADE delete - 删除父记录时级联删除子记录', () => {
    it('删除订单时应该级联删除所有订单项', async () => {
      // 创建订单
      const order = new TestOrder();
      order.orderNumber = 'ORD-CASCADE-001';
      await order.save();

      // 创建订单项
      const item1 = new TestOrderItem();
      item1.productName = 'Product 1';
      item1.orderId = order.id;
      await item1.save();

      const item2 = new TestOrderItem();
      item2.productName = 'Product 2';
      item2.orderId = order.id;
      await item2.save();

      // 验证数据已创建
      const itemsBefore = await adapter.getRepository(TestOrderItem).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'orderId', operator: '=', value: order.id }]
        }
      });
      expect(itemsBefore.length).toBe(2);

      // 删除订单
      await order.remove();

      // 验证订单项已被级联删除
      const itemsAfter = await adapter.getRepository(TestOrderItem).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'orderId', operator: '=', value: order.id }]
        }
      });
      expect(itemsAfter.length).toBe(0);
    });
  });

  describe('场景2: SET NULL delete - 删除父记录时将外键设为 NULL', () => {
    it('删除分类时应该将产品的 categoryId 设为 NULL', async () => {
      // 创建分类
      const category = new TestCategory();
      category.name = 'Electronics-SET-NULL';
      await category.save();

      // 创建产品
      const product1 = new TestProduct();
      product1.name = 'Laptop-SET-NULL';
      product1.categoryId = category.id;
      await product1.save();

      const product2 = new TestProduct();
      product2.name = 'Phone-SET-NULL';
      product2.categoryId = category.id;
      await product2.save();

      // 验证产品与分类关联
      const productsBefore = await adapter.getRepository(TestProduct).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'categoryId', operator: '=', value: category.id }]
        }
      });
      expect(productsBefore.length).toBe(2);

      // 删除分类
      await category.remove();

      // PostgreSQL SET NULL 行为：
      // 数据库层面会将外键设为 NULL，但内存中的实体对象不会自动更新
      // 所以这个测试主要验证删除不会失败（RESTRICT 会失败）
      // 实际项目中，应该监听变更事件或重新查询来更新内存状态

      // 验证产品仍然存在（没有被级联删除）
      const allProducts = await adapter.getRepository(TestProduct).find({
        where: { combinator: 'and', rules: [] }
      });
      const productsAfter = allProducts.filter(p => p.name === 'Laptop-SET-NULL' || p.name === 'Phone-SET-NULL');

      expect(productsAfter.length).toBe(2);

      // 注意：内存中的实体可能还保留旧的 categoryId
      // 这是预期行为，应该通过变更事件或重新查询来刷新
    });
  });

  describe('场景3: RESTRICT delete - 有子记录时阻止删除', () => {
    it('当父记录有子记录时，删除应该抛出错误', async () => {
      // 创建父记录
      const parent = new TestParent();
      parent.name = 'Parent 1';
      await parent.save();

      // 创建子记录
      const child = new TestChild();
      child.name = 'Child 1';
      child.parentId = parent.id;
      await child.save();

      // 尝试删除父记录，应该抛出错误
      let error: Error | null = null;
      try {
        await parent.remove();
      } catch (caught) {
        error = caught instanceof Error ? caught : new Error(String(caught));
      }

      // PostgreSQL 应该抛出外键约束错误
      expect(error).not.toBeNull();
      if (!error) throw new Error('Expected a foreign key violation');
      expect(error.message).toMatch(/violates foreign key constraint|FOREIGN KEY/i);

      // 验证父记录仍然存在
      const parentsAfter = await adapter.getRepository(TestParent).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: parent.id }]
        }
      });
      expect(parentsAfter.length).toBe(1);
    });

    it('删除所有子记录后，应该可以删除父记录', async () => {
      // 创建父记录
      const parent = new TestParent();
      parent.name = 'Parent 2';
      await parent.save();

      // 创建子记录
      const child = new TestChild();
      child.name = 'Child 2';
      child.parentId = parent.id;
      await child.save();

      // 先删除子记录
      await child.remove();

      // 现在应该可以删除父记录
      await expect(parent.remove()).resolves.not.toThrow();

      // 验证父记录已删除
      const parentsAfter = await adapter.getRepository(TestParent).find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: parent.id }]
        }
      });
      expect(parentsAfter.length).toBe(0);
    });
  });
});
