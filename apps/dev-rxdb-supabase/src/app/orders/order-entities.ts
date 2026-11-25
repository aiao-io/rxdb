import {
  Entity,
  EntityBase,
  OnDeleteAction,
  PropertyType,
  type RelationEntitiesObservable,
  RelationKind,
  type UUID
} from '@aiao/rxdb';

/*
 * 关系数据演示（US-227）的实体：客户 1—n 订单 1—n 订单项，订单项 n—n 分类。
 *
 * 表与外键在 `supabase/orders-demo.sql`：删客户级联删订单，删订单级联删订单项。本地在多对一一侧显式声明同样的
 * `onDelete: CASCADE`——非空多对一的默认值是 RESTRICT，本机删订单会被订单项挡住（见文档「关系级联默认值」）。
 * 名字带 `Demo` 前缀、表名避开保留字 `order`，不与 `@aiao/rxdb-test` 的 shop 组撞名；实体放在 demo 内，不走代码生成。
 * 订单项—分类的中间表 `DemoCategory_DemoOrderItem` 由 RxDB 生成：关联行 id 由两端派生，同步类型跟随两端（US-228），
 * 访客把两端设成只存本地，中间表也只存本地。
 */

/** 客户 */
@Entity({
  name: 'DemoCustomer',
  tableName: 'demo_customers',
  displayName: '客户',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '名称' }],
  relations: [
    {
      name: 'orders',
      displayName: '订单',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DemoOrder',
      mappedProperty: 'customer'
    }
  ]
})
export class DemoCustomer extends EntityBase {
  declare name: string;
}

/** 订单：属于一位客户，客户删掉时一并删掉 */
@Entity({
  name: 'DemoOrder',
  tableName: 'demo_orders',
  displayName: '订单',
  properties: [{ name: 'number', type: PropertyType.string, displayName: '单号' }],
  relations: [
    {
      name: 'customer',
      displayName: '客户',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DemoCustomer',
      mappedProperty: 'orders',
      onDelete: OnDeleteAction.CASCADE
    },
    {
      name: 'items',
      displayName: '订单项',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DemoOrderItem',
      mappedProperty: 'order'
    }
  ]
})
export class DemoOrder extends EntityBase {
  declare number: string;
  declare customerId: UUID;
}

/** 订单项：属于一张订单，订单删掉时一并删掉 */
@Entity({
  name: 'DemoOrderItem',
  tableName: 'demo_order_items',
  displayName: '订单项',
  properties: [
    { name: 'productName', type: PropertyType.string, displayName: '商品名称' },
    { name: 'quantity', type: PropertyType.integer, displayName: '数量' },
    { name: 'price', type: PropertyType.number, displayName: '单价' }
  ],
  relations: [
    {
      name: 'order',
      displayName: '所属订单',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DemoOrder',
      mappedProperty: 'items',
      onDelete: OnDeleteAction.CASCADE
    },
    {
      name: 'categories',
      displayName: '分类',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'DemoCategory',
      mappedProperty: 'orderItems'
    }
  ]
})
export class DemoOrderItem extends EntityBase {
  declare productName: string;
  declare quantity: number;
  declare price: number;
  declare orderId: UUID;
  /** 挂着的分类：`add` / `remove` 改的是中间表，保存这条订单项时一起写下去 */
  declare categories$: RelationEntitiesObservable<typeof DemoCategory>;
}

/** 分类：与订单项多对多，删掉分类时它的关联行一并删掉，订单项还在 */
@Entity({
  name: 'DemoCategory',
  tableName: 'demo_categories',
  displayName: '分类',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '名称' }],
  relations: [
    {
      name: 'orderItems',
      displayName: '订单项',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'DemoOrderItem',
      mappedProperty: 'categories'
    }
  ]
})
export class DemoCategory extends EntityBase {
  declare name: string;
}

/**
 * 订单演示的实体，按「子在前」排列
 *
 * @remarks
 * 注册到 RxDB 时就按这个顺序：全量推送要按外键把父实体排到前面（US-037），子在前声明正好让 demo 顺带守住它。
 */
export const ORDER_ENTITIES = [DemoOrderItem, DemoOrder, DemoCustomer, DemoCategory] as const;

/** 订单项—分类的中间表：表名即 RxDB 生成的中间表实体名（两端实体名排序后拼接） */
export const ORDER_ITEM_CATEGORY_JUNCTION = 'DemoCategory_DemoOrderItem';
