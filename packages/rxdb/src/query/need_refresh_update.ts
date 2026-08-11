/**
 * @packageDocumentation
 * 查询刷新判断 - 更新事件
 * 判断当有实体更新时,哪些查询结果需要刷新
 */
import { EntityType } from '../entity/entity.interface.js';
import { FindOptions } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import { tryGetEntityMetadata } from '../rxdb-utils.js';
import { UpdateDataCache } from './merge-update.utils.js';
import { runMatches } from './query-matching.utils.js';
import { separateEntities, whereUsesRelations } from './query-relation.utils.js';
import { QueryRulesBuilder } from './query-rules-builder.js';

const getWhere = <T extends EntityType>(options: unknown) => {
  if (!options || typeof options !== 'object' || !('where' in options)) {
    return undefined;
  }

  return (options as FindOptions<T>).where;
};

const hasKeys = (value: unknown): boolean =>
  !!value && typeof value === 'object' && Object.keys(value as object).length > 0;

/**
 * 更新前态是否无法还原。
 *
 * @remarks
 * `getSerializedBefore` 靠「更新后完整实体叠加 `inversePatch`」倒推更新前态。
 * `inversePatch` 为空时倒推结果就等于更新后态，于是 `match_where` 和
 * `match_where_before` 恒同真同假 —— 一条从「匹配」变成「不匹配」的行在增量合并里
 * **彻底隐形**：既不 refresh 也不 recalculate，活查询永久停在过期结果上，且没有任何
 * 报错或日志。
 *
 * 空 `inversePatch` 不是异常数据，是两条正常路径的既有产物：
 * - 适配器对系统表（`RxDBChange` / `RxDBSync` / …）的 UPDATE —— sqlite 的 update 钩子
 *   只给 rowid，拿不到旧值，只能发「patch = 整行新值 + inversePatch = `{}`」；
 * - `EntityManager.notifyExternalUpdate()` —— 调用方绕过 ORM 直接写库，同样没有旧值。
 *
 * 两者都表示「知道现在是什么，不知道之前是什么」。这种情况下唯一可靠的结论是回 SQL
 * 重算，而不是拿一个假的更新前态去推导「没变化」。
 *
 * @param events 本任务实体类型的更新事件
 * @returns 是否存在还原不出更新前态的事件
 */
const hasUnknownBefore = <T extends EntityType>(events: RxDBEntityLocalUpdatedEventData<T>[]): boolean =>
  events.some(event => hasKeys(event.patch) && !hasKeys(event.inversePatch));

export const query_need_refresh_update = <T extends EntityType>(
  task: QueryTask<T>,
  changes: RxDBEntityLocalUpdatedEventData<T>[],
  refresh_rules: RefreshMatchRules,
  recalculate_rules: RefreshMatchRules
) => {
  const query_entity_metadata = tryGetEntityMetadata(task.entityType);

  // 分离当前实体和关系实体（对外返回原始事件，不改变既有契约）
  const { current_entities, relation_entities } = separateEntities(task, changes);

  // 检测 where 是否使用了关系字段
  const where = getWhere<T>(task.options);
  let uses_relations = false;
  if (where && query_entity_metadata) {
    uses_relations = whereUsesRelations(where, query_entity_metadata);
  }

  // 门控判定必须基于完整实体。UPDATE 事件的 patch/inversePatch 只含被改字段，
  // 复合 where（多字段 AND）下用裸 patch 做 Reflect.get 判定，未变但满足条件的字段恒判
  // false，match_where 永远算不出"新匹配"——recalculate/refresh 都不会触发，查询结果
  // 永久性静默过期。这里与 classifyUpdates（merge-update.utils.ts）用同一套机制（叠加
  // patch/inversePatch 到完整快照）为 QueryRulesBuilder 重建完整实体，仅用于门控判定；
  // 返回值里的 current_entities/relation_entities 仍是原始事件，保持公开契约不变。
  const cache = new UpdateDataCache(changes, event => task.serialize(event));
  const resolvedCurrentEntities = current_entities.map(e => {
    const id = e.id as string;
    return {
      id: e.id,
      patch: cache.getSerializedUpdate(id) ?? e.patch,
      inversePatch: cache.getSerializedBefore(id, e.inversePatch) ?? e.inversePatch
    };
  });

  // 构建规则
  const builder = new QueryRulesBuilder(task, resolvedCurrentEntities, relation_entities.length > 0, uses_relations);
  const rules = builder.buildUpdateRules();

  const matches = runMatches(rules, refresh_rules, recalculate_rules);
  // 更新前态未知时不能走 JS 增量：它的每一条规则都建立在「能对比更新前后」之上。
  const before_unknown = hasUnknownBefore(current_entities);

  return {
    refresh: matches.refresh || before_unknown,
    recalculate: before_unknown ? false : matches.recalculate,
    current_entities,
    relation_entities
  };
};
