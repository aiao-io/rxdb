import { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import { FindAllOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalRemovedEventData } from '../rxdb-events.js';
import { query_need_refresh_remove } from './need_refresh_remove.js';
import { calculateOrderBy, isEntityMatchWhere } from './query-matching.utils.js';
import { buildEntityMap, traverseAncestors } from './query-tree.utils.js';
import { isStaleEntityRemoveEvent } from './stale-event.utils.js';

/**
 * JS 增量更新查询结果
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalRemovedEventData<T>[]) => {
  const removed_ids = new Set(data.map(e => e.id));

  switch (task.type) {
    case 'findAll': {
      const options = task.options as FindAllOptions<T>;
      const old_result = Array.from(task.resultEntitySet.values());
      const filtered = old_result.filter(e => !removed_ids.has(e.id));
      if (filtered.length === old_result.length) return;

      const new_result = options.orderBy?.length ? calculateOrderBy(filtered, options.orderBy) : filtered;
      task.next(new_result, true);
      break;
    }

    case 'find': {
      const old_result = Array.from(task.resultEntitySet.values());
      if (old_result.some(e => removed_ids.has(e.id))) {
        task.refresh();
      }
      break;
    }

    case 'findOne':
    case 'findOneOrFail': {
      if (task.result === null || task.result === undefined) return;
      const current_id = (task.result as InstanceType<T>)?.id;
      if (removed_ids.has(current_id)) {
        task.refresh();
      }
      break;
    }

    case 'get': {
      if (removed_ids.has(task.options as EntityStaticType<T, 'idType'>)) {
        task.refresh();
      }
      break;
    }

    case 'findByCursor': {
      const old_result = Array.from(task.resultEntitySet.values());
      const filtered = old_result.filter(e => !removed_ids.has(e.id));
      if (filtered.length === old_result.length) return;
      task.next(filtered, true);
      break;
    }

    case 'count': {
      const current_count = (task.result as number) || 0;
      const where = (task.options as FindAllOptions<T>)?.where;
      const matched = where ? data.filter(e => isEntityMatchWhere(e.inversePatch, where)) : data;
      if (matched.length === 0) break;
      // 与 merge_create.ts 的 count 分支对称清理：那边把已计数的 id 记进
      // resultEntityIds 去重，这里删除时要同步摘掉，否则被删 id 会一直卡在去重集合里，
      // 之后同 id 重建（如 undo/redo 撤销删除）时会被误判成「已经计过数的重复事件」而漏计数。
      matched.forEach(e => task.resultEntityIds.delete(e.id));
      // autoCache=false 原因同 merge_create.ts 的 count 分支：next() 在 autoCache=true 时
      // 无条件清空 resultEntityIds，会把上面刚做的精确删除以及其它未被本批触及的 id 一并清掉。
      task.next(Math.max(0, current_count - matched.length), false);
      break;
    }

    case 'findDescendants': {
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
  }
};

export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalRemovedEventData<T>[]) => {
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
      refresh_rules.push(['result_contains'], ['match_relation_where']);
      break;

    case 'findByCursor':
    case 'findAll':
    case 'findAncestors':
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

    case 'findDescendants':
      recalculate_rules.push(['result_contains'], ['match_where']);
      refresh_rules.push(['match_relation_where']);
      break;

    case 'countDescendants':
    case 'countAncestors':
      refresh_rules.push(['match_where'], ['match_relation_where']);
      break;

    case 'findNeighbors':
    case 'countNeighbors':
    case 'findPaths':
      // 图查询同样不维护 resultEntitySet，只能 SQL 刷新；不带 match_where_before——
      // REMOVE 没有"更新前"状态，QueryRulesBuilder.buildRemoveRules() 对它恒返回 true，
      // 加进来只会让刷新变成无条件触发。
      refresh_rules.push(['match_where'], ['match_relation_where']);
      break;
  }

  const result = query_need_refresh_remove(task, freshEntities, refresh_rules, recalculate_rules);
  if (result.refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, result.current_entities);
  }
};
