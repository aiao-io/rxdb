import { EntityType } from '../entity/entity.interface.js';
import { FindAllOptions, FindByCursorOptions, FindOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { RxDBEntityLocalCreatedEventData } from '../rxdb-events.js';
import { query_need_refresh_create } from './need_refresh_create.js';
import { calculateOrderBy, isEntityMatchWhere } from './query-matching.utils.js';
import { buildEntityMap, isAncestorOf, isDescendantOf } from './query-tree.utils.js';
import { isStaleEntityEvent } from './stale-event.utils.js';

/**
 * 检查两个结果数组是否相同
 */
function has_result_changed<T>(old_result: T[], new_result: T[]): boolean {
  if (old_result.length !== new_result.length) return true;
  return old_result.some((entity, index) => entity !== new_result[index]);
}

/**
 * JS 增量更新查询结果
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalCreatedEventData<T>[]) => {
  const where = (task.options as FindOptions<T>).where;
  const match_data = data.filter(e => !where || isEntityMatchWhere(e.patch, where));
  if (match_data.length === 0) return;

  const entities = match_data.map(d => task.serialize(d));

  switch (task.type) {
    case 'findAll': {
      const options = task.options as FindAllOptions<T>;
      entities.forEach(entity => task.resultEntitySet.add(entity));
      let new_result = Array.from(task.resultEntitySet.values());
      if (options.orderBy?.length) {
        new_result = calculateOrderBy(new_result, options.orderBy);
      }
      task.next(new_result, true);
      break;
    }

    case 'find': {
      const options = task.options as FindOptions<T>;
      // `?? 100`：limit: 0 是合法的「返回空集」，与 Repository.find 的归一化保持一致
      const limit = options.limit ?? 100;
      const old_result = Array.from(task.resultEntitySet.values());
      // 按 id 合并而非直接拼接数组。branch-merge 的 execute_switch_actions 会对同一
      // 条 INSERT 产生两次独立派发（同步的 dispatch_switch_events + 触发器级联异步到达的
      // handle_rxdb_change），同 id 的重复 CREATE 事件若直接 concat 会在结果里出现两条同 id
      // 记录（参见 findByCursor 分支已有的同一模式）。
      const combined_by_id = new Map(old_result.map(entity => [entity.id, entity]));
      entities.forEach(entity => combined_by_id.set(entity.id, entity));
      let sorted_result = Array.from(combined_by_id.values());
      if (options.orderBy?.length) {
        sorted_result = calculateOrderBy(sorted_result, options.orderBy);
      }
      const new_result = sorted_result.slice(0, limit);
      if (!has_result_changed(old_result, new_result)) return;
      task.next(new_result, true);
      break;
    }

    case 'findOne':
    case 'findOneOrFail': {
      const options = task.options as FindOptions<T>;
      let sorted_entities = entities;
      if (options.orderBy?.length) {
        sorted_entities = calculateOrderBy(entities, options.orderBy);
      }
      const new_candidate = sorted_entities[0];

      if (task.result === null || task.result === undefined) {
        task.next(new_candidate);
        break;
      }

      if (options.orderBy?.length) {
        const current_result = task.result as InstanceType<T>;
        const sorted = calculateOrderBy([current_result, new_candidate], options.orderBy);
        if (sorted[0] !== current_result) {
          task.next(sorted[0]);
        }
      }
      break;
    }

    case 'get': {
      const targetId = task.options as string;
      const createdEntity = data.find(entity => entity.id === targetId);
      if (!createdEntity) return;
      task.next(task.serialize(createdEntity));
      break;
    }

    case 'findByCursor': {
      const options = task.options as FindByCursorOptions<T>;
      const { before, after, orderBy } = options;
      if (!orderBy?.length) return;

      const old_result = Array.from(task.resultEntitySet.values());
      const combined_by_id = new Map(old_result.map(entity => [entity.id, entity]));
      entities.forEach(entity => combined_by_id.set(entity.id, entity));
      const combined = Array.from(combined_by_id.values());

      let new_result: InstanceType<T>[];

      if (after || before) {
        const combined_set = new Set(combined);
        if (after) combined_set.add(after);
        if (before) combined_set.add(before);
        const combined_with_cursor = Array.from(combined_set);

        const sorted_with_cursor = calculateOrderBy(combined_with_cursor, orderBy);
        const included = new Set<InstanceType<T>>(old_result);
        for (const e of entities) included.add(e);

        if (after) {
          const after_index = sorted_with_cursor.indexOf(after);
          if (after_index !== -1) {
            new_result = sorted_with_cursor.slice(after_index + 1).filter(e => included.has(e));
          } else {
            new_result = old_result;
          }
        } else {
          const before_index = sorted_with_cursor.indexOf(before!);
          if (before_index !== -1) {
            new_result = sorted_with_cursor.slice(0, before_index).filter(e => included.has(e));
          } else {
            new_result = old_result;
          }
        }
      } else {
        new_result = calculateOrderBy(combined, orderBy);
      }

      if (!has_result_changed(old_result, new_result)) return;
      task.next(new_result, true);
      break;
    }

    case 'count': {
      // 同一原因（见上方 find 分支注释），count 原先无条件 `+entities.length`，
      // 同一条 INSERT 的两次独立派发会被计两次。这里借用此前对 count 类型任务完全空置的
      // `task.resultEntityIds`（QueryTask#next 只在 result 是数组/带 id 对象时才填充它，
      // number 类型的 count 结果永远不会被填充）当作已计数 id 的去重集合。
      const current_count = (task.result as number) || 0;
      let added = 0;
      for (const entity of entities) {
        if (task.resultEntityIds.has(entity.id)) continue;
        task.resultEntityIds.add(entity.id);
        added++;
      }
      if (added === 0) return;
      // autoCache 必须传 false：QueryTask#next 在 autoCache=true 时无条件清空
      // resultEntityIds（清空逻辑在类型分支之外），即使 count 结果本身不会重新填充它。
      // 若沿用默认值，刚写入的去重记录会被自己这次 next() 立刻清空，起不到跨批次去重的作用。
      task.next(current_count + added, false);
      break;
    }

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
 * 处理 CREATE 事件的缓存合并逻辑
 *
 * 所有查询类型都使用 JS 增量更新策略:
 * - findAll: 直接添加到结果集
 * - find: 合并后重新排序和截取
 * - findByCursor: 在游标范围内增量添加
 * - findOne/findOneOrFail: 比较并决定是否替换
 * - count: 简单加法
 *
 * @param task 查询任务
 * @param entities 创建的实体事件数据
 */
export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalCreatedEventData<T>[]) => {
  // 批内只要有一条比实体缓存更旧（创建后又被改过，CREATE 事件迟到），JS 增量的前提
  // ——「事件负载 = 实体当前状态」——就不成立了：`serialize` 在 P0-004 守卫下会返回
  // 缓存中的**新**实例，而结果集里仍是**旧**的成员关系，二者拼出来的是一个从未存在过的
  // 中间态（树查询上表现为旧祖先链与新祖先链的并集）。此时交回 SQL 重算，
  // 而不是拿陈旧负载硬算。
  if (entities.some(event => isStaleEntityEvent(task.rxdb, event))) {
    task.refresh();
    return;
  }

  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  if (task.type === 'get') {
    const matchedEntities = entities.filter(entity => entity.id === task.options);
    if (matchedEntities.length > 0) {
      _recalculate(task, matchedEntities);
    }
    return;
  }

  // 默认规则: JS 增量计算需要 match_where + not_match_relation_where
  // 关系实体变更需要 SQL 刷新
  const default_recalculate = () => {
    recalculate_rules.push(['match_where', 'not_match_relation_where']);
    refresh_rules.push(['match_relation_where']);
  };

  switch (task.type) {
    case 'find':
    case 'findOne':
    case 'findOneOrFail':
      recalculate_rules.push(['match_where', 'match_order_by', 'not_match_relation_where']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'findByCursor':
    case 'findAll':
    case 'count':
    case 'findDescendants':
    case 'findAncestors':
      default_recalculate();
      break;

    case 'countDescendants':
    case 'countAncestors':
      // count 查询不维护 resultEntitySet，只能 SQL 刷新
      refresh_rules.push(['match_where'], ['match_relation_where']);
      break;

    case 'findNeighbors':
    case 'countNeighbors':
    case 'findPaths':
      // 图查询同样不维护 resultEntitySet，只能 SQL 刷新；不带 match_where_before——
      // CREATE 没有"更新前"状态，QueryRulesBuilder.buildCreateRules() 对它恒返回 true，
      // 加进来只会让刷新变成无条件触发。
      refresh_rules.push(['match_where'], ['match_relation_where']);
      break;
  }

  const result = query_need_refresh_create(task, entities, refresh_rules, recalculate_rules);

  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    // 分页 find 查询（offset>0）无法用 JS 增量安全维护：当前页缓存仅是 [offset, offset+limit)
    // 窗口的一段，新建实体可能属于其它页（甚至落在 offset 之前），本地插入会污染当前页。
    // 这类查询交回 SQL 重算（refresh）以保证窗口正确，而不是本地增量插入。
    if (task.type === 'find' && is_paginated_find(task)) {
      task.refresh();
    } else {
      _recalculate(task, result.current_entities);
    }
  }
};

/**
 * 判断 find 查询是否为分页查询（存在非零 offset）
 *
 * 仅 offset>0 才属于「非首页」窗口，需交回 SQL 重算；offset 缺省或为 0 时
 * 当前页即首页，保留既有的本地 JS 增量插入行为。
 */
const is_paginated_find = <T extends EntityType>(task: QueryTask<T>): boolean => {
  const options = task.options as FindOptions<T>;
  return (options.offset ?? 0) > 0;
};
