import { EntityType, RxDBEntityId } from '../entity/entity.interface.js';
import { RuleGroup } from '../repository/query.interface.js';
import { RxDBEntityLocalUpdatedEventData } from '../rxdb-events.js';
import { tryGetEntityStatus } from '../rxdb-utils.js';
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

  // 实体脏时不能走 replace。replace 会把本地编辑写进 origin 并把 _modified 归零，
  // patch 随之清空 —— UI 看似没变，下一次 save() 静默 no-op，用户的编辑永久丢失。
  // 改走逐字段合并：origin 基线照常前移，但用户改过的键保留本地值。
  if (status.modified && typeof status.mergeExternal === 'function') {
    status.mergeExternal(patch);
    return;
  }

  if (typeof status.replace === 'function') {
    status.replace(patch);
    return;
  }

  Object.assign(entity, patch);
  status.modified = false;
  status.origin = structuredClone({ ...entity });
};

/**
 * 更新数据的缓存管理器
 * 用于缓存序列化后的实体数据,避免重复序列化
 */
export class UpdateDataCache<T extends EntityType> {
  private dataById = new Map<RxDBEntityId, RxDBEntityLocalUpdatedEventData<T>>();
  private serializedUpdateCache = new Map<RxDBEntityId, InstanceType<T>>();
  private serializedBeforeCache = new Map<RxDBEntityId, InstanceType<T>>();

  constructor(
    data: RxDBEntityLocalUpdatedEventData<T>[],
    private serialize: (event: RxDBEntityLocalUpdatedEventData<T>) => InstanceType<T>
  ) {
    data.forEach(event => this.dataById.set(event.id as RxDBEntityId, event));
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
   * where 判定错误。这里以"完整更新后实体"为底，叠加 inversePatch 还原出
   * 完整的更新前态。返回的是全新的普通对象，不会改写共享的实体缓存实例。
   */
  getSerializedBefore(id: RxDBEntityId, inversePatch: Readonly<Partial<InstanceType<T>>>): InstanceType<T> | undefined {
    if (this.serializedBeforeCache.has(id)) {
      return this.serializedBeforeCache.get(id);
    }
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
 * 关键：where 判定必须基于"完整实体"。patch/inversePatch 是增量字段，复合
 * where（如 status='active' AND priority='high'）下若直接拿裸 patch 判定，
 * 缺失字段会恒判 false，导致 newlyUnmatchedIds 漏算、count 静默偏差。
 * 这里统一通过 cache 取完整的更新前/后态再判定。
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
    const beforeEntity = cache.getSerializedBefore(id, e.inversePatch);
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
