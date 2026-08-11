import { Entity, EntityBase, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'SKUAttributes',
  namespace: 'shop',
  tableName: 'sku_attributes',
  displayName: 'SKU属性关联',
  relations: [
    {
      name: 'sku',
      displayName: 'SKU',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SKU',
      mappedProperty: 'attributes'
    },
    {
      name: 'attribute',
      displayName: '属性',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Attribute',
      mappedProperty: 'skuAttributes'
    },
    {
      name: 'value',
      displayName: '属性值',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AttributeValue',
      mappedProperty: 'skuAttributeValues'
    }
  ],
  // RXT-011：skuId / attributeId / valueId 是三条互不关联的 FK，
  // 「同一个 SKU 上同一个属性出现两次」在库里本来完全合法 ——
  // 读出来就是两条互相冲突的记录，下游按属性取值只能靠非确定的行顺序。
  // 应用层去重挡不住并发双写和批量导入，必须由数据库承担。
  // 两列都是 NOT NULL 的 uuid FK，没有 NULL 要折、也没有大小写变体要归一，
  // 因此用裸列 UNIQUE，不加 `normalized`（见 MenuLarge 的 parent_title）。
  indexes: [
    {
      name: 'sku_attribute',
      properties: ['skuId', 'attributeId'],
      unique: true
    }
  ],
  foreignKeys: [
    {
      name: 'attribute_value_consistency',
      properties: ['attributeId', 'valueId'],
      mappedEntity: 'AttributeValue',
      mappedProperties: ['attributeId', 'id']
    }
  ]
})
// SKUAttributes 无自有属性，仅关系字段
export class SKUAttributes extends EntityBase {
  skuId!: string;
  attributeId!: string;
  valueId!: string;
}
