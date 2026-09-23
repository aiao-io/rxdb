import { EntityType } from '../entity/entity.interface.js';
import { FindAllOptions, FindByCursorOptions, FindOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalCreatedEventData } from '../rxdb-events.js';
import { query_need_refresh_create } from './need_refresh_create.js';
import { calculateOrderBy, isEntityMatchWhere } from './query-matching.utils.js';
import { isStaleEntityEvent } from './stale-event.utils.js';

/**
 * 检查两个结果数组是否相同
 */
function has_result_changed<T>(old_result: T[], new_result: T[]): boolean {
  if (old_result.length !== new_result.length) return true;
  return old_result.some((entity, index) => entity !== new_result[index]);
}

/**
 * 取数组末尾 limit 项
 *
 * @remarks
 * 不写成 `list.slice(-limit)`：`limit` 为 0 时 `-0 === 0`，`slice(0)` 返回的是整个数组
 * 而不是空集，正好在「limit: 0 = 返回空集」这个合法取值上给出相反结果。
 */
const take_last = <T>(list: T[], limit: number): T[] =>
  limit <= 0 ? [] : list.slice(Math.max(0, list.length - limit));

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
      // `?? 100`：与 Repository.findByCursor 的归一化同口径，`limit: 0` 是合法的「返回空集」
      const limit = options.limit ?? 100;

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

      // 一页就是一页：游标查询的每次发射都必须是 SQL 拿同样参数会给出的那一页，
      // 否则持续插入会让这一页无限膨胀（`limit: 0` 也保不住空集）。
      // 裁剪方向跟着翻页方向走——正向页（首页与 after）取窗口开头 limit 项，
      // before 页取紧邻游标的末尾 limit 项，被挤出窗口的那几行属于相邻页。
      new_result = before ? take_last(new_result, limit) : new_result.slice(0, limit);

      if (!has_result_changed(old_result, new_result)) return;
      task.next(new_result, true);
      break;
    }
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
 * - count: 不做 JS 增量，交回 SQL 重算（见下方 count 分支的说明）
 *
 * @param task 查询任务
 * @param entities 创建的实体事件数据
 */
export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalCreatedEventData<T>[]) => {
  // 首个权威结果尚未落地时不做增量：此刻没有可增量的基线，把事件负载直接当成第一个结果
  // 等于凭空捏造一次查询答案。而 CREATE 事件是可以任意迟到的——变更投递按批次 flush
  // （见 sqlite 后端的批处理），一条创建事件完全可能在实体被级联删除、或在分支切走之后才送达。
  // 拿它抢在 runner 之前 `next()`，订阅者拿到的就是一个当下并不存在的实体：`get()` 本该抛
  // 「Entity with id ... not found」却解析出尸体，`findAll()` 本该是空集却多出一行别的分支的数据。
  //
  // 交给 `refresh()` 而不是直接 `return`：事件也可能**新于** runner 的快照（订阅后、SQL 落地前
  // 刚写进去的行），直接丢弃会让这次写入在活查询里永远缺席。重跑一次查询两种情况都对。
  //
  // 首个结果之后不受此限：那时 `result` 是权威基线，增量合并正是活查询该有的行为。
  if (task.result === undefined) {
    task.refresh();
    return;
  }

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
      default_recalculate();
      break;

    case 'count':
      // count 是唯一没有 id 级基线的查询类型：结果只是个 number，`QueryTask#next` 无从
      // 按 id 缓存，于是「这条 CREATE 是否已经被当前快照数进去了」在 JS 侧根本无法判定。
      // 数组类查询不受影响——它们按 id 合并，重复或迟到的 CREATE 是幂等的；
      // 而 `current_count + 1` 一旦把快照已包含的行再加一次，计数就永久偏高，
      // 直到下一次整查才纠回来（SQL 先读到新行返回 1、这行的批处理 CREATE 随后才送达，
      // 是变更投递按批 flush 下完全合法的到达顺序）。
      // 用已收到事件的 id 集合去重挡不住这种情况：它只证明「这个事件我见过」，
      // 不证明「这行不在快照里」。没有可对齐的水位就别猜，直接回 SQL 重数。
      refresh_rules.push(['match_where', 'not_match_relation_where'], ['match_relation_where']);
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
