/**
 * @packageDocumentation
 * 查询刷新判断 - 创建事件
 * 判断当有新实体创建时,哪些查询结果需要刷新
 */
import { EntityType } from '../entity/entity.interface.js';
import { FindOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalCreatedEventData } from '../rxdb-events.js';
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

export const query_need_refresh_create = <T extends EntityType = EntityType>(
  task: QueryTask<T>,
  changes: RxDBEntityLocalCreatedEventData<T>[],
  refresh_rules: RefreshMatchRules,
  recalculate_rules: RefreshMatchRules
) => {
  // 分离当前实体和关系实体
  const { current_entities, relation_entities } = separateEntities(task, changes);

  // CREATE 路径此前从未计算 whereUsesRelations，导致 QueryRulesBuilder 拿到的
  // 永远是构造函数默认值 false——即使 where 真的用了关系字段，也无法触发"当前实体自身变更
  // 也可能命中关系条件"的判断。这里与 need_refresh_update.ts / need_refresh_remove.ts
  // 保持同一套接线。
  const query_entity_metadata = tryGetEntityMetadata(task.entityType);
  const where = getWhere<T>(task.options);
  let uses_relations = false;
  if (where && query_entity_metadata) {
    uses_relations = whereUsesRelations(where, query_entity_metadata);
  }

  // 构建规则
  const builder = new QueryRulesBuilder(task, current_entities, relation_entities.length > 0, uses_relations);
  const rules = builder.buildCreateRules();

  return {
    ...runMatches(rules, refresh_rules, recalculate_rules),
    current_entities,
    relation_entities
  };
};
