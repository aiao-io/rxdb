import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 设计实体
 *
 * RxDB 实体类，代表 ER 图中的一个表/实体。
 * 包含实体的基本信息（名称、表名、命名空间等）和画布布局信息（节点位置、宽度）。
 */
@Entity({
  name: 'DesignEntity',
  displayName: '设计实体',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '实体名' },
    { name: 'tableName', type: PropertyType.string, nullable: true, displayName: '表名' },
    { name: 'displayName', type: PropertyType.string, nullable: true, displayName: '显示名' },
    { name: 'entityNamespace', type: PropertyType.string, nullable: true, displayName: '命名空间' },
    { name: 'extendsBase', type: PropertyType.string, default: 'EntityBase', displayName: '基类' },
    { name: 'repositoryType', type: PropertyType.string, default: 'Repository', displayName: 'Repository' },
    { name: 'nodeX', type: PropertyType.number, default: 0 },
    { name: 'nodeY', type: PropertyType.number, default: 0 },
    { name: 'nodeWidth', type: PropertyType.number, default: 240 },
    { name: 'sortOrder', type: PropertyType.string, default: '' }
  ],
  relations: [
    {
      name: 'modelDesign',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'ModelDesign',
      mappedProperty: 'entities',
      onDelete: OnDeleteAction.CASCADE
    },
    {
      name: 'properties',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DesignProperty',
      mappedProperty: 'designEntity'
    },
    {
      name: 'relations',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DesignRelation',
      mappedProperty: 'designEntity'
    },
    { name: 'indexes', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'DesignIndex', mappedProperty: 'designEntity' }
  ]
})
export class DesignEntity extends EntityBase {}
