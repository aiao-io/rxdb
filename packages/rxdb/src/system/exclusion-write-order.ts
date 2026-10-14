/**
 * @fileoverview 声明了区间排他的实体在批量写入与切换重放里的执行顺序（US-030 AC#14）。
 *
 * 区间排他按行即时检查（两后端都不延迟）。两类适配器的切换重放（undo / redo / 切分支 /
 * 同步拉取）按 删除 → 插入 → 更新 执行，批量 `mutations` 按 插入 → 更新 → 删除 执行：
 * 「截止旧行 `to` + 新开一行 `from`」一起重放或一起保存时，先插新行、后截旧行，中间态重叠被拒，
 * 而终态完全合法。
 *
 * 对**声明了区间排他的实体**改为 删除 → 更新 → 插入：
 * - 删除与更新执行完时，这张表恰好是终态去掉本批新插的行——合法终态的子集；插入逐行加回去，
 *   每一步仍是终态的子集，不可能撞上排他（唯一约束同理）；
 * - 更新内部把收窄类（相等列不变、每一维只缩不扩）排最前：收窄不可能造出新的重叠，却能为后面
 *   扩区间的更新腾出空间，「调整两行分界点」的重放因此两个方向都能过；其余更新保持原相对顺序；
 * - 外键不受影响：两后端的外键都在提交时检查（SQLite 事务内 `defer_foreign_keys`、PG 外键
 *   `DEFERRABLE INITIALLY DEFERRED`），更新先于本批插入、暂时引用到还没插入的行不会当场报错。
 *
 * 不放宽约束：「无论什么顺序都要经过重叠」的写入（两行互换区间）仍被拒，调用方经中间值分两步写。
 * 没有声明区间排他的实体顺序不变。
 */

import type { EntityType } from '../entity/entity.interface.js';
import { compileExclusionConstraint, type CompiledExclusionConstraint } from '../entity/exclusion-constraint.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import type { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';

/**
 * 实体的写入是否按「删除 → 更新 → 插入」排（声明了区间排他即是）。
 *
 * @param metadata - 实体元数据
 */
export const ordersWritesForExclusion = (metadata: EntityMetadata): boolean => metadata.exclusionMap.size > 0;

/** 一条更新的前后值：`patch` 是写下去的新值，`inversePatch` 是被替换的旧值（都可只含变更列）。 */
export interface ExclusionUpdateChange {
  readonly patch: Readonly<Record<string, unknown>> | null;
  readonly inversePatch: Readonly<Record<string, unknown>> | null;
}

const has = (record: Readonly<Record<string, unknown>> | null, key: string): boolean =>
  record !== null && Object.prototype.hasOwnProperty.call(record, key);

/**
 * 两个端点值的大小：`Date` 按时刻、`number` / `bigint` 按数值、字符串按字节序（ISO 时间文本同序）。
 *
 * @returns 负数 / 0 / 正数；类型对不上时为 `undefined`（调用方按「不是收窄」处理）
 */
const compareEndpoint = (a: unknown, b: unknown): number | undefined => {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : Number(a > b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : Number(a > b);
  return undefined;
};

/** 一个端点只缩不扩：起点不前移（NULL 起点即 −∞），终点不后移（NULL 终点即 +∞）。 */
const endpointNarrows = (change: ExclusionUpdateChange, field: string, side: 'from' | 'to'): boolean => {
  if (!has(change.patch, field)) return true;
  if (!has(change.inversePatch, field)) return false;
  const next = change.patch![field];
  const previous = change.inversePatch![field];
  if (previous === null) return true;
  if (next === null) return false;
  const order = compareEndpoint(next, previous);
  return order !== undefined && (side === 'from' ? order >= 0 : order <= 0);
};

/** 相等列没变（不在 patch 里，或新旧值相同）。 */
const equalUnchanged = (change: ExclusionUpdateChange, field: string): boolean => {
  if (!has(change.patch, field)) return true;
  if (!has(change.inversePatch, field)) return false;
  return (
    compareEndpoint(change.patch![field], change.inversePatch![field]) === 0 ||
    Object.is(change.patch![field], change.inversePatch![field])
  );
};

const touchesExclusion = (exclusion: CompiledExclusionConstraint, change: ExclusionUpdateChange): boolean =>
  [...exclusion.equal, ...exclusion.ranges.flatMap(range => [range.from, range.to])].some(column =>
    has(change.patch, column.field)
  );

const narrowsExclusion = (exclusion: CompiledExclusionConstraint, change: ExclusionUpdateChange): boolean =>
  exclusion.equal.every(column => equalUnchanged(change, column.field)) &&
  exclusion.ranges.every(
    range => endpointNarrows(change, range.from.field, 'from') && endpointNarrows(change, range.to.field, 'to')
  );

const compiledExclusionsOf = (metadata: EntityMetadata): CompiledExclusionConstraint[] =>
  Array.from(metadata.exclusionMap.values(), exclusion => compileExclusionConstraint(metadata, exclusion));

const narrowsAll = (exclusions: readonly CompiledExclusionConstraint[], change: ExclusionUpdateChange): boolean =>
  exclusions.some(exclusion => touchesExclusion(exclusion, change)) &&
  exclusions.every(exclusion => narrowsExclusion(exclusion, change));

/**
 * 一条更新对实体的全部区间排他而言是否「收窄」：至少碰了一列排他列，相等列不变，
 * 每一维新区间都落在旧区间之内（端点比较；倒置 / 空区间收窄后仍是空区间）。
 *
 * @param metadata - 实体元数据
 * @param change - 更新的新旧值（属性名为键）
 */
export const isExclusionNarrowingUpdate = (metadata: EntityMetadata, change: ExclusionUpdateChange): boolean =>
  narrowsAll(compiledExclusionsOf(metadata), change);

/**
 * 给一个实体的一组更新排序：收窄类在前，其余保持原相对顺序（稳定分组，不做全排序）。
 *
 * @param metadata - 实体元数据；没有区间排他时原样返回
 * @param items - 待执行的更新
 * @param changeOf - 取一条更新的新旧值；取不到时按「不是收窄」处理
 * @returns 排好序的新数组
 */
export const orderExclusionUpdates = <T>(
  metadata: EntityMetadata,
  items: readonly T[],
  changeOf: (item: T) => ExclusionUpdateChange | undefined
): T[] => {
  if (!ordersWritesForExclusion(metadata)) return [...items];
  // 一组更新只编译一次排他声明（批量重放可能有成千上万条）
  const exclusions = compiledExclusionsOf(metadata);
  const narrowing: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const change = changeOf(item);
    (change && narrowsAll(exclusions, change) ? narrowing : rest).push(item);
  }
  return [...narrowing, ...rest];
};

/** 批量写入的一步：某个实体类型的一组创建 / 更新 / 删除。 */
export interface EntityWriteStep<T extends EntityType = EntityType> {
  /** 写入种类 */
  readonly kind: 'create' | 'update' | 'remove';
  /** 实体类型 */
  readonly EntityType: T;
  /** 这一步写入的实体（同类型内保持原顺序） */
  readonly entities: InstanceType<T>[];
}

const hasEntity = <T extends EntityType>(
  map: Map<T, Set<InstanceType<T>>>,
  EntityType: T,
  entity: InstanceType<T>
): boolean => map.get(EntityType)?.has(entity) === true;

/**
 * 给一次批量写入（`mutations`）排执行顺序。
 *
 * @param mutations - 批量写入
 * @returns 依次执行的步骤
 *
 * @remarks
 * 没有区间排他的实体维持原顺序：插入 → 更新 → 删除。声明了区间排他的实体，删除与更新提到
 * 全部插入之前（删除 → 更新 → 插入），更新内部收窄类在前（见本文件 @fileoverview）。
 *
 * 同一批里**既被创建、又被更新 / 删除**的同一个实例不提前——提前会改写它的语义
 * （先更新一行还不存在的行、再插入，终态就丢了那次更新）；它们留在原来的位置。
 */
export const planMutationWrites = <T extends EntityType>(mutations: RxDBMutationsMap<T>): EntityWriteStep<T>[] => {
  const early: EntityWriteStep<T>[] = [];
  const lateUpdates: EntityWriteStep<T>[] = [];
  const lateRemoves: EntityWriteStep<T>[] = [];
  const split = (
    kind: 'update' | 'remove',
    map: Map<T, Set<InstanceType<T>>>,
    heldBack: (EntityType: T, entity: InstanceType<T>) => boolean,
    late: EntityWriteStep<T>[]
  ): void => {
    for (const [EntityType, set] of map) {
      const entities = Array.from(set);
      const metadata = getEntityMetadata(EntityType);
      if (!ordersWritesForExclusion(metadata)) {
        late.push({ kind, EntityType, entities });
        continue;
      }
      const moved = entities.filter(entity => !heldBack(EntityType, entity));
      const kept = entities.filter(entity => heldBack(EntityType, entity));
      if (moved.length > 0) {
        const ordered =
          kind === 'update' ?
            orderExclusionUpdates(metadata, moved, entity => {
              const status = getEntityStatus<T>(entity);
              return { patch: status.patch, inversePatch: status.inversePatch };
            })
          : moved;
        early.push({ kind, EntityType, entities: ordered });
      }
      if (kept.length > 0) late.push({ kind, EntityType, entities: kept });
    }
  };
  split(
    'remove',
    mutations.remove,
    (EntityType, entity) =>
      hasEntity(mutations.create, EntityType, entity) || hasEntity(mutations.update, EntityType, entity),
    lateRemoves
  );
  split(
    'update',
    mutations.update,
    (EntityType, entity) => hasEntity(mutations.create, EntityType, entity),
    lateUpdates
  );
  const creates = Array.from(mutations.create, ([EntityType, set]) => ({
    kind: 'create' as const,
    EntityType,
    entities: Array.from(set)
  }));
  return [...early, ...creates, ...lateUpdates, ...lateRemoves];
};
