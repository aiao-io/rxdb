import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'AttributeValue',
  namespace: 'shop',
  tableName: 'attribute_value',
  displayName: '属性值',
  properties: [
    {
      name: 'name',
      type: PropertyType.string,
      displayName: '属性值名称'
    }
  ],
  relations: [
    {
      name: 'attribute',
      displayName: '所属属性',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Attribute',
      mappedProperty: 'values'
    },
    {
      name: 'skuAttributeValues',
      displayName: 'SKU属性值关联',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'SKUAttributes',
      mappedProperty: 'value'
    }
  ],
  indexes: [
    {
      name: 'attribute_value_identity',
      properties: ['attributeId', 'id'],
      unique: true
    }
  ]
})
export class AttributeValue extends EntityBase {
  name!: string;
  attributeId!: string;
}
