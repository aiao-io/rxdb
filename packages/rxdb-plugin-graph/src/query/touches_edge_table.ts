import { getEntityMetadata, isRuleGroup, type EntityType, type QueryTask } from '@aiao/rxdb';

/** 边表实体名固定由节点实体名加此后缀构成（见 `SqliteGraphRepository.getEdgeTableName`）。 */
const EDGE_ENTITY_SUFFIX = '_edges';

/**
 * 判断本批事件里是否有该图查询自己的边表变更。
 *
 * @param task 当前查询任务
 * @param entities 本批实体事件（只取 `entity` / `namespace` 两个字段）
 * @returns 命中该查询对应的 `<实体名>_edges` 表时为 `true`
 *
 * @remarks
 * 图查询的结果依赖**整张边表**，规则引擎的 `match_where` 语义在这里根本不适用：
 * 它会拿边实体的 `sourceId`/`targetId`/`weight` 去匹配节点级的 `where`（如 `{ city: 'Beijing' }`），
 * 结果恒为 false。而 `match_relation_where` 也指望不上——`buildRemoveRules` 把它硬编码成
 * `false`，UPDATE 路径又要求 `whereUsesRelations`，但 `GraphWhere` 按设计不支持关系字段。
 * 所以边事件必须在进规则引擎之前就短路成全量刷新。
 */
export const touchesEdgeTable = <T extends EntityType>(
  task: QueryTask<T>,
  entities: readonly { entity: string; namespace: string }[]
): boolean => {
  const metadata = getEntityMetadata(task.entityType);
  const edgeEntity = metadata.name + EDGE_ENTITY_SUFFIX;
  return entities.some(item => item.entity === edgeEntity && item.namespace === metadata.namespace);
};

/** 简单对象 where 不能交给只接受 RuleGroup 的通用增量匹配器。 */
export const usesPlainObjectWhere = <T extends EntityType>(task: QueryTask<T>): boolean => {
  const options = task.options;
  if (!options || typeof options !== 'object' || !('where' in options)) return false;
  return options.where !== undefined && !isRuleGroup(options.where);
};

/** 判断事件是否来自图查询自己的节点表。 */
export const touchesNodeTable = <T extends EntityType>(
  task: QueryTask<T>,
  entities: readonly { entity: string; namespace: string }[]
): boolean => {
  const metadata = getEntityMetadata(task.entityType);
  return entities.some(item => item.entity === metadata.name && item.namespace === metadata.namespace);
};
