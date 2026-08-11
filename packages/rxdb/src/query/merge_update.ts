import { EntityType } from '../entity/entity.interface.js';
import { FindAllOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import {
  handleCountUpdate,
  handleFindAllUpdate,
  handleFindByCursorUpdate,
  handleFindOneUpdate,
  handleFindUpdate
} from './merge-update-basic.js';
import {
  handleCountAncestorsUpdate,
  handleCountDescendantsUpdate,
  handleFindAncestorsUpdate,
  handleFindDescendantsUpdate
} from './merge-update-tree.js';
import { UpdateDataCache, applyExternalEntityUpdate, classifyUpdates } from './merge-update.utils.js';
import { query_need_refresh_update } from './need_refresh_update.js';
import { isEntityMatchWhere } from './query-matching.utils.js';

const hasTreeParentChanged = <T extends EntityType>(event: RxDBEntityLocalUpdatedEventData<T>): boolean =>
  Reflect.has(event.patch, 'parentId') &&
  Reflect.get(event.patch, 'parentId') !== Reflect.get(event.inversePatch, 'parentId');

/**
 * 重新计算查询结果（JS 增量更新）
 * 根据不同的查询类型采用不同的更新策略
 *
 * UPDATE 场景特点:
 * - 实体的 ID 不变,但字段值可能变化
 * - 需要考虑 where 条件前后的匹配情况
 * - 需要考虑 orderBy 导致的排序位置变化
 *
 * @param task 查询任务
 * @param data 更新的实体数据
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalUpdatedEventData<T>[]) => {
  const where = (task.options as FindAllOptions<T>).where;
  const cache = new UpdateDataCache(data, (event: RxDBEntityLocalUpdatedEventData<T>) => task.serialize(event));
  const classification = classifyUpdates(data, where, isEntityMatchWhere, cache);

  switch (task.type) {
    case 'findAll':
      handleFindAllUpdate(task, classification, cache);
      break;

    case 'find':
      handleFindUpdate(task, classification);
      break;

    case 'findOne':
    case 'findOneOrFail':
      handleFindOneUpdate(task, classification, cache);
      break;

    case 'get': {
      const targetId = task.options as string;
      const update = data.find(entity => entity.id === targetId);
      if (!update) return;

      if (task.result && typeof task.result === 'object') {
        const currentResult = task.result as InstanceType<T>;
        applyExternalEntityUpdate(currentResult, update.patch);
        task.next(currentResult);
      } else {
        task.next(task.serialize(update));
      }
      break;
    }

    case 'findByCursor':
      handleFindByCursorUpdate(task, classification);
      break;

    case 'count':
      handleCountUpdate(task, classification);
      break;

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
 * 处理 UPDATE 事件的缓存合并逻辑
 *
 * UPDATE 场景的复杂性:
 * 1. 实体可能从 "不匹配" 变为 "匹配" (类似 CREATE)
 * 2. 实体可能从 "匹配" 变为 "不匹配" (类似 REMOVE)
 * 3. 实体仍然匹配,但字段值变化可能影响排序
 *
 * 不同查询类型的更新策略:
 * - findAll: JS 完整更新 (移除不匹配 + 更新字段 + 添加新匹配)
 * - find: SQL 刷新 (受影响时需要重新应用 limit)
 * - findByCursor: SQL 刷新 (排序变化可能影响游标范围)
 * - findOne/findOneOrFail: 混合策略 (无排序时 JS 更新,有排序时 SQL 刷新)
 * - count: JS 增减计数
 *
 * @param task 查询任务
 * @param entities 更新的实体事件数据
 */
export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalUpdatedEventData<T>[]) => {
  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  if (task.type === 'get') {
    const matchedEntities = entities.filter(entity => entity.id === task.options);
    if (matchedEntities.length > 0) {
      _recalculate(task, matchedEntities);
    }
    return;
  }

  if (task.type === 'findAncestors' && entities.some(hasTreeParentChanged)) {
    task.refresh();
    return;
  }

  switch (task.type) {
    case 'find':
      // 分页查询: 结果集受影响时刷新
      // result_contains: 更新的实体在当前结果中
      // match_where + not_match_where_before: 新匹配的实体
      // match_relation_where: 关系实体变更
      refresh_rules.push(['result_contains'], ['match_where', 'not_match_where_before'], ['match_relation_where']);
      break;

    case 'findByCursor':
      // 游标分页: 结果集受影响时刷新
      // result_contains: 更新的实体在当前结果中
      // match_where + not_match_where_before: 新匹配的实体
      // match_relation_where: 关系实体变更
      refresh_rules.push(['result_contains'], ['match_where', 'not_match_where_before'], ['match_relation_where']);
      break;

    case 'findAll':
      // 全量查询: JS 完整更新
      // result_contains: 更新的实体在当前结果中（关键：确保跨 Tab 增量 patch 场景能触发更新）
      // match_where: 更新后仍匹配,或新匹配的实体
      // not_match_where + match_where_before: 从匹配变为不匹配的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['result_contains', 'not_match_relation_where'],
        ['match_where', 'not_match_relation_where'],
        ['not_match_where', 'match_where_before', 'not_match_relation_where']
      );
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findOne':
    case 'findOneOrFail':
      // 单条查询: 混合策略(在 _recalculate 中决定是 refresh 还是 JS 更新)
      // result_contains: 当前结果被更新
      // match_where + not_match_where_before: 新匹配的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['result_contains', 'not_match_relation_where'],
        ['match_where', 'not_match_where_before', 'not_match_relation_where']
      );
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    case 'count':
      // 计数查询: JS 增减计数
      // 只要有实体的 where 匹配状态发生变化(更新前后不同),就需要重新计算
      // 简化规则: 只要有匹配的实体 OR 有之前匹配的实体,都可能影响计数
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(['match_where', 'not_match_relation_where']);
      recalculate_rules.push(['match_where_before', 'not_match_relation_where']);
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findDescendants':
      // 树形后代查询: JS 增量更新
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
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findAncestors':
      // 树形祖先查询: JS 增量更新
      // 处理树形结构变化
      // result_contains: 更新的实体在当前结果中
      // match_where: 更新后匹配条件的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['result_contains', 'not_match_relation_where'],
        ['match_where', 'not_match_relation_where']
      );
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    case 'countDescendants':
      // 树形后代计数: JS 增量更新
      // 处理 parentId 变化和 where 条件变化导致的计数变化
      // match_where: 更新后匹配条件的实体
      // match_where_before: 更新前匹配条件的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['match_where', 'not_match_relation_where'],
        ['match_where_before', 'not_match_relation_where']
      );
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    case 'countAncestors':
      // 树形祖先计数: JS 增量更新
      // 处理树形结构变化导致的计数变化
      // match_where: 更新后匹配条件的实体
      // match_where_before: 更新前匹配条件的实体
      // not_match_relation_where: 关系实体没有变更时才能使用 JS 更新
      recalculate_rules.push(
        ['match_where', 'not_match_relation_where'],
        ['match_where_before', 'not_match_relation_where']
      );
      // 如果有关系实体变更,则刷新
      refresh_rules.push(['match_relation_where']);
      break;

    // 图查询刷新规则（Phase 6 US4）

    case 'findNeighbors':
      // 邻居查询：节点属性更新或边表变更都需要刷新
      refresh_rules.push(['match_where']); // 节点属性变更
      refresh_rules.push(['match_where_before']); // 更新前匹配条件
      refresh_rules.push(['match_relation_where']); // 边表变更
      break;

    case 'countNeighbors':
      // 邻居计数：SQL 刷新确保准确性
      refresh_rules.push(['match_where']);
      refresh_rules.push(['match_where_before']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findPaths':
      // 路径查询：任何节点属性或边的变更都需要刷新
      refresh_rules.push(['match_where']);
      refresh_rules.push(['match_where_before']);
      refresh_rules.push(['match_relation_where']);
      break;
  }

  const result = query_need_refresh_update(task, entities, refresh_rules, recalculate_rules);

  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, entities);
  }
};
