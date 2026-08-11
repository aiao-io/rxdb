import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'Category',
  namespace: 'shop',
  tableName: 'category',
  displayName: '产品分类',
  properties: [{ name: 'name', type: PropertyType.string, displayName: '分类名称' }],
  relations: [
    {
      name: 'orderItems',
      displayName: '订单项',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'OrderItem',
      mappedProperty: 'categories'
    },
    {
      name: 'products',
      displayName: '产品列表',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'Product',
      mappedProperty: 'categories'
    }
  ]
})
export class Category extends EntityBase {
  name!: string;
}
