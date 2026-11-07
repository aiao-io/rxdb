import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 设计索引实体
 *
 * RxDB 实体类，代表实体（表）上的复合索引定义。
 * 用于定义数据库表的索引以提升查询性能。
 */
@Entity({
  name: 'DesignIndex',
  displayName: '设计索引',
  properties: [
    { name: 'propertyIds', type: PropertyType.stringArray, displayName: '属性ID列表' },
    { name: 'isUnique', type: PropertyType.boolean, default: false, displayName: '唯一索引' },
    { name: 'displayName', type: PropertyType.string, nullable: true, displayName: '显示名' },
    { name: 'sortOrder', type: PropertyType.string, default: '' }
  ],
  relations: [
    {
      name: 'designEntity',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DesignEntity',
      mappedProperty: 'indexes',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class DesignIndex extends EntityBase {}
