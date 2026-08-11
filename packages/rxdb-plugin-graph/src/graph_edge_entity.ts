import { EntityMetadata, EntityMetadataOptions, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 根据图实体生成边表实体元数据
 *
 * 图边表类似于多对多关系的中间表，但它连接的是同一个实体的两个实例（source 和 target）
 * 使用标准的 MANY_TO_ONE 关系定义，让表创建逻辑统一处理外键和索引
 *
 * @param meta - 父实体元数据
 * @returns 边表实体元数据选项
 */
export default (meta: EntityMetadata): EntityMetadataOptions => {
  const { weight, properties } = meta.features?.graph ?? {};

  const edgeOptions: EntityMetadataOptions = {
    name: (meta.name + '_edges') as Capitalize<string>,
    namespace: meta.namespace,
    relations: [
      {
        // source 关系：指向源节点；CASCADE 确保节点删除时同步清理边
        name: 'source',
        kind: RelationKind.MANY_TO_ONE,
        mappedNamespace: meta.namespace,
        mappedEntity: meta.name,
        mappedProperty: 'target',
        onDelete: OnDeleteAction.CASCADE,
        unique: false
      },
      {
        // target 关系：指向目标节点；同样 CASCADE
        name: 'target',
        kind: RelationKind.MANY_TO_ONE,
        mappedNamespace: meta.namespace,
        mappedEntity: meta.name,
        mappedProperty: 'source',
        onDelete: OnDeleteAction.CASCADE,
        unique: false
      }
    ],
    indexes: [
      // (sourceId, targetId) 组合唯一索引：防止节点间创建重复边
      { name: 'sourceId_targetId', unique: true, properties: ['sourceId', 'targetId'] },
      // targetId 独立索引：加速反向查询
      { name: 'targetId', properties: ['targetId'] }
    ]
  };

  if (weight || properties) {
    edgeOptions.properties = [];
    if (weight) {
      // weight 为可选的数值属性
      edgeOptions.properties.push({ name: 'weight', type: PropertyType.number, nullable: true });
    }
    if (properties) {
      // 自定义边属性（keyValue）
      edgeOptions.properties.push({ name: 'properties', type: PropertyType.keyValue, properties, nullable: true });
    }
  }

  return edgeOptions;
};
