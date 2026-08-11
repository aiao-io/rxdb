import { RxDB, SyncType } from '@aiao/rxdb';
import {
  Attribute,
  AttributeValue,
  Category,
  ENTITIES,
  IdCard,
  Order,
  OrderItem,
  Product,
  SKU,
  SKUAttributes,
  User
} from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';

describe('Shop Entity PGlite Adapter Tests', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  const dbName = `shop-${Date.now()}`;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName,
      context: { userId: 'userId' },
      entities: [...ENTITIES],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    // 清理资源
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  describe('一对一关系查询', () => {
    let user: User;
    beforeAll(async () => {
      user = new User();
      user.name = 'Jimmy';
      const idCard = new IdCard();
      idCard.code = '111';
      idCard.owner$.set(user);
      user.idCard$.set(idCard);
      await user.save();
    });

    it('count', async () => {
      const count = await firstValueFrom(
        User.count({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'idCard.code',
                operator: '=',
                value: '111'
              }
            ]
          }
        })
      );
      expect(count).toEqual(1);
    });

    it('find', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'idCard.code',
                operator: '=',
                value: '111'
              }
            ]
          }
        })
      );
      expect(findUser.length).toBeGreaterThan(0);
      const foundUser = findUser[0];
      expect(foundUser.id).toEqual(user.id);
    });

    it('findAll', async () => {
      const findUser = await firstValueFrom(
        User.findAll({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'idCard.code',
                operator: '=',
                value: '111'
              }
            ]
          }
        })
      );
      expect(findUser[0]).toEqual(user);
    });

    it('findOne', async () => {
      const findUser = await firstValueFrom(
        User.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'idCard.code',
                operator: '=',
                value: '111'
              }
            ]
          }
        })
      );
      expect(findUser).toBeDefined();
      expect(findUser?.id).toEqual(user.id);
    });

    it('findOneOrFail', async () => {
      const findUser = await firstValueFrom(
        User.findOneOrFail({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'idCard.code',
                operator: '=',
                value: '111'
              }
            ]
          }
        })
      );
      expect(findUser).toEqual(user);
    });

    it('查询身份证号码为空的用户', async () => {
      const userWithoutIdCard = new User();
      userWithoutIdCard.name = 'NoIdCard';
      await userWithoutIdCard.save();

      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'name',
                operator: '=',
                value: 'NoIdCard'
              }
            ]
          }
        })
      );
      expect(findUser.length).toBeGreaterThan(0);
      expect(findUser.some(u => u.name === 'NoIdCard')).toBe(true);
    });

    it('should support LIKE operator in queries', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'idCard.code',
                operator: 'contains',
                value: '11'
              }
            ]
          }
        })
      );
      expect(findUser.length).toBeGreaterThan(0);
      expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
    });
  });

  describe('一对多关系查询', () => {
    let order1: Order;
    let order2: Order;
    let user: User;
    beforeAll(async () => {
      user = new User();
      user.name = 'Jimmy';
      order1 = new Order();
      order1.number = '111';
      order1.amount = 111;
      order1.owner$.set(user);

      order2 = new Order();
      order2.number = '222';
      order2.amount = 222;
      order2.owner$.set(user);

      await order1.save();
      await order2.save();
    });

    it('find', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orders.number',
                operator: '=',
                value: '111'
              }
            ]
          }
        })
      );
      expect(findUser[0]).toEqual(user);
    });

    it('should find user with multiple orders', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orders.number',
                operator: 'in',
                value: ['111', '222']
              }
            ]
          }
        })
      );
      expect(findUser.length).toBeGreaterThan(0);
      expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
    });

    it('should find user with order amount greater than 100', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orders.amount',
                operator: '>',
                value: 100
              }
            ]
          }
        })
      );
      expect(findUser.length).toBeGreaterThan(0);
      expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
    });

    it('should support OR combinator in query', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orders.number',
                operator: 'in',
                value: ['111', '222']
              }
            ]
          }
        })
      );
      expect(findUser.length).toBeGreaterThan(0);
      expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
    });
  });

  describe('多对一关系查询', () => {
    let order: Order;
    let user: User;

    beforeAll(async () => {
      user = new User();
      user.name = 'Jim';
      order = new Order();
      order.number = '333';
      order.amount = 222;
      order.owner$.set(user);
      await order.save();
    });

    it('find', async () => {
      const findOrders = await firstValueFrom(
        Order.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'owner.name',
                operator: '=',
                value: 'Jim'
              }
            ]
          }
        })
      );
      expect(findOrders[0]).toEqual(order);
    });

    it('should find orders with amount greater than 200', async () => {
      const findOrders = await firstValueFrom(
        Order.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'amount',
                operator: '>',
                value: 200
              }
            ]
          }
        })
      );
      expect(findOrders.length).toBeGreaterThan(0);
      expect(findOrders.some(o => o.number === '333')).toBe(true);
    });

    it('should support complex query conditions', async () => {
      const findOrders = await firstValueFrom(
        Order.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'owner.name',
                operator: '=',
                value: 'Jim'
              },
              {
                field: 'amount',
                operator: '>=',
                value: 200
              }
            ]
          }
        })
      );
      expect(findOrders.length).toBeGreaterThan(0);
      expect(findOrders.some(o => o.number === '333')).toBe(true);
    });
  });

  describe('多对多关系查询', () => {
    let order: Order;
    let orderItem: OrderItem;
    let user: User;
    let category: Category;
    let category2: Category;

    beforeAll(async () => {
      // 用户
      user = new User();
      user.name = 'Jim';
      // 订单
      order = new Order();
      order.number = '444';
      order.amount = 333;
      order.owner$.set(user);
      // 订单项
      orderItem = new OrderItem();
      orderItem.productName = '牙刷';
      orderItem.quantity = 1;
      orderItem.price = 100;
      orderItem.order$.set(order);
      // 将订单项添加到订单中
      order.items$.add(orderItem);
      // 分类
      category = new Category();
      category.name = '日用品';
      orderItem.categories$.add(category);

      category2 = new Category();
      category2.name = '电子产品';
      orderItem.categories$.add(category2);

      await user.save();
      await order.save();
      await orderItem.save();
      await category.save();
      await category2.save();
    });

    it('should find order items with specific category', async () => {
      const findOrderItems = await firstValueFrom(
        OrderItem.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'categories.name',
                operator: '=',
                value: '日用品'
              }
            ]
          }
        })
      );
      expect(findOrderItems[0]).toEqual(orderItem);
    });

    it('should find orders containing specific category items', async () => {
      const findOrders = await firstValueFrom(
        Order.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'items.categories.name',
                operator: '=',
                value: '日用品'
              }
            ]
          }
        })
      );
      expect(findOrders[0]).toEqual(order);
    });

    it('should find users who purchased specific category items', async () => {
      const findUser = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orders.items.categories.name',
                operator: '=',
                value: '日用品'
              }
            ]
          }
        })
      );
      expect(findUser[0]).toEqual(user);
    });

    it('should find categories purchased by specific user', async () => {
      const findCategories = await firstValueFrom(
        Category.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'orderItems.order.owner.name',
                operator: '=',
                value: 'Jim'
              }
            ]
          }
        })
      );
      expect(findCategories.length).toBeGreaterThan(0);
      expect(findCategories.some(c => c.name === '日用品')).toBe(true);
    });

    it('should find order items with multiple categories', async () => {
      const findOrderItems = await firstValueFrom(
        OrderItem.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'categories.name',
                operator: 'in',
                value: ['日用品', '电子产品']
              }
            ]
          }
        })
      );
      expect(findOrderItems.length).toBeGreaterThan(0);
      expect(findOrderItems.some(item => item.productName === '牙刷')).toBe(true);
    });

    it('should find order items with price greater than 50', async () => {
      const findOrderItems = await firstValueFrom(
        OrderItem.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'price',
                operator: '>',
                value: 50
              }
            ]
          }
        })
      );
      expect(findOrderItems.length).toBeGreaterThan(0);
      expect(findOrderItems.some(item => item.productName === '牙刷')).toBe(true);
    });

    it('should support complex conditions for order items', async () => {
      const findOrderItems = await firstValueFrom(
        OrderItem.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'categories.name',
                operator: '=',
                value: '日用品'
              },
              {
                field: 'price',
                operator: '>=',
                value: 100
              }
            ]
          }
        })
      );
      expect(findOrderItems.length).toBeGreaterThan(0);
      expect(findOrderItems.some(item => item.productName === '牙刷')).toBe(true);
    });
  });

  describe('复杂查询条件测试', () => {
    let user1: User;
    let user2: User;
    let order1: Order;
    let order2: Order;
    let orderItem1: OrderItem;
    let orderItem2: OrderItem;
    let category1: Category;
    let category2: Category;

    beforeAll(async () => {
      // 创建测试数据
      user1 = new User();
      user1.name = 'Alice';
      user1.age = 25;

      user2 = new User();
      user2.name = 'Bob';
      user2.age = 30;

      order1 = new Order();
      order1.number = 'ORDER001';
      order1.amount = 500;
      order1.owner$.set(user1);

      order2 = new Order();
      order2.number = 'ORDER002';
      order2.amount = 300;
      order2.owner$.set(user2);

      orderItem1 = new OrderItem();
      orderItem1.productName = '手机';
      orderItem1.quantity = 1;
      orderItem1.price = 500;
      orderItem1.order$.set(order1);

      orderItem2 = new OrderItem();
      orderItem2.productName = '耳机';
      orderItem2.quantity = 2;
      orderItem2.price = 150;
      orderItem2.order$.set(order2);

      category1 = new Category();
      category1.name = '电子产品';
      orderItem1.categories$.add(category1);

      category2 = new Category();
      category2.name = '配件';
      orderItem2.categories$.add(category2);

      order1.items$.add(orderItem1);
      order2.items$.add(orderItem2);

      await user1.save();
      await user2.save();
      await order1.save();
      await order2.save();
      await orderItem1.save();
      await orderItem2.save();
      await category1.save();
      await category2.save();
    });

    it('should support AND/OR combinator in queries', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'or',
            rules: [
              {
                field: 'name',
                operator: '=',
                value: 'Alice'
              },
              {
                field: 'orders.amount',
                operator: '>',
                value: 400
              }
            ]
          }
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
      expect(findUsers.some(u => u.name === 'Alice')).toBe(true);
    });

    it('should support nested query conditions', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'age',
                operator: '>=',
                value: 25
              },
              {
                field: 'orders.items.categories.name',
                operator: 'in',
                value: ['电子产品', '配件']
              }
            ]
          }
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
    });

    it('使用LIKE操作符查询', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'name',
                operator: 'startsWith',
                value: 'A'
              }
            ]
          }
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
      expect(findUsers.some(u => u.name === 'Alice')).toBe(true);
    });

    it('should support range queries with BETWEEN operator', async () => {
      const findOrders = await firstValueFrom(
        Order.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'amount',
                operator: 'between',
                value: [200, 600]
              }
            ]
          }
        })
      );
      expect(findOrders.length).toBeGreaterThan(0);
      const orderNumbers = findOrders.map(o => o.number);
      expect(orderNumbers).toContain('ORDER001');
      expect(orderNumbers).toContain('ORDER002');
    });
  });

  describe('边界情况测试', () => {
    it('should return empty array for non-existent user queries', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'name',
                operator: '=',
                value: 'NonExistentUser'
              }
            ]
          }
        })
      );
      expect(findUsers.length).toEqual(0);
    });

    it('should return all records with empty query conditions', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: []
          }
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
    });

    it('should return empty array for empty IN array queries', async () => {
      const findUsers = await firstValueFrom(
        User.find({
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
        })
      );
      expect(findUsers.length).toEqual(0);
    });
  });

  describe('group', () => {
    beforeAll(async () => {
      const product = new Product({
        name: '男士T恤',
        description: '优质棉质男士T恤'
      });
      await product.save();

      const color = new Attribute({ name: '颜色' });
      const size = new Attribute({ name: '尺寸' });
      await color.save();
      await size.save();

      const color_w = new AttributeValue({ name: '白色' });
      const color_b = new AttributeValue({ name: '黑色' });
      color_w.attribute$.set(color);
      color_b.attribute$.set(color);
      await color_w.save();
      await color_b.save();

      const size_s = new AttributeValue({ name: 'S' });
      const size_m = new AttributeValue({ name: 'M' });
      const size_l = new AttributeValue({ name: 'L' });
      size_s.attribute$.set(size);
      size_m.attribute$.set(size);
      size_l.attribute$.set(size);
      await size_s.save();
      await size_m.save();
      await size_l.save();

      {
        const sku = new SKU({ code: 'T001-W-S', price: 99, stock: 100 });
        sku.product$.set(product);
        const sku_attr_c = new SKUAttributes();
        sku_attr_c.attribute$.set(color);
        sku_attr_c.value$.set(color_w);
        const sku_attr_s = new SKUAttributes();
        sku_attr_s.attribute$.set(size);
        sku_attr_s.value$.set(size_s);
        sku.attributes$.add(sku_attr_c);
        sku.attributes$.add(sku_attr_s);
        await sku.save();
      }
      {
        const sku = new SKU({ code: 'T001-W-M', price: 99, stock: 80 });
        sku.product$.set(product);
        const sku_attr_c = new SKUAttributes();
        sku_attr_c.attribute$.set(color);
        sku_attr_c.value$.set(color_w);
        const sku_attr_m = new SKUAttributes();
        sku_attr_m.attribute$.set(size);
        sku_attr_m.value$.set(size_m);
        sku.attributes$.add(sku_attr_c);
        sku.attributes$.add(sku_attr_m);
        await sku.save();
      }
      {
        const sku = new SKU({ code: 'T001-W-L', price: 99, stock: 50 });
        sku.product$.set(product);
        const sku_attr_c = new SKUAttributes();
        sku_attr_c.attribute$.set(color);
        sku_attr_c.value$.set(color_w);
        const sku_attr_l = new SKUAttributes();
        sku_attr_l.attribute$.set(size);
        sku_attr_l.value$.set(size_l);
        sku.attributes$.add(sku_attr_c);
        sku.attributes$.add(sku_attr_l);
        await sku.save();
      }
      {
        const sku = new SKU({ code: 'T001-B-S', price: 99, stock: 40 });
        sku.product$.set(product);
        const sku_attr_b = new SKUAttributes();
        sku_attr_b.attribute$.set(color);
        sku_attr_b.value$.set(color_b);
        const sku_attr_s = new SKUAttributes();
        sku_attr_s.attribute$.set(size);
        sku_attr_s.value$.set(size_s);
        sku.attributes$.add(sku_attr_b);
        sku.attributes$.add(sku_attr_s);
        await sku.save();
      }
      {
        const sku = new SKU({ code: 'T001-B-M', price: 99, stock: 20 });
        sku.product$.set(product);
        const sku_attr_b = new SKUAttributes();
        sku_attr_b.attribute$.set(color);
        sku_attr_b.value$.set(color_b);
        const sku_attr_m = new SKUAttributes();
        sku_attr_m.attribute$.set(size);
        sku_attr_m.value$.set(size_m);
        sku.attributes$.add(sku_attr_b);
        sku.attributes$.add(sku_attr_m);
        await sku.save();
      }
      {
        const sku = new SKU({ code: 'T001-B-L', price: 99, stock: 0 });
        sku.product$.set(product);
        const sku_attr_b = new SKUAttributes();
        sku_attr_b.attribute$.set(color);
        sku_attr_b.value$.set(color_b);
        const sku_attr_l = new SKUAttributes();
        sku_attr_l.attribute$.set(size);
        sku_attr_l.value$.set(size_l);
        sku.attributes$.add(sku_attr_b);
        sku.attributes$.add(sku_attr_l);
        await sku.save();
      }
    });
    it('should be ok', async () => {
      const product = await firstValueFrom(
        Product.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'name',
                operator: '=',
                value: '男士T恤'
              }
            ]
          }
        })
      );
      expect(product?.name).toEqual('男士T恤');
    });
  });
});
