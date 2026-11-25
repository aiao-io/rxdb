/**
 * 多对多关系测试
 * 测试 Category 和 OrderItem 之间的 MANY_TO_MANY 关系
 * 重点验证添加和删除关系的一致性
 */

import {
  type EntityBase,
  type EntityType,
  getEntityMetadata,
  getEntityStatus,
  junctionEntityId,
  RelationKind,
  RxDB,
  SyncType
} from '@aiao/rxdb';
import { Category, ENTITIES, Order, OrderItem, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('MANY_TO_MANY 关系测试', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let user: User;
  let order: Order;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
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

    user = new User();
    user.name = 'Test User';
    await user.save();

    order = new Order();
    order.number = 'M2M-TEST-001';
    order.amount = 1000;
    order.owner$.set(user);
    await order.save();
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('基础关系操作', () => {
    it('应该创建并保存多对多关系', async () => {
      const category = new Category();
      category.name = 'Electronics';
      await category.save();

      const orderItem = new OrderItem();
      orderItem.productName = 'Laptop';
      orderItem.quantity = 1;
      orderItem.price = 1000;
      orderItem.order$.set(order);
      await orderItem.save();

      await orderItem.categories$.add(category);
      await orderItem.save();

      const result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "orderItemsId" = $1 AND "categoriesId" = $2`,
        [orderItem.id, category.id]
      );

      expect(result.rows.length).toBe(1);
    });

    it('应该从两个方向建立关系', async () => {
      const category1 = new Category();
      category1.name = 'Books';
      await category1.save();

      const orderItem1 = new OrderItem();
      orderItem1.productName = 'Novel';
      orderItem1.quantity = 1;
      orderItem1.price = 20;
      orderItem1.order$.set(order);
      await orderItem1.save();

      await orderItem1.categories$.add(category1);
      await orderItem1.save();

      const category2 = new Category();
      category2.name = 'Toys';
      await category2.save();

      const orderItem2 = new OrderItem();
      orderItem2.productName = 'Lego';
      orderItem2.quantity = 2;
      orderItem2.price = 50;
      orderItem2.order$.set(order);
      await orderItem2.save();

      await category2.orderItems$.add(orderItem2);
      await category2.save();

      const check1 = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category1.id, orderItem1.id]
      );
      expect(check1.rows.length).toBe(1);

      const check2 = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category2.id, orderItem2.id]
      );
      expect(check2.rows.length).toBe(1);
    });
  });

  describe('删除关系操作', () => {
    it('应该正确删除通过 add 创建的关系', async () => {
      const category = new Category();
      category.name = 'Delete-Test-Category';
      await category.save();

      const orderItem = new OrderItem();
      orderItem.productName = 'Delete-Test-Item';
      orderItem.quantity = 1;
      orderItem.price = 100;
      orderItem.order$.set(order);
      await orderItem.save();

      await orderItem.categories$.add(category);
      await orderItem.save();

      let result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );
      expect(result.rows.length).toBe(1);

      await orderItem.categories$.remove(category);
      await orderItem.save();

      result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );
      expect(result.rows.length).toBe(0);
    });

    it('应该正确处理多次添加和删除', async () => {
      const category = new Category();
      category.name = 'Multi-Op-Category';
      await category.save();

      const orderItem = new OrderItem();
      orderItem.productName = 'Multi-Op-Item';
      orderItem.quantity = 1;
      orderItem.price = 100;
      orderItem.order$.set(order);
      await orderItem.save();

      const queryM2M = async () =>
        adapter.internalQuery(
          `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
          [category.id, orderItem.id]
        );

      // 第一次添加
      await orderItem.categories$.add(category);
      await orderItem.save();
      expect((await queryM2M()).rows.length).toBe(1);

      // 第一次删除
      await orderItem.categories$.remove(category);
      await orderItem.save();
      expect((await queryM2M()).rows.length).toBe(0);

      // 第二次添加
      await orderItem.categories$.add(category);
      await orderItem.save();
      expect((await queryM2M()).rows.length).toBe(1);

      // 第二次删除
      await orderItem.categories$.remove(category);
      await orderItem.save();
      expect((await queryM2M()).rows.length).toBe(0);
    });
  });

  describe('关系缓存验证', () => {
    it('应该在 EntityStatus 中正确维护关系缓存', async () => {
      const category = new Category();
      category.name = 'Cache-Test-Category';
      await category.save();

      const orderItem = new OrderItem();
      orderItem.productName = 'Cache-Test-Item';
      orderItem.quantity = 1;
      orderItem.price = 100;
      orderItem.order$.set(order);
      await orderItem.save();

      orderItem.categories$.add(category);

      const orderItemStatus = getEntityStatus(orderItem);
      expect(orderItemStatus).toBeDefined();

      const needSaveEntities = orderItemStatus!.getNeedSaveEntities();
      expect(needSaveEntities.length).toBeGreaterThanOrEqual(1);
    });

    it('应该在删除关系后更新缓存', async () => {
      const category = new Category();
      category.name = 'Cache-Remove-Category';
      await category.save();

      const orderItem = new OrderItem();
      orderItem.productName = 'Cache-Remove-Item';
      orderItem.quantity = 1;
      orderItem.price = 100;
      orderItem.order$.set(order);
      await orderItem.save();

      orderItem.categories$.add(category);
      await orderItem.save();

      let result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );
      expect(result.rows.length).toBe(1);

      orderItem.categories$.remove(category);
      await orderItem.save();

      result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );
      expect(result.rows.length).toBe(0);
    });
  });

  describe('批量关系操作', () => {
    it('应该处理一个 OrderItem 关联多个 Category', async () => {
      const orderItem = new OrderItem();
      orderItem.productName = 'Multi-Category-Item';
      orderItem.quantity = 1;
      orderItem.price = 500;
      orderItem.order$.set(order);
      await orderItem.save();

      const categories: Category[] = [];
      for (let i = 0; i < 3; i++) {
        const category = new Category();
        category.name = `Bulk-Category-${i}`;
        await category.save();
        categories.push(category);
      }

      for (const category of categories) {
        await orderItem.categories$.add(category);
      }
      await orderItem.save();

      const result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "orderItemsId" = $1`,
        [orderItem.id]
      );

      expect(result.rows.length).toBe(3);
    });

    it('应该处理一个 Category 关联多个 OrderItem', async () => {
      const category = new Category();
      category.name = 'Multi-Item-Category';
      await category.save();

      const orderItems: OrderItem[] = [];
      for (let i = 0; i < 3; i++) {
        const orderItem = new OrderItem();
        orderItem.productName = `Bulk-Item-${i}`;
        orderItem.quantity = 1;
        orderItem.price = 100;
        orderItem.order$.set(order);
        await orderItem.save();
        orderItems.push(orderItem);
      }

      for (const orderItem of orderItems) {
        await category.orderItems$.add(orderItem);
      }
      await category.save();

      const result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1`,
        [category.id]
      );

      expect(result.rows.length).toBe(3);
    });
  });

  describe('字段映射一致性验证', () => {
    it('应该验证 nameA 和 nameB 的映射一致性', async () => {
      const category = new Category();
      category.name = 'Mapping-Test-Category';
      await category.save();

      const orderItem = new OrderItem();
      orderItem.productName = 'Mapping-Test-Item';
      orderItem.quantity = 1;
      orderItem.price = 100;
      orderItem.order$.set(order);
      await orderItem.save();

      await orderItem.categories$.add(category);
      await orderItem.save();

      const result = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );

      expect(result.rows.length).toBe(1);

      const verifyResult = await adapter.internalQuery(
        `SELECT "categoriesId", "orderItemsId" FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );
      expect(verifyResult.rows.length).toBe(1);
      expect(Reflect.get(verifyResult.rows[0], 'categoriesId')).toBe(category.id);
      expect(Reflect.get(verifyResult.rows[0], 'orderItemsId')).toBe(orderItem.id);

      await orderItem.categories$.remove(category);
      await orderItem.save();

      const resultAfterDelete = await adapter.internalQuery(
        `SELECT * FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );

      expect(resultAfterDelete.rows.length).toBe(0);
    });
  });

  describe('确定性关联行 id（US-228）', () => {
    const junctionOf = (): EntityType => {
      const relation = getEntityMetadata(OrderItem).relationMap.get('categories');
      if (relation?.kind !== RelationKind.MANY_TO_MANY) throw new Error('OrderItem.categories 不是多对多');
      return relation.junctionEntityType;
    };
    const derivedId = (category: Category, orderItem: OrderItem) =>
      junctionEntityId(getEntityMetadata(junctionOf()), [
        { foreignKey: 'categoriesId', id: category.id, uuid: true },
        { foreignKey: 'orderItemsId', id: orderItem.id, uuid: true }
      ]);
    const idsOf = async (category: Category, orderItem: OrderItem) => {
      const result = await adapter.internalQuery<{ id: string }>(
        `SELECT id FROM "shop"."Category_OrderItem" WHERE "categoriesId" = $1 AND "orderItemsId" = $2`,
        [category.id, orderItem.id]
      );
      return result.rows.map(row => row.id);
    };
    const newPair = async (name: string) => {
      const category = new Category();
      category.name = name;
      await category.save();
      const orderItem = new OrderItem();
      orderItem.productName = name;
      orderItem.quantity = 1;
      orderItem.price = 1;
      orderItem.order$.set(order);
      await orderItem.save();
      return { category, orderItem };
    };

    it('AC#1 从两端各关联一次：中间表只有一行，id 由两端 id 派生', async () => {
      const { category, orderItem } = await newPair('US-228 两端');

      await orderItem.categories$.add(category);
      await orderItem.save();
      await category.orderItems$.add(orderItem);
      await category.save();

      expect(await idsOf(category, orderItem)).toEqual([derivedId(category, orderItem)]);
    });

    it('AC#2 取消关联后重新关联：还是同一个 id，只有一行；重新关联的那一行照样删得掉', async () => {
      const { category, orderItem } = await newPair('US-228 重新关联');
      await orderItem.categories$.add(category);
      await orderItem.save();
      await orderItem.categories$.remove(category);
      await orderItem.save();
      expect(await idsOf(category, orderItem)).toEqual([]);

      await orderItem.categories$.add(category);
      await orderItem.save();
      expect(await idsOf(category, orderItem)).toEqual([derivedId(category, orderItem)]);

      await orderItem.categories$.remove(category);
      await orderItem.save();
      expect(await idsOf(category, orderItem)).toEqual([]);
    });

    it('AC#3 这一对已在本地库里、没有加载进内存：再关联并保存不报主键冲突，仍只有一行', async () => {
      const { category, orderItem } = await newPair('US-228 已在库里');
      const Junction = junctionOf() as unknown as new (data: object) => EntityBase;
      const stored = new Junction({
        id: derivedId(category, orderItem),
        categoriesId: category.id,
        orderItemsId: orderItem.id
      });
      await stored.save();
      // 内存里不再有这一行：例如别的设备推上来、本机刚拉到，还没被任何查询加载
      rxdb.entityManager.removeEntityCache(stored);

      await orderItem.categories$.add(category);
      await orderItem.save();
      expect(await idsOf(category, orderItem)).toEqual([derivedId(category, orderItem)]);

      // 保存之后实例接管了库里那一行：解绑删得掉
      await orderItem.categories$.remove(category);
      await orderItem.save();
      expect(await idsOf(category, orderItem)).toEqual([]);
    });
  });
});
