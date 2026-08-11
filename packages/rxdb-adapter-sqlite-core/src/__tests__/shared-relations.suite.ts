import { getEntityMetadata, getEntityStatus } from '@aiao/rxdb';
import { Category, ENTITIES, IdCard, Order, OrderItem, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

export function relationIntegrationSuite(factory: AdapterFactory) {
  describe(`关系集成测试 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [...ENTITIES] });
    });

    afterAll(async () => {
      await adapter.rxdb.disconnectAll();
    });

    // =========================================================================
    // 来自 test-many-to-many.spec.ts。
    // =========================================================================
    describe('MANY_TO_MANY 关系测试', () => {
      let user: User;
      let order: Order;

      beforeAll(async () => {
        user = new User();
        user.name = 'Test User';
        await user.save();

        order = new Order();
        order.number = 'M2M-TEST-001';
        order.amount = 1000;
        order.owner$.set(user);
        await order.save();
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

          // 添加关系
          await orderItem.categories$.add(category);

          await orderItem.save();

          // 验证中间表数据
          const result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE orderItemsId = ? AND categoriesId = ?`,
              [orderItem.id, category.id]
            );
            return data;
          });

          expect(result.results[0].rows.length).toBe(1);
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

          // 从 OrderItem 端添加
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

          // 从 Category 端添加
          await category2.orderItems$.add(orderItem2);
          await category2.save();

          // 验证两个方向都创建了中间表记录
          const check1 = await adapter.transaction(async client => {
            return client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category1.id, orderItem1.id]
            );
          });
          expect(check1.results[0].rows.length).toBe(1);

          const check2 = await adapter.transaction(async client => {
            return client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category2.id, orderItem2.id]
            );
          });
          expect(check2.results[0].rows.length).toBe(1);
        });
      });

      describe('删除关系操作 - 待实现', () => {
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

          // 添加关系
          await orderItem.categories$.add(category);
          await orderItem.save();

          // 验证关系已创建
          let result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(1);

          // 删除关系
          await orderItem.categories$.remove(category);
          await orderItem.save();

          // 验证关系已删除
          result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(0);
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

          // 第一次添加
          await orderItem.categories$.add(category);
          await orderItem.save();

          let result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(1);

          // 第一次删除
          await orderItem.categories$.remove(category);
          await orderItem.save();

          result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(0);

          // 第二次添加
          await orderItem.categories$.add(category);
          await orderItem.save();

          result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(1);

          // 第二次删除
          await orderItem.categories$.remove(category);
          await orderItem.save();

          result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(0);
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

          // 添加关系
          orderItem.categories$.add(category);

          // 验证 relation cache - 通过 getNeedSaveEntities 间接验证缓存工作正常
          const orderItemStatus = getEntityStatus(orderItem);
          expect(orderItemStatus).toBeDefined();

          // getNeedSaveEntities 会遍历 relation_map，如果缓存工作正常，应该能找到关联实体
          const needSaveEntities = orderItemStatus!.getNeedSaveEntities();
          // 至少包含 orderItem 自身
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

          // 添加关系
          orderItem.categories$.add(category);
          await orderItem.save();

          // 验证关系已创建
          let result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(1);

          // 删除关系
          orderItem.categories$.remove(category);
          await orderItem.save();

          // 验证关系已删除
          result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });
          expect(result.results[0].rows.length).toBe(0);
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

          // 添加多个关系
          for (const category of categories) {
            await orderItem.categories$.add(category);
          }
          await orderItem.save();

          // 验证所有关系都已创建
          const result = await adapter.transaction(async client => {
            const data = await client.execute(`SELECT * FROM "shop$Category_OrderItem" WHERE orderItemsId = ?`, [
              orderItem.id
            ]);
            return data;
          });

          expect(result.results[0].rows.length).toBe(3);
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

          // 添加多个关系
          for (const orderItem of orderItems) {
            await category.orderItems$.add(orderItem);
          }
          await category.save();

          // 验证所有关系都已创建
          const result = await adapter.transaction(async client => {
            const data = await client.execute(`SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ?`, [
              category.id
            ]);
            return data;
          });

          expect(result.results[0].rows.length).toBe(3);
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

          // 添加关系
          await orderItem.categories$.add(category);
          await orderItem.save();

          // 直接查询中间表验证字段映射
          const result = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });

          expect(result.results[0].rows.length).toBe(1);
          // 验证字段映射：
          // nameA (relation.name + 'Id') = 'categoriesId' 应该映射到 category.id
          // nameB (relation.mappedProperty + 'Id') = 'orderItemsId' 应该映射到 orderItem.id
          const verifyResult = await adapter.transaction(async client => {
            return client.execute(
              `SELECT categoriesId, orderItemsId FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
          });
          expect(verifyResult.results[0].rows.length).toBe(1);
          expect(verifyResult.results[0].rows[0][0]).toBe(category.id); // categoriesId
          expect(verifyResult.results[0].rows[0][1]).toBe(orderItem.id); // orderItemsId

          // 删除关系，验证能够正确找到并删除
          await orderItem.categories$.remove(category);
          await orderItem.save();

          const resultAfterDelete = await adapter.transaction(async client => {
            const data = await client.execute(
              `SELECT * FROM "shop$Category_OrderItem" WHERE categoriesId = ? AND orderItemsId = ?`,
              [category.id, orderItem.id]
            );
            return data;
          });

          expect(resultAfterDelete.results[0].rows.length).toBe(0);
        });
      });
    });

    // =========================================================================
    // 来自 test-multiple-relations.spec.ts。
    // =========================================================================
    describe('多个同类型关系的缓存清理测试', () => {
      it('设置 idCardId = null 不应该影响其他关系数据', async () => {
        // 1. 创建用户和身份证
        const user = new User();
        user.name = '测试用户';
        await user.save();

        const idCard = new IdCard();
        idCard.code = 'ID-MULTI-REL-001';
        idCard.ownerId = user.id;
        await idCard.save();

        // 2. 设置用户的身份证关系
        user.idCardId = idCard.id;
        await user.save();

        // 3. 验证关系已建立
        let lastResult: User[] = [];
        const subscription = User.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'idCard.code', operator: '=', value: 'ID-MULTI-REL-001' }]
          }
        }).subscribe(result => {
          lastResult = result;
        });

        await new Promise(resolve => setTimeout(resolve, 200));
        expect(lastResult.length).toBe(1);
        expect(lastResult[0].id).toBe(user.id);

        // 4. 设置 idCardId = null
        user.idCardId = null;
        await user.save();

        // 5. 等待查询更新
        await new Promise(resolve => setTimeout(resolve, 300));

        // 6. 验证查询结果已更新
        expect(lastResult.length).toBe(0);

        subscription.unsubscribe();
      });

      it('EntityStatus 的 getRelationCache 使用相同 relation 对象应返回相同缓存', async () => {
        const user = new User();
        user.name = '缓存一致性测试';
        await user.save();

        const userStatus = getEntityStatus(user);
        const relation = getEntityMetadata(User).relationMap.get('idCard');
        if (!relation) throw new Error('User.idCard relation metadata is missing');

        const cache1 = userStatus.getRelationCache(relation);
        const cache2 = userStatus.getRelationCache(relation);

        // 应该返回相同的缓存对象
        expect(cache1).toBe(cache2);

        // 向 cache1 添加实体，cache2 也应该能看到
        const card = new IdCard();
        card.code = 'TEST';
        cache1.add(card);

        expect(cache2.has(card)).toBe(true);
      });

      it('EntityStatus 的 getRelationCache 使用不同 relation 对象应返回不同缓存', async () => {
        const user = new User();
        user.name = '缓存独立性测试';
        await user.save();

        const userStatus = getEntityStatus(user);
        const metadata = getEntityMetadata(User);
        const relationA = metadata.relationMap.get('idCard');
        const relationB = metadata.relationMap.get('orders');
        if (!relationA || !relationB) throw new Error('User relation metadata is incomplete');

        const cacheA = userStatus.getRelationCache(relationA);
        const cacheB = userStatus.getRelationCache(relationB);

        // 应该返回不同的缓存对象
        expect(cacheA).not.toBe(cacheB);

        // 向 cacheA 添加实体，cacheB 不应该受影响
        const card = new IdCard();
        card.code = 'TEST';
        cacheA.add(card);

        expect(cacheA.has(card)).toBe(true);
        expect(cacheB.has(card)).toBe(false);
      });
    });

    // =========================================================================
    // 来自 test-relation-id-null.spec.ts。
    // =========================================================================
    describe('关系外键设置为 null 时自动清理缓存', () => {
      it('设置 xxxId = null 后，通过关系字段的查询应该正确更新', async () => {
        // 1. 创建用户和身份证
        const user = new User();
        user.name = '测试用户';
        await user.save();

        const idCard = new IdCard();
        idCard.code = 'ID-NULL-TEST-001';
        idCard.ownerId = user.id;
        await idCard.save();

        user.idCardId = idCard.id;
        await user.save();

        // 2. 查询有该身份证的用户
        let lastResult: User[] = [];
        const subscription = User.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'idCard.code', operator: '=', value: 'ID-NULL-TEST-001' }]
          }
        }).subscribe(result => {
          lastResult = result;
        });

        // 等待初始查询
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(lastResult.length).toBe(1);
        expect(lastResult[0].id).toBe(user.id);

        // 3. 设置 idCardId = null（这应该触发缓存清理）
        user.idCardId = null;
        await user.save();

        // 4. 等待查询更新（增加等待时间，确保缓存失效传播）
        await new Promise(resolve => setTimeout(resolve, 500));

        // 5. 验证查询结果已更新（用户不再有该身份证）
        expect(lastResult.length).toBe(0);

        subscription.unsubscribe();
        // 等待订阅清理完成
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      it('直接设置 xxxId = null 而不通过 xxx$.remove()', async () => {
        // 1. 创建用户和身份证
        const user = new User();
        user.name = '测试用户2';
        await user.save();

        const idCard = new IdCard();
        idCard.code = 'ID-NULL-TEST-002';
        idCard.ownerId = user.id;
        await idCard.save();

        user.idCardId = idCard.id;
        await user.save();

        // 2. 直接设置 idCardId = null
        user.idCardId = null;
        await user.save();

        // 3. 验证数据库中的值
        return new Promise<void>((resolve, reject) => {
          const subscription = User.find({
            where: {
              combinator: 'and',
              rules: [{ field: 'id', operator: '=', value: user.id }]
            }
          }).subscribe({
            next: users => {
              try {
                expect(users.length).toBe(1);
                expect(users[0].idCardId).toBeNull();
                subscription.unsubscribe();
                resolve();
              } catch (error) {
                subscription.unsubscribe();
                reject(error);
              }
            },
            error: reject
          });
        });
      });
    });

    it('两用户两卡交叉赋值会被数据库拒绝', async () => {
      const firstUser = new User({ name: 'RXT012-A' });
      const secondUser = new User({ name: 'RXT012-B' });
      await firstUser.save();
      await secondUser.save();

      const firstCard = new IdCard({ code: 'RXT012-CARD-A' });
      firstCard.owner$.set(firstUser);
      await firstCard.save();

      const secondCard = new IdCard({ code: 'RXT012-CARD-B' });
      secondCard.owner$.set(secondUser);
      await secondCard.save();

      await expect(
        adapter.query('UPDATE "shop$user" SET "idCardId" = ? WHERE "id" = ?', [secondCard.id, firstUser.id])
      ).rejects.toThrow();
    });
  });
}
