import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 模型设计实体
 *
 * RxDB 实体类，代表一个完整的数据库模型设计。
 * 一个模型设计可以包含多个实体(DesignEntity)，每个实体对应数据库中的一张表。
 */
@Entity({
  name: 'ModelDesign',
  displayName: '模型设计',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: '名称' },
    { name: 'description', type: PropertyType.string, nullable: true, displayName: '描述' },
    { name: 'namespace', type: PropertyType.string, default: 'public', displayName: '命名空间' }
  ],
  relations: [
    {
      name: 'entities',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'DesignEntity',
      mappedProperty: 'modelDesign'
    },
    {
      name: 'chatSessions',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'ChatSession',
      mappedProperty: 'modelDesign'
    }
  ]
})
export class ModelDesign extends EntityBase {
  /** 模型名称 */
  declare name: string;
  /** 模型描述（可选） */
  declare description: string | null;
  /** 命名空间，默认 'public' */
  declare namespace: string;
}
