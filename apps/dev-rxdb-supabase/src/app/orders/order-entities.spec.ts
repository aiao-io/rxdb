import { getEntityMetadata, OnDeleteAction, RelationKind, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { DemoCategory, DemoCustomer, DemoIdCard, DemoOrder, DemoOrderItem, ORDER_ENTITIES } from './order-entities';

function relation(entity: EntityType, name: string) {
  return getEntityMetadata(entity).relations.find(item => item.name === name);
}

describe('订单演示的实体（US-227）', () => {
  it('表名与 supabase/orders-demo.sql 一致，避开保留字 order', () => {
    expect(ORDER_ENTITIES.map(entity => getEntityMetadata(entity).tableName)).toEqual([
      'demo_order_items',
      'demo_orders',
      'demo_id_cards',
      'demo_customers',
      'demo_categories'
    ]);
  });

  it('按子在前声明：订单项、订单、证件、客户，让全量推送顺带守住 US-037 的外键顺序', () => {
    expect(ORDER_ENTITIES.map(entity => getEntityMetadata(entity).name)).toEqual([
      'DemoOrderItem',
      'DemoOrder',
      'DemoIdCard',
      'DemoCustomer',
      'DemoCategory'
    ]);
    expect(new Set(ORDER_ENTITIES.map(entity => getEntityMetadata(entity).namespace))).toEqual(new Set(['public']));
  });

  it('多对一与服务端外键一样级联删除：删客户带走订单，删订单带走订单项', () => {
    expect(relation(DemoOrder, 'customer')).toMatchObject({
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DemoCustomer',
      columnName: 'customerId',
      onDelete: OnDeleteAction.CASCADE
    });
    expect(relation(DemoOrderItem, 'order')).toMatchObject({
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DemoOrder',
      columnName: 'orderId',
      onDelete: OnDeleteAction.CASCADE
    });
    expect(relation(DemoCustomer, 'orders')).toMatchObject({
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DemoOrder'
    });
    expect(relation(DemoOrder, 'items')).toMatchObject({
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DemoOrderItem'
    });
  });

  it('阶段 B：订单项与分类多对多，中间表 DemoCategory_DemoOrderItem 由 RxDB 生成（外键 categoriesId / orderItemsId）', () => {
    expect(relation(DemoOrderItem, 'categories')).toMatchObject({
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'DemoCategory',
      mappedProperty: 'orderItems'
    });
    expect(relation(DemoCategory, 'orderItems')).toMatchObject({
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'DemoOrderItem',
      mappedProperty: 'categories'
    });
  });

  it('阶段 C：客户与证件双向一对一，删除动作与 orders-demo.sql 的外键一致：删证件只把客户的引用置空，删客户带走证件', () => {
    expect(relation(DemoCustomer, 'idCard')).toMatchObject({
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'DemoIdCard',
      mappedProperty: 'owner',
      columnName: 'idCardId',
      nullable: true,
      onDelete: OnDeleteAction.SET_NULL
    });
    expect(relation(DemoIdCard, 'owner')).toMatchObject({
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'DemoCustomer',
      mappedProperty: 'idCard',
      columnName: 'ownerId',
      nullable: false,
      onDelete: OnDeleteAction.CASCADE
    });
  });
});
