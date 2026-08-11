import {
  EntityType,
  queryNeedRefreshRemove,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalRemovedEventData
} from '@aiao/rxdb';
import { GRAPH_QUERY_TYPES } from '../constants.js';
import { touchesEdgeTable, touchesNodeTable, usesPlainObjectWhere } from './touches_edge_table.js';

/**
 * 图查询对删除事件的刷新规则：节点或边删除都可能影响结果，统一全量刷新
 */
const REFRESH_RULES: RefreshMatchRules = [
  ['match_where'], // 节点删除
  ['match_relation_where'] // 边删除
];

export const merge_remove = <T extends EntityType>(
  task: QueryTask<T>,
  entities: RxDBEntityLocalRemovedEventData<T>[]
) => {
  if (!GRAPH_QUERY_TYPES.has(task.type)) return;
  // 边表变更一律全量刷新：规则引擎按节点级 where 匹配边实体恒 false，
  // 带 where 的图查询会漏刷新（removeEdge 后仍显示已删邻居）
  if (touchesEdgeTable(task, entities) || (touchesNodeTable(task, entities) && usesPlainObjectWhere(task))) {
    task.refresh();
    return;
  }
  const result = queryNeedRefreshRemove(task, entities, REFRESH_RULES, []);
  if (result.refresh || result.recalculate) {
    task.refresh();
  }
};
