import {
  EntityType,
  queryNeedRefreshCreate,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalCreatedEventData
} from '@aiao/rxdb';
import { GRAPH_QUERY_TYPES } from '../constants.js';
import { touchesEdgeTable, touchesNodeTable, usesPlainObjectWhere } from './touches_edge_table.js';

/**
 * 图查询对创建事件的刷新规则：
 * - findNeighbors / countNeighbors：节点属性或边表变更均需刷新（无法 JS 增量计算）
 * - findPaths：节点或边的任何变更都会影响路径计算，全量刷新
 */
const REFRESH_RULES: RefreshMatchRules = [
  ['match_where'], // 节点属性变更
  ['match_relation_where'] // 边表变更
];

export const merge_create = <T extends EntityType>(
  task: QueryTask<T>,
  entities: RxDBEntityLocalCreatedEventData<T>[]
) => {
  if (!GRAPH_QUERY_TYPES.has(task.type)) return;
  // 边表变更一律全量刷新：规则引擎按节点级 where 匹配边实体恒 false，
  // 带 where 的图查询会漏刷新（removeEdge 后仍显示已删邻居）
  if (touchesEdgeTable(task, entities) || (touchesNodeTable(task, entities) && usesPlainObjectWhere(task))) {
    task.refresh();
    return;
  }
  const result = queryNeedRefreshCreate(task, entities, REFRESH_RULES, []);
  if (result.refresh || result.recalculate) {
    task.refresh();
  }
};
