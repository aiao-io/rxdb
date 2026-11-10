import {
  EntityType,
  queryNeedRefreshCreate,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalCreatedEventData
} from '@aiao/rxdb';
import { GRAPH_QUERY_TYPES } from '../constants.js';
import { touchesEdgeTable, touchesNodeTable } from './touches_edge_table.js';

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
  // 本图的边表或节点表上的任何创建一律全量刷新，不论 where 与新建的行对不对得上：
  // - 边表：规则引擎按节点级 where 匹配边实体恒 false，带 where 的图查询会漏刷新（removeEdge 后仍显示已删邻居）；
  // - 节点表：图查询无法 JS 增量计算，保守刷新。不能指望规则引擎的 `match_relation_where` 兜住它——
  //   那条规则只在「同表新建被当成关系变更」时才为真，普通实体的本表 CREATE 已改走增量合并
  //   （RV-01a1ba9150a27dc994910d10e82f80b1），规则不再触发，带 where 的图查询会漏刷新。
  if (touchesEdgeTable(task, entities) || touchesNodeTable(task, entities)) {
    task.refresh();
    return;
  }
  const result = queryNeedRefreshCreate(task, entities, REFRESH_RULES, []);
  if (result.refresh || result.recalculate) {
    task.refresh();
  }
};
