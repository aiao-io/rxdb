/**
 * @fileoverview 树查询的 REMOVE 事件合并
 *
 * `findDescendants` 要顺着祖先链判定「父节点被删 ⇒ 子节点整棵脱离结果集」，
 * 这条判定本地就能做，所以走真增量；`count*` 仍只能刷新。
 */
import {
  EntityType,
  isStaleEntityRemoveEvent,
  queryNeedRefreshRemove,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityId,
  RxDBEntityLocalRemovedEventData
} from '@aiao/rxdb';
import { TREE_QUERY_TYPES } from '../constants.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { buildEntityMap, traverseAncestors } from './query-tree.utils.js';

/**
 * JS 增量更新查询结果
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalRemovedEventData<T>[]) => {
  const removed_ids = new Set(data.map(e => e.id));

  switch (task.type) {
    case 'findDescendants': {
      const old_result = Array.from(task.resultEntitySet.values());
      const entities_map = buildEntityMap(old_result, e => e.id);

      // 批级记忆：同一条父链会被所有兄弟节点反复走一遍，逐节点回溯是 O(n·depth)。
      // `detached_map` 记「这个 id 是否已因自身或祖先被删而脱离结果集」，
      // 每条链只算一次，整批摊平成 O(n)。
      const detached_map = new Map<RxDBEntityId, boolean>();

      // 判定不能写成 `ancestor.id && removed_ids.has(...)`：`RxDBEntityId` 允许
      // `0` / `0n` / `''`，真值判断会把这些合法主键当成"没有 id"跳过，被删节点
      // 名下的子树就整棵留在结果里。`traverseAncestors` 本身只 yield 已解析到的
      // 父实体（取不到就 break），所以 `ancestor` 恒非空，无需可选链。
      const is_detached = (entity: InstanceType<T>): boolean => {
        const cached = detached_map.get(entity.id);
        if (cached !== undefined) return cached;

        // `chain` 收集「结论未知」的节点：它们都是断点的后代，共享同一个结论，
        // 循环结束后统一回填。
        const chain: RxDBEntityId[] = [entity.id];
        let detached = removed_ids.has(entity.id);

        if (!detached) {
          for (const { entity: ancestor } of traverseAncestors(entity, entities_map)) {
            const known = detached_map.get(ancestor.id);
            if (known !== undefined) {
              detached = known;
              break;
            }
            if (removed_ids.has(ancestor.id)) {
              detached = true;
              break;
            }
            chain.push(ancestor.id);
          }
        }

        for (const id of chain) detached_map.set(id, detached);
        return detached;
      };

      const filtered = old_result.filter(entity => !is_detached(entity));
      if (filtered.length === old_result.length) return;

      task.next(filtered, true);
      break;
    }

    case 'findAncestors': {
      const old_result = Array.from(task.resultEntitySet.values());
      const filtered = old_result.filter(e => !removed_ids.has(e.id));
      if (filtered.length === old_result.length) return;

      const { entityId } = task.options as FindTreeOptions<T>;
      if (entityId === null || entityId === undefined) {
        // 查根节点的祖先：CTE 基准成员是 `parentId IS NULL` 的各个根，递归成员
        // 往上找不到东西，结果就是这些根本身。彼此无链路关系，删谁摘谁。
        task.next(filtered, true);
        break;
      }

      // 祖先链是一条自 target 向上的单链。适配器的递归成员是
      // `children.id = c.parentId`，走到被删节点就再也接不上，断点**上方**的祖先
      // 不会出现在重跑结果里。只把被删的那一个过滤掉会把它们留下（结果比 SQL 多）。
      // 这里改为从 target 出发、在幸存节点里重建可达链路：target 自己被删则结果为空，
      // 与基准成员取不到行时 CTE 返回 0 行一致。
      const survivors = buildEntityMap(filtered, e => e.id);
      const reachable: InstanceType<T>[] = [];
      const target = survivors.get(entityId);
      if (target) {
        reachable.push(target);
        for (const { entity: ancestor } of traverseAncestors(target, survivors)) {
          reachable.push(ancestor);
        }
      }
      task.next(reachable, true);
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
