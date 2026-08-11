import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'SKU',
  namespace: 'shop',
  tableName: 'sku',
  displayName: '库存单元',
  properties: [
    {
      name: 'code',
      type: PropertyType.string,
      displayName: 'SKU编码',
      unique: true
    },
    {
      name: 'price',
      type: PropertyType.number,
      displayName: '价格'
    },
    {
      name: 'stock',
      type: PropertyType.integer,
      displayName: '库存'
    }
  ],
  relations: [
    {
      name: 'attributes',
      displayName: '属性列表',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKUAttributes',
      mappedProperty: 'sku'
    },
    {
      name: 'orderItems',
      displayName: '订单项',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'OrderItem',
      mappedProperty: 'sku'
    },
    {
      name: 'product',
      displayName: '所属产品',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Product',
      mappedProperty: 'skus'
    }
  ]
})
export class SKU extends EntityBase {
  code!: string;
  price!: number;
  stock!: number;
  productId!: string;
}
