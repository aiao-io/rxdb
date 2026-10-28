/**
 * @packageDocumentation
 * 查询刷新判断 - 更新事件
 * 判断当有实体更新时,哪些查询结果需要刷新
 */
import { isEqual, once } from '@aiao/utils';
import { EntityStaticType, EntityType, RxDBEntityId } from '../entity/entity.interface.js';
import { EntityMetadata } from '../entity/metadata.interface.js';
import { FindOptions, OrderBy } from '../repository/query-options.interface.js';
import { RefreshMatchRules } from '../repository/QueryManager.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import { tryGetEntityMetadata, tryGetEntityStatus } from '../rxdb-utils.js';
import { UpdateDataCache } from './merge-update.utils.js';
import { isEntityMatchWhere, runMatches } from './query-matching.utils.js';
import { fieldColumn, separateEntities, whereRules, whereUsesRelations } from './query-relation.utils.js';
import { QueryRulesBuilder } from './query-rules-builder.js';
import { isStaleEventPayload } from './stale-event.utils.js';

const getFindOptions = <T extends EntityType>(options: unknown): FindOptions<T> | undefined =>
  options && typeof options === 'object' ? (options as FindOptions<T>) : undefined;

const hasKeys = (value: unknown): boolean =>
  !!value && typeof value === 'object' && Object.keys(value as object).length > 0;

/** 实体在这些列上都有已知值：是自有属性且不是 `undefined`（`null` 是已知值）。 */
const hasFields = (entity: object, fields: Iterable<string>): boolean => {
  for (const field of fields) {
    if (!Object.hasOwn(entity, field) || Reflect.get(entity, field) === undefined) return false;
  }
  return true;
};

/**
 * 更新前态是否无法还原。
 *
 * @remarks
 * 更新前态靠「更新后态叠加 `inversePatch`」倒推。
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

/**
 * 任务读取的本表列：where 规则与 orderBy 字段落在的列，外加调用方声明的列。
 */
const readColumnsOf = (
  where: unknown,
  orderBy: OrderBy<string>[] | undefined,
  metadata: EntityMetadata | undefined,
  extra: Iterable<string>
): Set<string> => {
  const columns = new Set(extra);
  const add = (field: string) => {
    const column = fieldColumn(field, metadata);
    if (column !== undefined) columns.add(column);
  };
  for (const rule of whereRules(where)) add(rule.field);
  for (const order of orderBy ?? []) add(order.field);
  return columns;
};

/**
 * 这条更新（同批同 id 已合并）是否改动了给定列中的某一列。
 *
 * @remarks
 * 只认值真的变了的列：有的写入路径会把没变的列一起带上（树节点只改名时 patch 里仍可能有
 * `parentId`）。一侧缺这个键按「变了」算。
 */
const touchesColumns = (event: RxDBEntityLocalUpdatedEventData, columns: ReadonlySet<string>): boolean => {
  const patch = event.patch as Record<string, unknown>;
  const inversePatch = event.inversePatch as Record<string, unknown>;
  for (const column of columns) {
    const present = Object.hasOwn(patch, column) || Object.hasOwn(inversePatch, column);
    if (present && !isEqual(patch[column], inversePatch[column])) return true;
  }
  return false;
};

/**
 * 门控按库里的值判定。
 *
 * @remarks
 * 脏实体的可见值里混着用户还没保存的编辑（外部更新经 `mergeExternal` 逐字段避让它们），
 * SQL 活查询不会按这些值算。被编辑的键改取基线：`inversePatch` 正是这些键在 `origin`
 * 上的值，外部更新推进的也是这份基线。
 */
const persistedState = (entity: object): object => {
  const status = tryGetEntityStatus(entity);
  return status?.modified ? { ...entity, ...status.inversePatch } : entity;
};

/** 一个实体在本批更新前后的样子，交给门控与规则层判定。 */
interface ResolvedUpdate<T extends EntityType> {
  id: RxDBEntityId;
  /** 本批对它的更新，同 id 多条已合并 */
  event: RxDBEntityLocalUpdatedEventData<T>;
  /** 更新后态 */
  patch: object;
  /** 更新前态：更新后态叠加 `inversePatch` */
  inversePatch: object;
}

/**
 * 用身份缓存里的实例叠加补丁，补足补丁之外没改的列。
 *
 * @remarks
 * 补得齐补不齐取决于缓存：未命中时更新后态只有补丁里的列，缓存里也可能本就是此前增量事件
 * 留下的残缺实体。够不够判定由门控按任务读取的列检查。序列化顺带把补丁合进身份缓存，
 * 所以每个实体都要走一遍，不能被门控的早退跳过。
 */
const resolveUpdate = <T extends EntityType>(cache: UpdateDataCache<T>, id: RxDBEntityId): ResolvedUpdate<T> => {
  const event = cache.getData(id)!;
  const after = persistedState(cache.getSerializedUpdate(id)!);
  return { id, event, patch: after, inversePatch: { ...after, ...event.inversePatch, id } };
};

/**
 * 判定一批 UPDATE 要不要回 SQL、能不能走 JS 增量。
 *
 * @param task - 查询任务
 * @param changes - 本批更新事件，可含关系实体的事件
 * @param refresh_rules - 命中即回 SQL 的规则组
 * @param recalculate_rules - 命中即走 JS 增量的规则组
 * @param readFields - 任务在 where / orderBy 之外还读的本表列（树查询的父列）
 * @returns 判定结论，以及按类型分好的原始事件
 */
export const query_need_refresh_update = <T extends EntityType>(
  task: QueryTask<T>,
  changes: RxDBEntityLocalUpdatedEventData<T>[],
  refresh_rules: RefreshMatchRules,
  recalculate_rules: RefreshMatchRules,
  readFields: Iterable<string> = []
) => {
  const query_entity_metadata = tryGetEntityMetadata(task.entityType);

  // 分离当前实体和关系实体（对外返回原始事件，不改变既有契约）
  const { current_entities, relation_entities } = separateEntities(task, changes);

  const options = getFindOptions<T>(task.options);
  const where = options?.where;

  // 门控判定要用补足后的实体。UPDATE 事件的 patch/inversePatch 只含被改字段，
  // 复合 where（多字段 AND）下用裸 patch 做 Reflect.get 判定，未变但满足条件的字段恒判
  // false，match_where 永远算不出"新匹配"——recalculate/refresh 都不会触发，查询结果
  // 永久性静默过期。这里与 classifyUpdates（merge-update.utils.ts）用同一套机制：用身份
  // 缓存里的实例叠加 patch/inversePatch，补足没改的字段；补不齐任务读取的列时由下面的
  // 门控回 SQL。返回值里的 current_entities/relation_entities 仍是原始事件，保持公开契约不变。
  // 缓存只收本任务实体类型的事件：关系实体与它同 id 时会互相顶替（整数主键最常见）。
  const cache = new UpdateDataCache(current_entities, event => task.serialize(event));
  const resolvedById = new Map<RxDBEntityId, ResolvedUpdate<T>>();
  for (const event of current_entities) {
    const id = event.id as RxDBEntityId;
    if (!resolvedById.has(id)) resolvedById.set(id, resolveUpdate(cache, id));
  }
  const resolvedCurrentEntities = Array.from(resolvedById.values());

  const readColumns = readColumnsOf(where, options?.orderBy, query_entity_metadata, readFields);
  const resultFields = once(() =>
    query_entity_metadata ? [...query_entity_metadata.propertyMap.keys(), ...query_entity_metadata.foreignKeyNames] : []
  );

  // findAll 把新匹配的行直接追加进结果：补丁之外的持久列补不齐时，追加进去的就是残缺行。
  // 已在结果里的行就地合并补丁，不需要整行。
  const isIncompleteNewRow = (resolved: ResolvedUpdate<T>): boolean =>
    task.type === 'findAll' &&
    !task.resultEntityIds.has(resolved.id as EntityStaticType<T, 'idType'>) &&
    (!where || isEntityMatchWhere(resolved.patch, where)) &&
    !hasFields(resolved.patch, resultFields());

  const isUndecidable = (resolved: ResolvedUpdate<T>): boolean => {
    // 没改任务读取的列：这一行的匹配状态与排序位置都没动，缓存缺哪一列都不影响结论
    if (!touchesColumns(resolved.event, readColumns)) return false;
    // 缓存比事件新：更新后态是更晚的版本，叠加这条迟到的 inversePatch 拼出的前态哪个版本都不是
    if (isStaleEventPayload(resolved.patch, resolved.event.patch)) return true;
    return (
      !hasFields(resolved.patch, readColumns) ||
      !hasFields(resolved.inversePatch, readColumns) ||
      isIncompleteNewRow(resolved)
    );
  };

  // 前后态补不齐或已过期，证明不了更新前后的匹配状态，也不能作为完整查询行下发。
  if (hasUnknownBefore(current_entities) || resolvedCurrentEntities.some(isUndecidable)) {
    return {
      refresh: true,
      recalculate: false,
      current_entities,
      relation_entities,
      count_boundary_crossed: false
    };
  }

  // 检测 where 是否使用了关系字段
  let uses_relations = false;
  if (where && query_entity_metadata) {
    uses_relations = whereUsesRelations(where, query_entity_metadata);
  }

  // 构建规则
  const builder = new QueryRulesBuilder(task, resolvedCurrentEntities, relation_entities.length > 0, uses_relations);
  const rules = builder.buildUpdateRules();

  const matches = runMatches(rules, refresh_rules, recalculate_rules);

  // count 专用的精确判据（其余 task.type 都有更合适的机制，不该消费这个字段——见
  // merge_update.ts 的 count 分支）。match_where / match_where_before 是整个批次的
  // 存在性判断（`.some()`），一批里同时有「新匹配」和「新不匹配」两个方向、或者一批里
  // 只是几个本来就匹配的稳定实体，这两个布尔值会**同时为真**——批次级别根本分不清
  // 这两种情形。count 没有 result_contains 那样的结果集可以兜底，只能配对着比较
  // **同一个实体自己**的 patch 与 inversePatch，才能看出它是否真的跨过了 where 边界，
  // 不受同批次其它实体方向的干扰。用 resolvedCurrentEntities 而不是原始
  // current_entities——复合 where 下真实的增量 patch 可能只含被改字段，必须先合并进
  // 缓存实体补全字段（RXD-017），否则缺失字段在 isEntityMatchWhere 里恒判 false；
  // 补不齐的情形上面已经回 SQL。
  const count_boundary_crossed =
    where ?
      resolvedCurrentEntities.some(
        e => isEntityMatchWhere(e.patch, where) !== isEntityMatchWhere(e.inversePatch, where)
      )
    : false;

  return {
    refresh: matches.refresh,
    recalculate: matches.recalculate,
    current_entities,
    relation_entities,
    count_boundary_crossed
  };
};
