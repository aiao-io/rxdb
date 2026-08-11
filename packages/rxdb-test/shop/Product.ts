import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'Product',
  namespace: 'shop',
  tableName: 'product',
  displayName: '产品',
  properties: [
    {
      name: 'name',
      type: PropertyType.string,
      displayName: '产品名称'
    },
    {
      name: 'description',
      type: PropertyType.string,
      displayName: '产品描述',
      nullable: true
    }
  ],
  relations: [
    {
      name: 'skus',
      displayName: 'SKU列表',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKU',
      mappedProperty: 'product'
    },
    {
      name: 'categories',
      displayName: '分类列表',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'Category',
      mappedProperty: 'products'
    }
  ]
})
export class Product extends EntityBase {
  name!: string;
  description?: string;
}
