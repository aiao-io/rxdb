import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'Attribute',
  namespace: 'shop',
  tableName: 'attribute',
  displayName: '属性',
  properties: [
    {
      name: 'name',
      type: PropertyType.string,
      displayName: '属性名称'
    }
  ],
  relations: [
    {
      name: 'values',
      displayName: '属性值列表',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'AttributeValue',
      mappedProperty: 'attribute'
    },
    {
      name: 'skuAttributes',
      displayName: 'SKU属性关联',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKUAttributes',
      mappedProperty: 'attribute'
    }
  ]
})
export class Attribute extends EntityBase {
  name!: string;
}
