import { EntityType, RxDBEntityId } from '../entity/entity.interface.js';
import { FindAllOptions } from '../repository/query-options.interface.js';
import { RuleGroup } from '../repository/query.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import { tryGetEntityStatus } from '../rxdb-utils.js';
import { isEntityMatchWhere } from './query-matching.utils.js';
import { isStaleEventPayload } from './stale-event.utils.js';

/**
 * 获取实体 ID
 */
export const getEntityId = (entity: Record<string, unknown> | null | undefined): RxDBEntityId | undefined => {
  if (!entity) return undefined;
  const id = entity['id'];
  return typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint' ? id : undefined;
};

export const invalidateEntityFingerprint = <T extends EntityType>(entity: InstanceType<T>): void => {
  const status = tryGetEntityStatus(entity);
  if (!status) {
    return;
  }
  status.invalidateCache();
};

/**
 * 把外部事件的增量 patch 合并进缓存实体，且不记成用户的本地修改。
 *
 * P0-004（UPDATE 路径）：这里会走 `EntityStatus.replace` 的
 * `Object.assign(this.target, patch)`——**绕过 Proxy**、重设 `_origin`、`_modified` 归零。
 * 若 patch 比实体缓存更旧，无论实体当前是脏是净都不能应用：脏实体会连同用户尚未保存的
 * 编辑一起被打回；干净实体则会被静默回退到旧字段值、缓存的 updatedAt 水位倒退——同样是
 * 数据丢失，只是没有「重新编辑成同一个值」这层触发条件。
 *
 * 判别式是纯粹的时间戳单调性（`isStaleEventPayload`），不再区分 modified 状态。曾经的顾虑
 * 是 undo/redo 会写出比被替换行更旧的 `updatedAt`（`HistoryManager` 按 `max(Date.now(), …)`
 * 重算，没参考实体当前的 `updatedAt`）——但 P1-011（2026-07-29）已经在适配器层
 * （`switch-result.utils.ts` 的 `getSwitchUpdatedAt`：当前时钟/已知候选值+1ms/进程内水位+1ms
 * 三路取 max）把 undo/redo 改成写出单调递增的新时间戳，不再是"重放旧值"，那条曾经推翻纯
 * 时间戳守卫的实测前提已经不成立。
 *
 * @param entity 缓存中的实体实例
 * @param patch 外部事件负载（增量字段）
 * @public
 */
export const applyExternalEntityUpdate = <T extends EntityType>(
  entity: InstanceType<T>,
  patch: Partial<InstanceType<T>>
): void => {
  const status = tryGetEntityStatus(entity);
  if (!status) {
    Object.assign(entity, patch);
    return;
  }

  if (isStaleEventPayload(entity, patch)) {
    return;
  }

  // 脏净分流（脏则逐字段避让本地编辑，净则整行回填）统一由 EntityStatus.applyExternal 决定。
  status.applyExternal(patch);
};

/**
 * 把同一实体在一批里的前后两条 UPDATE 合成一条。
 *
 * @remarks
 * patch 后写覆盖、inversePatch 先写为准，合成后描述的是「本批之前 → 本批之后」整段变化。
 * 16ms 批处理窗口里连存两次就会出现同 id 的两条事件；不合的话，只被前一条改过的列不会落进
 * 缓存实例，在更新前态里又被照抄成更新后的值，跨界判定与增量合并都看不见这次修改。
 *
 * @param earlier - 先发生的那条
 * @param later - 后发生的那条
 * @returns 合并后的事件，其余字段取后一条
 */
export const foldUpdate = <T extends EntityType>(
  earlier: RxDBEntityLocalUpdatedEventData<T>,
  later: RxDBEntityLocalUpdatedEventData<T>
): RxDBEntityLocalUpdatedEventData<T> => ({
  ...later,
  patch: { ...earlier.patch, ...later.patch },
  inversePatch: { ...later.inversePatch, ...earlier.inversePatch }
});

/**
 * 更新数据的缓存管理器
 * 用于缓存序列化后的实体数据,避免重复序列化
 *
 * @remarks
 * 同 id 的多条事件在构造时按 {@link foldUpdate} 合成一条，`getData` / `getSerializedUpdate` /
 * `getSerializedBefore` 看到的都是合并后的那一条。
 */
export class UpdateDataCache<T extends EntityType> {
  private dataById = new Map<RxDBEntityId, RxDBEntityLocalUpdatedEventData<T>>();
  private serializedUpdateCache = new Map<RxDBEntityId, InstanceType<T>>();
  private serializedBeforeCache = new Map<RxDBEntityId, InstanceType<T>>();

  constructor(
    data: RxDBEntityLocalUpdatedEventData<T>[],
    private serialize: (event: RxDBEntityLocalUpdatedEventData<T>) => InstanceType<T>
  ) {
    for (const event of data) {
      const id = event.id as RxDBEntityId;
      const earlier = this.dataById.get(id);
      this.dataById.set(id, earlier ? foldUpdate(earlier, event) : event);
    }
  }

  /**
   * 获取序列化后的更新数据
   */
  getSerializedUpdate(id: RxDBEntityId): InstanceType<T> | undefined {
    if (this.serializedUpdateCache.has(id)) {
      return this.serializedUpdateCache.get(id);
    }
    const update = this.dataById.get(id);
    if (!update) {
      return undefined;
    }
    const serialized = this.serialize(update);
    this.serializedUpdateCache.set(id, serialized);
    return serialized;
  }

  /**
   * 获取序列化后的更新前数据
   *
   * inversePatch 只含被改字段的旧值，单独重建会丢失所有未变字段，导致复合
   * where 判定错误。这里以更新后实体为底叠加本批合并后的 inversePatch，补足没改的字段。
   * 返回的是全新的普通对象，不会改写共享的实体缓存实例。
   *
   * 更新后实体取自身份缓存：缓存未命中时它只有补丁里的字段，叠加出来的前态同样残缺。
   * 补不齐的情形由 UPDATE 门控拦在增量合并之前（见 `need_refresh_update.ts`）。
   *
   * 前态按 id 缓存、只有一份，所以不收调用方给的旧值：给了也只会拿到先算出来的那一份。
   *
   * @param id - 实体 id
   */
  getSerializedBefore(id: RxDBEntityId): InstanceType<T> | undefined {
    if (this.serializedBeforeCache.has(id)) {
      return this.serializedBeforeCache.get(id);
    }
    const inversePatch = this.dataById.get(id)?.inversePatch;
    const after = this.getSerializedUpdate(id);
    const before = (after ? { ...after, ...inversePatch, id } : { id, ...inversePatch }) as unknown as InstanceType<T>;
    this.serializedBeforeCache.set(id, before);
    return before;
  }

  /**
   * 获取原始更新数据
   */
  getData(id: RxDBEntityId): RxDBEntityLocalUpdatedEventData<T> | undefined {
    return this.dataById.get(id);
  }
}

/**
 * 更新分类结果
 */
export interface UpdateClassification {
  /** 更新的实体 ID 集合 */
  updatedIds: Set<RxDBEntityId>;
  /** 当前匹配条件的实体 ID */
  matchNowIds: Set<RxDBEntityId>;
  /** 更新前匹配条件的实体 ID */
  matchBeforeIds: Set<RxDBEntityId>;
  /** 从 "不匹配" 变为 "匹配" 的实体 */
  newlyMatchedIds: Set<RxDBEntityId>;
  /** 从 "匹配" 变为 "不匹配" 的实体 */
  newlyUnmatchedIds: Set<RxDBEntityId>;
  /** 更新前后都匹配的实体 */
  stillMatchedIds: Set<RxDBEntityId>;
}

/**
 * 分类更新的实体
 * 根据 where 条件判断实体的匹配状态变化
 *
 * 关键：where 判定必须基于补足后的实体。patch/inversePatch 是增量字段，复合
 * where（如 status='active' AND priority='high'）下若直接拿裸 patch 判定，
 * 缺失字段会恒判 false，导致 newlyUnmatchedIds 漏算、count 静默偏差。
 * 这里统一通过 cache 取更新前/后态再判定；where 用到的字段补不齐时，
 * UPDATE 门控已经回 SQL，走不到这里。
 */
export const classifyUpdates = <T extends EntityType>(
  data: RxDBEntityLocalUpdatedEventData<T>[],
  where: RuleGroup<InstanceType<T>> | undefined | null,
  isEntityMatchWhere: (entity: InstanceType<T> | undefined, where: RuleGroup<InstanceType<T>>) => boolean,
  cache: UpdateDataCache<T>
): UpdateClassification => {
  const updatedIds = new Set<RxDBEntityId>();
  const matchNowIds = new Set<RxDBEntityId>();
  const matchBeforeIds = new Set<RxDBEntityId>();

  for (const e of data) {
    const id = e.id as RxDBEntityId;
    updatedIds.add(id);
    const nowEntity = cache.getSerializedUpdate(id);
    const beforeEntity = cache.getSerializedBefore(id);
    if (!where || isEntityMatchWhere(nowEntity, where)) matchNowIds.add(id);
    if (!where || isEntityMatchWhere(beforeEntity, where)) matchBeforeIds.add(id);
  }

  const newlyMatchedIds = new Set<RxDBEntityId>();
  const newlyUnmatchedIds = new Set<RxDBEntityId>();
  const stillMatchedIds = new Set<RxDBEntityId>();

  for (const id of matchNowIds) {
    if (matchBeforeIds.has(id)) stillMatchedIds.add(id);
    else newlyMatchedIds.add(id);
  }
  for (const id of matchBeforeIds) {
    if (!matchNowIds.has(id)) newlyUnmatchedIds.add(id);
  }

  return {
    updatedIds,
    matchNowIds,
    matchBeforeIds,
    newlyMatchedIds,
    newlyUnmatchedIds,
    stillMatchedIds
  };
};

/**
 * 一次增量合并的上下文：完整实体缓存 + 匹配状态分类。
 */
export interface IncrementalUpdateContext<T extends EntityType> {
  /** 更新前/后完整实体的惰性缓存，供 handler 取 before/after 态 */
  cache: UpdateDataCache<T>;
  /** 各实体在本批更新前后的 where 匹配状态变化 */
  classification: UpdateClassification;
}

/**
 * 为一批 UPDATE 事件准备增量合并上下文。
 *
 * 这是**插件实现增量合并的入口原语**：插件（如树查询）拿到 task 与本批事件后，
 * 先调它得到 `{ cache, classification }`，再按自己的 task 类型决定怎么改 `task.result`。
 *
 * 它封住三处纯内部装配——完整实体怎么反序列化、where 判定器是哪个、缓存怎么建。
 * 这三处不外泄有实际约束力：where 判定必须基于**完整实体**，patch/inversePatch 只是
 * 增量字段，复合 where 下拿裸 patch 判定会因字段缺失恒判 false，让 newlyUnmatchedIds
 * 漏算、count 静默偏差。各插件自行接线就是各写一份判定，漂移了也不会报错。
 *
 * 进基线后受兼容承诺约束，见 `website/docs/versioning.md`。
 *
 * @param task 正在合并的查询任务；`task.options.where` 为空时视为全匹配
 * @param data 本批本地 UPDATE 事件
 */
export const prepareIncrementalUpdate = <T extends EntityType, RT = unknown>(
  task: QueryTask<T, RT>,
  data: RxDBEntityLocalUpdatedEventData<T>[]
): IncrementalUpdateContext<T> => {
  const where = (task.options as FindAllOptions<T>).where;
  const cache = new UpdateDataCache<T>(data, (event: RxDBEntityLocalUpdatedEventData<T>) => task.serialize(event));
  const classification = classifyUpdates<T>(data, where, isEntityMatchWhere, cache);
  return { cache, classification };
};
