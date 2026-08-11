import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'OrderItem',
  namespace: 'shop',
  tableName: 'order_item',
  displayName: '订单项目',
  properties: [
    { name: 'productName', columnName: 'product_name', type: PropertyType.string, displayName: '商品名称' },
    { name: 'quantity', type: PropertyType.number, displayName: '数量' },
    { name: 'price', type: PropertyType.number, displayName: '单价' }
  ],
  relations: [
    {
      name: 'order',
      displayName: '所属订单',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Order',
      mappedProperty: 'items'
    },
    {
      name: 'sku',
      displayName: '关联SKU',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SKU',
      mappedProperty: 'orderItems',
      nullable: true
    },
    {
      name: 'categories',
      displayName: '分类',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'Category',
      mappedProperty: 'orderItems'
    }
  ]
})
export class OrderItem extends EntityBase {
  productName!: string;
  quantity!: number;
  price!: number;
  orderId!: string;
  skuId!: string | null;
}
