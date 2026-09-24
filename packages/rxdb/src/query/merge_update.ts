import { EntityType } from '../entity/entity.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import { handleFindAllUpdate, handleFindOneUpdate } from './merge-update-basic.js';
import { applyExternalEntityUpdate, prepareIncrementalUpdate } from './merge-update.utils.js';
import { query_need_refresh_update } from './need_refresh_update.js';

/**
 * 重新计算查询结果（JS 增量更新）
 * 根据不同的查询类型采用不同的更新策略
 *
 * UPDATE 场景特点:
 * - 实体的 ID 不变,但字段值可能变化
 * - 需要考虑 where 条件前后的匹配情况
 * - 需要考虑 orderBy 导致的排序位置变化
 *
 * @remarks
 * 与 `merge_remove.ts` 的同名函数同一条口径：只留**走得到 recalculate 的**任务类型。
 * `find` / `findByCursor` 在下面的派发里只往 `refresh_rules` 推规则（注释写得很明白：
 * 「受影响时需要重新应用 limit」「排序变化可能影响游标范围」，两者都只能回 SQL），
 * `recalculate_rules` 为空时 `runMatches` 恒返回 `recalculate: false`，给它们留 case
 * 只是死码——而且那两个 case 调用的 `handleFind*Update` 不过是把同一个「受影响就刷新」
 * 的判断用 JS 又写了一遍，规则层早已判完。`get` 则在默认导出里就短路处理了，
 * 不经过这里。
 *
 * `count` 同样不再留 case：它和 CREATE（见 merge_create.ts 对应分支的注释）、
 * 以及 merge_remove.ts 的 count 分支是同一条原则——count 结果只是个裸 number，
 * 没有 id 级基线可比对，「这条 UPDATE 是否已经被当前快照数进去/踢出去了」在 JS 侧
 * 根本判断不了。原先这里调 `handleCountUpdate`，靠 `classification.newlyMatchedIds` /
 * `newlyUnmatchedIds` 在本地加减，一旦同一条跨 where 边界的变更被重复派发，或者快照本就
 * 取自这次更新提交之后、事件却姗姗来迟，就会把已经数过的这行再加/减一次，且没有下一次
 * 整查之前不会纠回来。现在这条路径改由 `query_need_refresh_update` 额外返回的
 * `count_boundary_crossed` 精确判定是否要回 SQL 重数（配对比较同一个实体的 patch/
 * inversePatch，见该函数与下面 count 分支的注释），不再经过这个 switch，
 * `recalculate_rules` 对 count 也恒为空。
 *
 * @param task 查询任务
 * @param data 更新的实体数据
 */
const _recalculate = <T extends EntityType>(task: QueryTask<T>, data: RxDBEntityLocalUpdatedEventData<T>[]) => {
  const { cache, classification } = prepareIncrementalUpdate(task, data);

  switch (task.type) {
    case 'findAll':
      handleFindAllUpdate(task, classification, cache);
      break;

    case 'findOne':
    case 'findOneOrFail':
      handleFindOneUpdate(task, classification, cache);
      break;
  }
};

/**
 * 把一条 UPDATE 落到 `get` 任务的结果上。
 *
 * @remarks
 * `get` 不走 `_recalculate`：那里按 `task.type` 分派，而 `get` 的判定根本不需要规则层——
 * 只要事件批次里有目标 id，这次更新就一定影响结果。原先它在 `_recalculate` 里多带一层
 * 「再 `find` 一次目标 id」的守卫，但传进去的已经是按同一个 id 过滤过的非空数组，
 * 那次 `find` 恒命中，`if (!update) return` 是死分支。收进来之后只剩一处 id 判定。
 *
 * 两条分支不是兜底而是两种真实形态：命中缓存实例时就地打 patch，保住订阅者手里的引用；
 * 结果是 `null`（`get` 未命中）时没有实例可打，只能把事件负载序列化成新实例发出去——
 * 这正是「查的时候还不存在、随后被别的端建出来」的那一幕。
 *
 * @param task - 目标 `get` 任务
 * @param update - 命中目标 id 的那条更新事件
 */
const applyGetUpdate = <T extends EntityType>(task: QueryTask<T>, update: RxDBEntityLocalUpdatedEventData<T>) => {
  if (task.result && typeof task.result === 'object') {
    const currentResult = task.result as InstanceType<T>;
    applyExternalEntityUpdate(currentResult, update.patch);
    task.next(currentResult);
    return;
  }

  task.next(task.serialize(update));
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
 * - count: SQL 刷新重算 (没有 id 级基线，本地加减不可信；判据见下方 count 分支与
 *   need_refresh_update.ts 的 count_boundary_crossed 注释)
 *
 * @param task 查询任务
 * @param entities 更新的实体事件数据
 */
export default <T extends EntityType>(task: QueryTask<T>, entities: RxDBEntityLocalUpdatedEventData<T>[]) => {
  // 与 merge_create 的同款守卫：首个权威结果尚未落地时不做增量——此刻 resultEntitySet
  // 还是空的，findAll 的增量合并会把事件负载当成完整结果发射，订阅者第一眼看到的是
  // 只含「被更新那几行」的残缺答案。变更事件按批次投递、还可能跨进程（Tauri 的 stdio
  // 宿主最典型），完全可能赶在 runner 的 SQL 回来之前送达。
  //
  // 交给 `refresh()` 而不是直接 `return`：runner 的快照可能取自更新提交之前，
  // 直接丢弃会让这次更新在活查询里永远缺席。重跑一次查询两种情况都对。
  if (task.result === undefined) {
    task.refresh();
    return;
  }

  const refresh_rules: RefreshMatchRules = [];
  const recalculate_rules: RefreshMatchRules = [];

  if (task.type === 'get') {
    const update = entities.find(entity => entity.id === task.options);
    if (update) applyGetUpdate(task, update);
    return;
  }

  switch (task.type) {
    case 'find':
      // 分页查询: 结果集受影响时刷新
      // result_contains: 更新的实体在当前结果中
      // match_where + not_match_where_before: 新匹配的实体
      // match_where + match_order_by: 一直匹配、但排序键变化后挤进/挪出当前页的实体
      // match_relation_where: 关系实体变更
      refresh_rules.push(
        ['result_contains'],
        ['match_where', 'not_match_where_before'],
        ['match_where', 'match_order_by'],
        ['match_relation_where']
      );
      break;

    case 'findByCursor':
      // 游标分页: 结果集受影响时刷新
      // result_contains: 更新的实体在当前结果中
      // match_where + not_match_where_before: 新匹配的实体
      // match_where + match_order_by: 一直匹配、但排序键变化后挤进/挪出当前窗口的实体
      // match_relation_where: 关系实体变更
      refresh_rules.push(
        ['result_contains'],
        ['match_where', 'not_match_where_before'],
        ['match_where', 'match_order_by'],
        ['match_relation_where']
      );
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
      // match_where + match_order_by: 一直匹配、但排序键变化后越到当前命中之前的实体——
      // 它既不在结果里（result_contains 假）也不是"新匹配"（not_match_where_before 假），
      // JS 侧没有它的数据可比，只能回 SQL 重取
      refresh_rules.push(['match_where', 'match_order_by'], ['match_relation_where']);
      break;

    case 'count':
      // 计数查询: SQL 刷新重算，不再 JS 本地加减（原因见 _recalculate 的 remarks）。
      //
      // 这里不能照抄 find/findAll 分支「match_where OR match_where_before」那种粗粒度门槛：
      // find/findAll 靠 result_contains 兜底判断"这条更新是否真的影响结果"，count 没有
      // 结果集可比对，match_where/match_where_before 各自都只是"批次里有实体现在/曾经
      // 匹配"的存在性判断，直接拿它们当刷新触发条件，会让"一直匹配、只是改了个无关字段"
      // 的更新也去刷一次 SQL——这正是要避免的"与计数无关的变更也打一次 COUNT"。
      //
      // 但这两个存在性判断也不能简单 AND 成"新匹配/新不匹配"两组规则数组：一批更新里
      // 同时有「新匹配」和「新不匹配」两个方向时（如下面"应该同时处理新匹配和不再匹配的
      // 实体"用例），match_where 和 match_where_before 会**同时为真**，和"一批里只是
      // 几个本来就匹配的稳定实体"在批次级布尔值上完全没法区分——按规则名分别做 existential
      // OR 再 AND 起来，丢失了"是不是同一个实体自己的 patch/inversePatch"这层配对信息。
      // 因此 count 的匹配状态跨越判定不走下面这两组规则数组（recalculate_rules 留空，
      // refresh_rules 只留关系判据），改用 query_need_refresh_update 额外返回的
      // count_boundary_crossed——逐个实体配对比较 patch/inversePatch 是否跨过 where
      // 边界，不受同批次其它实体方向的干扰（判据与实现见 need_refresh_update.ts）。
      //
      // match_relation_where 仍然复用共享规则：关系实体变更是否影响这次 count 只是
      // 单个存在性判断（"批次里有没有相关的关系实体变了"），没有方向配对问题。
      refresh_rules.push(['match_relation_where']);
      break;
  }

  const result = query_need_refresh_update(task, entities, refresh_rules, recalculate_rules);
  const needs_refresh = result.refresh || (task.type === 'count' && result.count_boundary_crossed);

  if (needs_refresh) {
    task.refresh();
  } else if (result.recalculate) {
    _recalculate(task, entities);
  }
};
