import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 设计关系实体
 *
 * RxDB 实体类，代表实体（表）之间的关联定义。
 * 支持一对一、一对多、多对多等多种关系类型。
 */
@Entity({
  name: 'DesignRelation',
  displayName: '设计关系',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '关系名' },
    { name: 'relationKind', type: PropertyType.string, displayName: '关系类型' },
    { name: 'mappedEntityId', type: PropertyType.string, nullable: true, displayName: '目标实体' },
    { name: 'mappedPropertyId', type: PropertyType.string, nullable: true, displayName: '映射属性' },
    { name: 'mappedNamespace', type: PropertyType.string, nullable: true, displayName: '目标命名空间' },
    { name: 'columnName', type: PropertyType.string, nullable: true },
    { name: 'displayName', type: PropertyType.string, nullable: true, displayName: '显示名' },
    { name: 'onDeleteAction', type: PropertyType.string, nullable: true },
    { name: 'onUpdateAction', type: PropertyType.string, nullable: true },
    { name: 'sortOrder', type: PropertyType.string, default: '' }
  ],
  relations: [
    {
      name: 'designEntity',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DesignEntity',
      mappedProperty: 'relations',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class DesignRelation extends EntityBase {}
