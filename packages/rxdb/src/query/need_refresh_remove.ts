/**
 * @packageDocumentation
 * 查询刷新判断 - 删除事件
 * 判断当有实体删除时,哪些查询结果需要刷新
 */
import { EntityType } from '../entity/entity.interface.js';
import { FindOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalRemovedEventData } from '../rxdb-events.js';
import { tryGetEntityMetadata } from '../rxdb-utils.js';
import { runMatches } from './query-matching.utils.js';
import { separateEntities, whereUsesRelations } from './query-relation.utils.js';
import { QueryRulesBuilder } from './query-rules-builder.js';

const getWhere = <T extends EntityType>(options: unknown) => {
  if (!options || typeof options !== 'object' || !('where' in options)) {
    return undefined;
  }

  return (options as FindOptions<T>).where;
};

export const query_need_refresh_remove = <T extends EntityType>(
  task: QueryTask<T>,
  changes: RxDBEntityLocalRemovedEventData<T>[],
  refresh_rules: RefreshMatchRules,
  recalculate_rules: RefreshMatchRules
) => {
  const query_entity_metadata = tryGetEntityMetadata(task.entityType);

  // REMOVE 之前完全没有区分「本类型直接删除」和「被依赖的关系实体删除」，
  // EXISTS/关系查询在关联实体被删时永远不刷新。这里与 CREATE/UPDATE 对齐，用
  // separateEntities 分离出 relation_entities。
  const { current_entities, relation_entities } = separateEntities(task, changes);

  // 检测 where 是否使用了关系字段
  const where = getWhere<T>(task.options);
  let uses_relations = false;
  if (where && query_entity_metadata) {
    uses_relations = whereUsesRelations(where, query_entity_metadata);
  }

  // DELETE 的 inversePatch 已经是删除前的完整快照，不像 UPDATE 的 patch 只含被改字段，
  // 门控判定不需要像 need_refresh_update 那样重建，直接用 current_entities 即可。
  const builder = new QueryRulesBuilder(task, current_entities, relation_entities.length > 0, uses_relations);
  const rules = builder.buildRemoveRules();

  return {
    ...runMatches(rules, refresh_rules, recalculate_rules),
    current_entities,
    relation_entities
  };
};
