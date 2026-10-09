/**
 * @fileoverview 批量写入里的手动排序键处理（US-028）
 *
 * `EntityManager.mutations` 在任何写发出之前先校验整批的显式键，
 * 缺键的创建与改了分组字段又没给键的更新再在主适配器事务内统一追加——
 * 同一目标组的 n 条一次读尾键、一次生成 n 个键，互不碰撞。
 */

import type { EntityType } from '../entity/entity.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
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
  manualOrderGroupFields,
  type AppendRow,
  type KnownEmptyGroup
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
 * 某类型这批里显式给了键、随后同一事务写入的行：给了键的创建、patch 改了键的更新
 *
 * 这些键此刻还没落库，读尾键看不到；追加时要把它们当作同组已占用的位置。
 */
const reservedRowsOf = (EntityType: EntityType, options: RxDBMutationsMap): InstanceType<EntityType>[] => [
  ...[...(options.create.get(EntityType) ?? [])].filter(row => !hasMissingSortOrder([row])),
  ...[...(options.update.get(EntityType) ?? [])].filter(row => SORT_ORDER_FIELD in getEntityStatus(row).patch)
];

/** 启用手动排序的实体类型 */
const manualOrderTypesOf = (options: RxDBMutationsMap): EntityType[] =>
  [...new Set([...options.create.keys(), ...options.update.keys()])].filter(EntityType =>
    isManualOrderEntity(getEntityMetadata(EntityType))
  );

/**
 * 批内要由引擎追加排序键的实例（缺键创建、改组更新）
 *
 * 供调用方在追加前用 `snapshotSortOrders` 取快照，事务失败时撤回引擎赋上的键。
 */
export const sortOrderAppendEntities = (options: RxDBMutationsMap): object[] =>
  manualOrderTypesOf(options).flatMap(EntityType => appendRowsOf(EntityType, options).map(({ row }) => row));

/** 实体的 `namespace:name`：关系与 create 桶按它对上号 */
const entityKey = (namespace: string, name: string): string => `${namespace}:${name}`;

/** 本批新建行的主键，按所属实体归档 */
const createdIdsByEntity = (options: RxDBMutationsMap): ReadonlyMap<string, ReadonlySet<unknown>> =>
  new Map(
    [...options.create].map(([EntityType, rows]) => {
      const { namespace, name } = getEntityMetadata(EntityType);
      return [entityKey(namespace, name), new Set([...rows].map(row => row.id))];
    })
  );

/**
 * 分组外键指向本批新建的行时，该组在库里必然为空
 *
 * @remarks
 * 成立的前提是后端强制外键：已提交的库状态里不可能有行指向尚不存在的行。本仓适配器建出的表都满足
 * （SQLite 系建连即 `PRAGMA foreign_keys = ON`，事务内 `defer_foreign_keys` 只推迟到提交时校验；PGlite 建表带约束）。
 * 追加读的是已提交的库状态、且先于本批一切写入，事务内的写序影响不到这里的判断。
 * 前提不成立的库（不强制外键的新后端）会把非空组当空组、从首键起算，与既有键相撞——新增本地后端时须让
 * `rxdb-test` 的 `manual-order-tree.suite.ts`（「外键约束拒绝指向不存在父行的子行」一条）在它的 runner 上通过。
 *
 * 外键所指的实体用关系的 `mappedNamespace` + `mappedEntity` 与 create 桶的实体元数据比对；自引用关系的
 * `mappedEntity` 在 `transitionMetadata` 里已改写成本实体的 `name`。匹配不到就不触发，回到逐组读尾键——只会慢，不会错。
 */
const knownEmptyGroups = (
  metadata: Pick<EntityMetadata, 'manualOrder' | 'foreignKeyRelationMap'>,
  createdIds: ReadonlyMap<string, ReadonlySet<unknown>>
): KnownEmptyGroup => {
  const createdTargets = manualOrderGroupFields(metadata).flatMap(field => {
    const relation = metadata.foreignKeyRelationMap.get(field);
    const ids = relation && createdIds.get(entityKey(relation.mappedNamespace, relation.mappedEntity));
    return ids ? [[field, ids] as const] : [];
  });
  return values => createdTargets.some(([field, ids]) => ids.has(values[field]));
};

/**
 * 在事务内给批内缺键的创建、改组的更新按类型、按目标组追加排序键（原地赋值）
 *
 * @param executor - 主适配器事务执行器；读尾键与随后的写入必须在它的同一个事务里
 *
 * @remarks
 * 同组里同批显式给的键排在自动键之前：自动键从库里尾键与这些显式键中较大的那个之后开始。
 * 分组外键指向本批新建的行时不读尾键（见 {@link knownEmptyGroups}）：随机造树一批上万行、几千个组，
 * 绝大多数组的父行就在本批里，逐组读尾键是这条路径的主要开销。
 */
export const appendBatchSortOrders = async (executor: TransactionExecutor, options: RxDBMutationsMap) => {
  const createdIds = createdIdsByEntity(options);
  for (const EntityType of manualOrderTypesOf(options)) {
    const rows = appendRowsOf(EntityType, options);
    if (rows.length === 0) continue;
    const metadata = getEntityMetadata(EntityType);
    const repository = executor.getRepository(EntityType);
    const reserved = reservedRowsOf(EntityType, options);
    await appendToGroupTails(repository, metadata, rows, reserved, knownEmptyGroups(metadata, createdIds));
  }
};
