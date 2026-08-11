import {
  EntityType,
  queryNeedRefreshUpdate,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import { GRAPH_QUERY_TYPES } from '../constants.js';
import { touchesEdgeTable, touchesNodeTable, usesPlainObjectWhere } from './touches_edge_table.js';

/**
 * 图查询对更新事件的刷新规则：
 * 需同时观察变更前后的匹配，以及边表变更，均无法做 JS 增量计算
 */
const REFRESH_RULES: RefreshMatchRules = [
  ['match_where'], // 变更后节点命中
  ['match_where_before'], // 变更前节点命中
  ['match_relation_where'] // 边表变更
];

export const merge_update = <T extends EntityType>(
  task: QueryTask<T>,
  entities: RxDBEntityLocalUpdatedEventData<T>[]
) => {
  if (!GRAPH_QUERY_TYPES.has(task.type)) return;
  // 边表变更一律全量刷新：规则引擎按节点级 where 匹配边实体恒 false，
  // 带 where 的图查询会漏刷新（removeEdge 后仍显示已删邻居）
  if (touchesEdgeTable(task, entities) || (touchesNodeTable(task, entities) && usesPlainObjectWhere(task))) {
    task.refresh();
    return;
  }
  const result = queryNeedRefreshUpdate(task, entities, REFRESH_RULES, []);
  if (result.refresh || result.recalculate) {
    task.refresh();
  }
};
