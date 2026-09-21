/**
 * @fileoverview 树查询的 CREATE 事件合并
 *
 * 与图查询「一律 refresh」不同，树的 `find*` 走真增量：新建节点是不是目标节点的
 * 后代/祖先，本地靠 `parentId` 链就能判定，没必要回 SQL。`count*` 不维护
 * `resultEntitySet`，仍只能刷新。
 */
import {
  EntityType,
  isEntityMatchWhere,
  isStaleEntityEvent,
  queryNeedRefreshCreate,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityLocalCreatedEventData
} from '@aiao/rxdb';
import { TREE_QUERY_TYPES } from '../constants.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { buildEntityMap, isAncestorOf, isDescendantOf } from './query-tree.utils.js';

/**
 * JS 增量更新查询结果
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalCreatedEventData<T>[]) => {
  const where = (task.options as FindTreeOptions<T>).where;
  const match_data = data.filter(e => !where || isEntityMatchWhere(e.patch, where));
  if (match_data.length === 0) return;

  const entities = match_data.map(d => task.serialize(d));

  switch (task.type) {
    case 'findDescendants': {
      const options = task.options as FindTreeOptions<T>;
      const old_result = Array.from(task.resultEntitySet.values());
      // 必须把本批新建实体一并纳入关系图，否则"父子同批新建"时，
      // 子节点向上查父节点会查不到而被丢弃（与 findAncestors 分支保持一致）
      const entities_map = buildEntityMap([...old_result, ...entities], e => e.id);

      const new_descendants = entities.filter(
        entity =>
          entity.id === options.entityId || isDescendantOf(entity, options.entityId, entities_map, options.level)
      );
      if (new_descendants.length === 0) return;

      new_descendants.forEach(entity => task.resultEntitySet.add(entity));
      task.next(Array.from(task.resultEntitySet.values()), true);
      break;
    }

    case 'findAncestors': {
      const options = task.options as FindTreeOptions<T>;
      const old_result = Array.from(task.resultEntitySet.values());
      const all_entities = [...old_result, ...entities];
      const entities_map = buildEntityMap(all_entities, e => e.id);

      const new_ancestors = entities.filter(
        entity => entity.id === options.entityId || isAncestorOf(entity, options.entityId, entities_map, options.level)
      );
      if (new_ancestors.length === 0) return;

      new_ancestors.forEach(entity => task.resultEntitySet.add(entity));
      task.next(Array.from(task.resultEntitySet.values()), true);
      break;
    }

    case 'countDescendants':
    case 'countAncestors':
      // count 查询无法 JS 增量更新，由上层触发 SQL 刷新
      break;
  }
};

/**
 * 处理树查询 CREATE 事件的缓存合并
 *
 * @param task 查询任务
 * @param entities 创建的实体事件数据
 */
export const merge_create = <T extends EntityType>(
  task: QueryTask<T>,
  entities: RxDBEntityLocalCreatedEventData<T>[]
) => {
  if (!TREE_QUERY_TYPES.has(task.type)) return;

  // 首个权威结果尚未落地时不做增量：此刻没有可增量的基线，把事件负载直接当成第一个结果
  // 等于凭空捏造一次查询答案。交给 `refresh()` 而不是直接 `return`：事件也可能**新于**
  // runner 的快照，直接丢弃会让这次写入在活查询里永远缺席。
  if (task.result === undefined) {
    task.refresh();
    return;
  }

  // 批内只要有一条比实体缓存更旧（创建后又被改过，CREATE 事件迟到），JS 增量的前提
  // ——「事件负载 = 实体当前状态」——就不成立了：`serialize` 会返回缓存中的**新**实例，
  // 而结果集里仍是**旧**的成员关系，二者拼出来的是旧祖先链与新祖先链的并集。
  if (entities.some(event => isStaleEntityEvent(task.rxdb, event))) {
    task.refresh();
    return;
  }

  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  switch (task.type) {
    case 'findDescendants':
    case 'findAncestors':
      // JS 增量计算需要 match_where + not_match_relation_where；关系实体变更需要 SQL 刷新
      recalculate_rules.push(['match_where', 'not_match_relation_where']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'countDescendants':
    case 'countAncestors':
      // count 查询不维护 resultEntitySet，只能 SQL 刷新
      refresh_rules.push(['match_where'], ['match_relation_where']);
      break;
  }

  const result = queryNeedRefreshCreate(task, entities, refresh_rules, recalculate_rules);

  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, result.current_entities);
  }
};
