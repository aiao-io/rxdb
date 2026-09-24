import { EntityType } from '../entity/entity.interface.js';
import { CountOptions, FindAllOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalRemovedEventData } from '../rxdb-events.js';
import { query_need_refresh_remove } from './need_refresh_remove.js';
import { calculateOrderBy, isEntityMatchWhere } from './query-matching.utils.js';
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

    case 'count': {
      // `where` 在 `CountOptions` 里是必填的，`task.result` 也已被上面的守卫排除了
      // `undefined`——这里不再为这两样写兜底：写了只会是两条永远测不到的死分支，
      // 还会把「count 居然没有 where」这种本该在类型层就拦掉的事伪装成可处理。
      // 同理不判 `matched.length === 0`：recalculate 的门槛正是 `match_where`，
      // 它用的就是下面这个谓词、这份 `data`、这个 `where`，恒非空。
      const current_count = task.result as number;
      const { where } = task.options as CountOptions<T>;
      const matched = data.filter(e => isEntityMatchWhere(e.inversePatch, where));
      // autoCache 传 false：count 结果是个 number，`QueryTask#next` 在 autoCache=true 时
      // 只会白白清空 resultEntitySet / resultEntityIds（清空逻辑在类型分支之外），
      // 而 count 任务本来就没有实体结果可缓存。与 merge-update-basic.ts 的 count 分支同口径。
      task.next(Math.max(0, current_count - matched.length), false);
      break;
    }
  }
};

export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalRemovedEventData<T>[]) => {
  // 与 merge_create / merge_update 的同款守卫：首个权威结果落地前不做增量。
  // count 分支会用 `(result || 0) - matched` 伪造出首发结果 0；其余分支虽是空转，
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
      // recalculate 分支此前只看 match_where，与 where 是否依赖关系字段无关——
      // 当前实体自身的 DELETE 事件负载是扁平快照（inversePatch 不含已加载的关系对象），
      // where 一旦用了关系字段，notExists/exists 之类的判断在快照上就不可信，必须像
      // merge_create.ts / merge_update.ts 的对应分支一样要求 not_match_relation_where，
      // 命中关系条件时交给 refresh_rules 走 SQL 刷新，而不是继续用扁平快照做 JS 计数。
      recalculate_rules.push(['match_where', 'not_match_relation_where']);
      refresh_rules.push(['match_relation_where']);
      break;
  }

  const result = query_need_refresh_remove(task, freshEntities, refresh_rules, recalculate_rules);
  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, result.current_entities);
  }
};
