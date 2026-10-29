/**
 * @fileoverview 树查询的 CREATE 事件合并
 *
 * 与图查询「一律 refresh」不同，树的 `find*` 走真增量：新建节点是不是目标节点的
 * 后代/祖先，本地靠 `parentId` 链就能判定，没必要回 SQL。`count*` 不维护
 * `resultEntitySet`，仍只能刷新。
 *
 * 基准成员（查全树时的根、指定 `entityId` 时的目标，见 {@link isTreeBaseMember}）不过 where，
 * 新建时不能拿 where 去筛它们。
 */
import {
  EntityType,
  isEntityMatchWhere,
  isStaleEntityEvent,
  queryNeedRefreshCreate,
  QueryTask,
  RefreshMatchRules,
  RxDBEntityId,
  RxDBEntityLocalCreatedEventData
} from '@aiao/rxdb';
import { TREE_QUERY_TYPES } from '../constants.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import {
  buildEntityMap,
  concatIterables,
  get_tree_parent_id,
  isAncestorOf,
  isDescendantOf,
  isTreeBaseMember
} from './query-tree.utils.js';

/**
 * 新建的目标节点，它的祖先链能不能只凭本批与旧结果算清
 *
 * @param target 本批新建的目标节点（`findAncestors` 的基准成员）
 * @param batch 本批新建的实体，按 id 索引，不论是否匹配 where
 * @param resultIds 旧结果集里的 id
 * @param options 查询选项
 * @returns `false` 表示父链走到了本地不认识的节点，只能回 SQL
 *
 * @remarks
 * 目标此前不存在时 CTE 一行都没有，旧结果是空的；而它的父节点多半早已在库里（外键要求父行先于子行存在），
 * 那些节点从没进过结果集、也不在本批事件里，本地拼不出来。父链在本地走得到头才算清：走到根、
 * 被 where 截断（递归成员逐跳过 where）、触到 level 上限，或接上旧结果里的成员（它上方的链旧结果里已有）。
 */
const canResolveNewTargetAncestors = <T extends EntityType>(
  target: object,
  batch: ReadonlyMap<RxDBEntityId, object>,
  resultIds: ReadonlySet<RxDBEntityId>,
  { where, level }: FindTreeOptions<T>
): boolean => {
  const visited = new Set<RxDBEntityId>();
  let current = target;
  for (let depth = 0; level === undefined || depth < level; depth++) {
    const parentId = get_tree_parent_id<RxDBEntityId>(current);
    if (parentId === null || resultIds.has(parentId) || visited.has(parentId)) return true;
    visited.add(parentId);
    const parent = batch.get(parentId);
    if (!parent) return false;
    if (where && !isEntityMatchWhere(parent, where)) return true;
    current = parent;
  }
  return true;
};

/**
 * `findAncestors` 的目标正是本批新建的，而它的祖先链本地算不清
 *
 * @param task 查询任务
 * @param data 本任务实体类型的新建事件
 * @returns `true` 时调用方回 SQL 重算
 *
 * @remarks
 * 只看指定了目标的 `findAncestors`：查全树时基准成员是全部根，递归成员往上找不到东西，新根直接进结果即可；
 * `findDescendants` 的新基准成员名下不会有既有子孙（外键挡着），同批新建的子孙本地就接得上。
 */
const needsSqlForCreatedTarget = <T extends EntityType>(
  task: QueryTask<T>,
  data: RxDBEntityLocalCreatedEventData<T>[]
): boolean => {
  if (task.type !== 'findAncestors') return false;
  const options = task.options as FindTreeOptions<T>;
  const { entityId } = options;
  if (entityId === null || entityId === undefined) return false;
  const target = data.find(e => e.id === entityId);
  if (!target) return false;
  const batch = new Map<RxDBEntityId, object>(data.map(e => [e.id as RxDBEntityId, e.patch]));
  const resultIds = new Set<RxDBEntityId>(Array.from(task.resultEntitySet, e => e.id as RxDBEntityId));
  return !canResolveNewTargetAncestors(target.patch, batch, resultIds, options);
};

/**
 * JS 增量更新查询结果
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalCreatedEventData<T>[]) => {
  const options = task.options as FindTreeOptions<T>;
  const { entityId, where, level } = options;
  // 只有递归成员过 where；基准成员不匹配也要留下，否则它自己进不了结果，同批挂在它下面的子节点也接不上
  const match_data = data.filter(
    e => !where || isTreeBaseMember(e.id, e.patch, entityId) || isEntityMatchWhere(e.patch, where)
  );
  if (match_data.length === 0) return;

  const entities = match_data.map(d => task.serialize(d));

  switch (task.type) {
    case 'findDescendants': {
      // 必须把本批新建实体一并纳入关系图，否则"父子同批新建"时，
      // 子节点向上查父节点会查不到而被丢弃（与 findAncestors 分支保持一致）。
      // 直接流式喂给 `buildEntityMap`：此前先 `Array.from` 再展开成第二个数组，
      // 把整个结果集物化了两遍，而这两个数组除了建图之外没有别的用处。
      const entities_map = buildEntityMap(concatIterables(task.resultEntitySet, entities), e => e.id);

      const new_descendants = entities.filter(
        entity => isTreeBaseMember(entity.id, entity, entityId) || isDescendantOf(entity, entityId, entities_map, level)
      );
      if (new_descendants.length === 0) return;

      new_descendants.forEach(entity => task.resultEntitySet.add(entity));
      task.next(Array.from(task.resultEntitySet.values()), true);
      break;
    }

    case 'findAncestors': {
      const entities_map = buildEntityMap(concatIterables(task.resultEntitySet, entities), e => e.id);

      const new_ancestors = entities.filter(
        entity => isTreeBaseMember(entity.id, entity, entityId) || isAncestorOf(entity, entityId, entities_map, level)
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
    return;
  }

  // 上面的规则只按 where 判：新建的基准成员不匹配 where 时一条都不命中，SQL 重查却一定会返回它
  const { entityId } = task.options as FindTreeOptions<T>;
  const creates_base_member = result.current_entities.some(e => isTreeBaseMember(e.id, e.patch, entityId));
  if (!result.recalculate && !creates_base_member) return;

  const is_count = task.type === 'countDescendants' || task.type === 'countAncestors';
  if (is_count || needsSqlForCreatedTarget(task, result.current_entities)) {
    task.refresh();
    return;
  }
  _recalculate(task, result.current_entities);
};
