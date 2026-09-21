/**
 * @fileoverview 树查询的 UPDATE 事件合并
 *
 * 四个任务类型全部走真增量：`parentId` 变更导致的树重组、where 命中翻转、字段值变化，
 * 都由 {@link handleFindDescendantsUpdate} 等四个处理器在本地算清。
 * 增量所需的判定原语（分类、外部更新落盘、过期事件）取自核心公开面，不复刻。
 */
import {
  EntityType,
  FindAllOptions,
  isEntityMatchWhere,
  prepareIncrementalUpdate,
  queryNeedRefreshUpdate,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import { TREE_QUERY_TYPES } from '../constants.js';
import {
  handleCountAncestorsUpdate,
  handleCountDescendantsUpdate,
  handleFindAncestorsUpdate,
  handleFindDescendantsUpdate
} from './merge-update-tree.js';

/**
 * 判断一条更新事件是否改动了 `parentId`
 *
 * @remarks
 * `findAncestors` 的结果就是一条祖先链。链上任一节点改父，整条链都要重算，
 * 本地拿不到新链上那些从未进过结果集的节点，只能回 SQL。
 */
const hasTreeParentChanged = <T extends EntityType>(event: RxDBEntityLocalUpdatedEventData<T>): boolean =>
  Reflect.has(event.patch, 'parentId') &&
  Reflect.get(event.patch, 'parentId') !== Reflect.get(event.inversePatch, 'parentId');

/**
 * 重新计算查询结果（JS 增量更新）
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalUpdatedEventData<T>[]) => {
  const where = (task.options as FindAllOptions<T>).where;
  const { cache, classification } = prepareIncrementalUpdate(task, data);

  switch (task.type) {
    case 'findDescendants':
      handleFindDescendantsUpdate(task, data, classification, cache);
      break;

    case 'findAncestors':
      handleFindAncestorsUpdate(task, data, classification, cache);
      break;

    case 'countDescendants':
      handleCountDescendantsUpdate(task, data, classification, cache, where, isEntityMatchWhere);
      break;

    case 'countAncestors':
      handleCountAncestorsUpdate(task, data, classification, cache, where, isEntityMatchWhere);
      break;
  }
};

/**
 * 处理树查询 UPDATE 事件的缓存合并
 *
 * @param task 查询任务
 * @param entities 更新的实体事件数据
 */
export const merge_update = <T extends EntityType>(
  task: QueryTask<T>,
  entities: RxDBEntityLocalUpdatedEventData<T>[]
) => {
  if (!TREE_QUERY_TYPES.has(task.type)) return;

  // 与 merge_create 的同款守卫：首个权威结果尚未落地时不做增量——此刻 resultEntitySet
  // 还是空的，增量合并会把事件负载当成完整结果发射。交给 `refresh()` 而不是直接 `return`：
  // runner 的快照可能取自更新提交之前，直接丢弃会让这次更新在活查询里永远缺席。
  if (task.result === undefined) {
    task.refresh();
    return;
  }

  if (task.type === 'findAncestors' && entities.some(hasTreeParentChanged)) {
    task.refresh();
    return;
  }

  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  switch (task.type) {
    case 'findDescendants':
      // 处理 parentId 变化导致的树形结构重组
      // result_contains: 更新的实体在当前结果中
      // match_where: 更新后匹配条件的实体
      // match_where_before: 更新前匹配条件的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['result_contains', 'not_match_relation_where'],
        ['match_where', 'not_match_relation_where'],
        ['match_where_before', 'not_match_relation_where']
      );
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findAncestors':
      // result_contains: 更新的实体在当前结果中
      // match_where: 更新后匹配条件的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['result_contains', 'not_match_relation_where'],
        ['match_where', 'not_match_relation_where']
      );
      refresh_rules.push(['match_relation_where']);
      break;

    case 'countDescendants':
    case 'countAncestors':
      // match_where: 更新后匹配条件的实体
      // match_where_before: 更新前匹配条件的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['match_where', 'not_match_relation_where'],
        ['match_where_before', 'not_match_relation_where']
      );
      refresh_rules.push(['match_relation_where']);
      break;
  }

  const result = queryNeedRefreshUpdate(task, entities, refresh_rules, recalculate_rules);

  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, entities);
  }
};
