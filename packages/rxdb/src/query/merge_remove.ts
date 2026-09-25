import { EntityType } from '../entity/entity.interface.js';
import { FindAllOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalRemovedEventData } from '../rxdb-events.js';
import { query_need_refresh_remove } from './need_refresh_remove.js';
import { calculateOrderBy } from './query-matching.utils.js';
import { isStaleEntityRemoveEvent } from './stale-event.utils.js';

/**
 * JS 增量更新查询结果
 *
 * @remarks
 * 只处理**走得到 recalculate 的**任务类型。`get` 在默认导出里就短路返回了；
 * `find` / `findOne` / `findOneOrFail` 只往 `refresh_rules` 推规则，
 * `recalculate_rules` 为空时 `runMatches` 恒返回 `recalculate: false`——
 * 给它们留 case 只是死码。
 *
 * 同理，`findAll` / `findByCursor` 分支里**不再判「什么都没删掉」**：这两类的
 * `recalculate_rules` 只有 `['result_contains']`，而 `result_contains` 查的是
 * `task.resultEntityIds`，它与 `task.resultEntitySet` 由 `QueryTask#next` 在
 * 同一个 `autoCache` 分支里一起清、一起填，不存在只进其一的路径。于是
 * 「走到这里」本身就意味着 `data` 里至少有一个 id 在结果集内，过滤后必然变短，
 * `filtered.length === old_result.length` 恒为假。留着那行 `return` 只会是一条
 * 永远测不到的死分支。
 *
 * `count` 同样不再留 case：它和 CREATE（见 merge_create.ts 对应分支的注释）是同一条
 * 原则——count 结果只是个裸 number，没有 id 级基线可比对，「这条 DELETE 是否已经被
 * 当前快照数出去了」在 JS 侧根本判断不了。原先这里靠 `current_count - matched.length`
 * 在本地减，一旦同一条 DELETE 被重复派发（例如分支合并产生的双重事件），或者快照本就
 * 取自这条删除提交之后、事件却姗姗来迟，就会把已经不含这行的计数继续减小，且没有下一次
 * 整查之前不会纠回来。现在这条路径整段并进 `refresh_rules`，`recalculate_rules` 对
 * count 恒为空，走不到这个 switch。
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalRemovedEventData<T>[]) => {
  const removed_ids = new Set(data.map(e => e.id));

  switch (task.type) {
    case 'findAll': {
      const options = task.options as FindAllOptions<T>;
      const filtered = Array.from(task.resultEntitySet.values()).filter(e => !removed_ids.has(e.id));
      const new_result = options.orderBy?.length ? calculateOrderBy(filtered, options.orderBy) : filtered;
      task.next(new_result, true);
      break;
    }

    case 'findByCursor': {
      const filtered = Array.from(task.resultEntitySet.values()).filter(e => !removed_ids.has(e.id));
      task.next(filtered, true);
      break;
    }
  }
};

export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalRemovedEventData<T>[]) => {
  // 与 merge_create / merge_update 的同款守卫：首个权威结果落地前不做增量。
  // 这里的各分支此时都还是空转（count 也一样，已经没有本地加减能伪造出首发结果），
  // 但 runner 的快照可能取自删除提交之前，静默丢弃会让这行死数据永远留在活查询里。
  // 交给 refresh() 重跑一次，两种情况都对。
  if (task.result === undefined) {
    task.refresh();
    return;
  }

  // 旧删除事件不能撤掉比它新的缓存实体（例如 undo/redo 用同一 id 重建实体后
  // 又被更新，姗姗来迟的过期 DELETE 才追上）。逐条过滤而不是像 CREATE 那样整批回退到
  // SQL 刷新——DELETE 在 _recalculate 里是按 id 独立处理的，不存在 CREATE/UPDATE 那种
  // 跨实体 patch 合并的正确性风险，per-entity 过滤足够安全。
  const freshEntities = entities.filter(event => !isStaleEntityRemoveEvent(task.rxdb, event));
  if (freshEntities.length === 0) return;

  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  if (task.type === 'get') {
    if (freshEntities.some(entity => entity.id === task.options)) {
      task.refresh();
    }
    return;
  }

  switch (task.type) {
    case 'find':
    case 'findOne':
    case 'findOneOrFail':
      // match_where + match_order_by: offset 页的页前行被删时窗口整体前移一格，
      // 被删的那行既不在结果集里、也没有"更新前后"可比，result_contains 看不见它
      refresh_rules.push(['result_contains'], ['match_where', 'match_order_by'], ['match_relation_where']);
      break;

    case 'findByCursor':
    case 'findAll':
      recalculate_rules.push(['result_contains']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'count':
      // 与 merge_create.ts 的 count 分支同一条原则：没有 id 级基线、没有可对齐的水位，
      // 命中 where 的 DELETE 一律回 SQL 重数，不再用 `match_where` 门槛去 JS 本地减。
      // DELETE 天然没有「更新前后」的区分——一条事件要么命中 where 要么不命中，
      // `match_where` 本身就是精确判据，不存在「变更但计数不受影响」需要额外排除的情形
      // （这点与下面 merge_update.ts 的 count 分支不同，UPDATE 有前后两态，判据要更严）。
      // not_match_relation_where 与 findAll/find 同款：DELETE 事件负载是扁平快照，
      // where 一旦用了关系字段就不可信，命中关系条件时交给下一条规则回 SQL。
      refresh_rules.push(['match_where', 'not_match_relation_where'], ['match_relation_where']);
      break;
  }

  const result = query_need_refresh_remove(task, freshEntities, refresh_rules, recalculate_rules);
  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, result.current_entities);
  }
};
