/**
 * @fileoverview 批量写入里的手动排序键处理（US-028）
 *
 * `EntityManager.mutations` 在任何写发出之前先校验整批的显式键，
 * 缺键的创建与改了分组字段又没给键的更新再在主适配器事务内统一追加——
 * 同一目标组的 n 条一次读尾键、一次生成 n 个键，互不碰撞。
 */

import type { EntityType } from '../entity/entity.interface.js';
import type { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { SORT_ORDER_FIELD } from './sortable.interface.js';
import {
  appendToGroupTails,
  assertExplicitSortOrders,
  assertSortOrderKey,
  hasMissingSortOrder,
  isManualOrderEntity,
  isRegroupWithoutKey,
  type AppendRow
} from './sortable.utils.js';

type MutationBucket = RxDBMutationsMap['create'];

/** 桶里启用了手动排序的实体类型与它们的行 */
const manualOrderEntries = (bucket: MutationBucket): [EntityType, InstanceType<EntityType>[]][] =>
  [...bucket]
    .filter(([EntityType]) => isManualOrderEntity(getEntityMetadata(EntityType)))
    .map(([EntityType, entities]) => [EntityType, [...entities]]);

/** 更新行里改到的排序键：从实体状态的 patch 取，没改就不校验 */
const assertPatchedSortOrders = (entity: string, rows: InstanceType<EntityType>[]): void => {
  for (const row of rows) {
    const patch = getEntityStatus(row).patch as Record<string, unknown>;
    if (SORT_ORDER_FIELD in patch) assertSortOrderKey(entity, patch[SORT_ORDER_FIELD]);
  }
};

/**
 * 整批校验显式排序键：创建行里给了键的、更新行里改了键的
 *
 * @throws {@link SortOrderError} `'invalidKey'`，抛出时一条写都没有发出
 */
export const assertMutationSortOrders = (options: RxDBMutationsMap): void => {
  for (const [EntityType, rows] of manualOrderEntries(options.create)) {
    assertExplicitSortOrders(getEntityMetadata(EntityType).name, rows);
  }
  for (const [EntityType, rows] of manualOrderEntries(options.update)) {
    assertPatchedSortOrders(getEntityMetadata(EntityType).name, rows);
  }
};

/** 改了分组字段又没给排序键的更新行 */
const regroupedRows = (
  EntityType: EntityType,
  rows: Iterable<InstanceType<EntityType>>
): InstanceType<EntityType>[] => {
  const metadata = getEntityMetadata(EntityType);
  return [...rows].filter(row => isRegroupWithoutKey(metadata, row, getEntityStatus(row).patch));
};

/** 批内是否有要追加排序键的行（缺键创建、改组更新）——有才需要走事务追加 */
export const needsSortOrderAppend = (options: RxDBMutationsMap): boolean =>
  manualOrderEntries(options.create).some(([, rows]) => hasMissingSortOrder(rows)) ||
  manualOrderEntries(options.update).some(([EntityType, rows]) => regroupedRows(EntityType, rows).length > 0);

/** 某类型这批要追加的行：缺键创建在前、改组更新在后，同组共用一次尾键读取 */
const appendRowsOf = (EntityType: EntityType, options: RxDBMutationsMap): AppendRow[] => [
  ...[...(options.create.get(EntityType) ?? [])]
    .filter(row => hasMissingSortOrder([row]))
    .map(row => ({ row, persisted: false })),
  ...regroupedRows(EntityType, options.update.get(EntityType) ?? []).map(row => ({ row, persisted: true }))
];

/**
 * 在事务内给批内缺键的创建、改组的更新按类型、按目标组追加排序键（原地赋值）
 *
 * @param executor - 主适配器事务执行器；读尾键与随后的写入必须在它的同一个事务里
 */
export const appendBatchSortOrders = async (executor: TransactionExecutor, options: RxDBMutationsMap) => {
  const EntityTypes = new Set([...options.create.keys(), ...options.update.keys()]);
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    if (!isManualOrderEntity(metadata)) continue;
    const rows = appendRowsOf(EntityType, options);
    if (rows.length > 0) await appendToGroupTails(executor.getRepository(EntityType), metadata, rows);
  }
};
