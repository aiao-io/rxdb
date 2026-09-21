/**
 * @fileoverview 树查询的 REMOVE 事件合并
 *
 * `findDescendants` 要顺着祖先链判定「父节点被删 ⇒ 子节点整棵脱离结果集」，
 * 这条判定本地就能做，所以走真增量；`count*` 仍只能刷新。
 */
import {
  calculateOrderBy,
  EntityType,
  FindAllOptions,
  isStaleEntityRemoveEvent,
  queryNeedRefreshRemove,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalRemovedEventData
} from '@aiao/rxdb';
import { TREE_QUERY_TYPES } from '../constants.js';
import { buildEntityMap, traverseAncestors } from './query-tree.utils.js';

/**
 * JS 增量更新查询结果
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalRemovedEventData<T>[]) => {
  const removed_ids = new Set(data.map(e => e.id));

  switch (task.type) {
    case 'findDescendants': {
      // 借 `FindAllOptions` 读 `orderBy`：`FindTreeOptions` 本身不声明排序，
      // 但适配器返回的顺序由 SQL 决定，这里只在调用方确实带了 orderBy 时才重排。
      const options = task.options as FindAllOptions<T>;
      const old_result = Array.from(task.resultEntitySet.values());
      const entities_map = buildEntityMap(old_result, e => e.id);
      let has_changes = false;

      const filtered = old_result.filter(entity => {
        if (removed_ids.has(entity.id)) {
          has_changes = true;
          return false;
        }
        // 检查祖先链是否有被删除的节点
        for (const { entity: ancestor } of traverseAncestors(entity, entities_map)) {
          if (ancestor?.id && removed_ids.has(ancestor.id)) {
            has_changes = true;
            return false;
          }
        }
        return true;
      });

      if (!has_changes) return;

      const new_result = options.orderBy?.length ? calculateOrderBy(filtered, options.orderBy) : filtered;
      task.next(new_result, true);
      break;
    }

    case 'findAncestors': {
      const old_result = Array.from(task.resultEntitySet.values());
      const filtered = old_result.filter(e => !removed_ids.has(e.id));
      if (filtered.length === old_result.length) return;
      task.next(filtered, true);
      break;
    }

    case 'countDescendants':
    case 'countAncestors':
      // count 查询无法 JS 增量更新，由上层触发 SQL 刷新
      break;
  }
};

/**
 * 处理树查询 REMOVE 事件的缓存合并
 *
 * @param task 查询任务
 * @param entities 删除的实体事件数据
 */
export const merge_remove = <T extends EntityType>(
  task: QueryTask<T>,
  entities: RxDBEntityLocalRemovedEventData<T>[]
) => {
  if (!TREE_QUERY_TYPES.has(task.type)) return;

  // 与 merge_create / merge_update 的同款守卫：首个权威结果落地前不做增量。
  // runner 的快照可能取自删除提交之前，静默丢弃会让这行死数据永远留在活查询里。
  if (task.result === undefined) {
    task.refresh();
    return;
  }

  // 旧删除事件不能撤掉比它新的缓存实体（例如 undo/redo 用同一 id 重建实体后又被更新，
  // 姗姗来迟的过期 DELETE 才追上）。逐条过滤而非整批回退：DELETE 在 _recalculate 里
  // 按 id 独立处理，不存在跨实体 patch 合并的正确性风险。
  const freshEntities = entities.filter(event => !isStaleEntityRemoveEvent(task.rxdb, event));
  if (freshEntities.length === 0) return;

  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  switch (task.type) {
    case 'findAncestors':
      recalculate_rules.push(['result_contains']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findDescendants':
      recalculate_rules.push(['result_contains'], ['match_where']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'countDescendants':
    case 'countAncestors':
      refresh_rules.push(['match_where'], ['match_relation_where']);
      break;
  }

  const result = queryNeedRefreshRemove(task, freshEntities, refresh_rules, recalculate_rules);
  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, result.current_entities);
  }
};
