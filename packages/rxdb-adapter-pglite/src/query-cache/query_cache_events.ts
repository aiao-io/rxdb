/**
 * @fileoverview QueryCache 写入之后补的缓存刷新与实体事件（US-314 B2.1）。
 *
 * @remarks
 * QueryCache 抄的是远端副本，不是本地变更：`upsertMany` / `deleteByIds` 写的时候摘掉主表集的触发器，回填不进
 * `rxdb_change`，否则出站队列把它当离线写推回远端。但变更行同时也是活查询**唯一**的通知来源
 * （触发器 → `rxdb_change` → NOTIFY → `handle_rxdb_change` → 实体事件 → `QueryManager` 增量合并），
 * 摘掉触发器就得在这里补回来：同事务里读写入前后的行，提交之后刷新实体缓存里已有的实例、派发实体事件。
 * 与 sqlite-core 的 `query-cache-events.ts` 同口径。
 */

import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  type EntityStaticType,
  type EntityType,
  type RxDBEntityLocalCreatedEventData,
  type RxDBEntityLocalRemovedEventData,
  type RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import { getEntityObjectFromResult, quoteIdentifier } from '../pglite.utils.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import type { PGliteTransactionExecutor } from '../transaction/PGliteTransactionExecutor.js';
import {
  remove_entity_ids_from_cache,
  transaction_pglite_result,
  type PGliteExecuteResult
} from '../transaction_pglite_result.js';
import type { QueryCacheTarget } from './query_cache_target.js';

type EntityRow = Record<string, unknown>;
type EntityId = EntityStaticType<EntityType, 'idType'>;
type EntityPatch = Readonly<Partial<InstanceType<EntityType>>>;
type EntityFull = Readonly<InstanceType<EntityType>>;

/** 读回的一行：原样的物理列形态，加上按元数据解码的快照（日期是 `Date`，加密列是明文） */
interface DecodedRow {
  readonly row: EntityRow;
  readonly image: EntityRow & { id: EntityId };
}

/**
 * 远端行的主键值，口径与 sqlite-core 的 `readQueryCacheRowId` 相同：行可以按 JS 属性名或物理列名给键。
 *
 * @param row - 远端行
 * @param target - 已解析的物理定位
 * @returns 主键值的字符串形态，供 `= ANY($1)` 查询
 */
export const queryCacheRowId = (row: object, target: QueryCacheTarget): string => {
  const record = row as EntityRow;
  return String(record['id'] ?? record[target.idColumn]);
};

/**
 * 在**当前事务**里读回这批 id 此刻在表里的行。
 *
 * @param executor - 写入那笔事务的执行器；读在写之前与之后各一次，都必须与写同事务
 * @param target - 已解析的物理定位
 * @param ids - 主键值
 * @returns 原样的行（物理列形态），不在表里的 id 没有行
 */
export const readQueryCacheRows = async (
  executor: PGliteTransactionExecutor,
  target: QueryCacheTarget,
  ids: readonly string[]
): Promise<PGliteExecuteResult> => {
  const result = await executor.queryRaw<EntityRow>(
    `SELECT * FROM ${target.tableName} WHERE ${quoteIdentifier(target.idColumn)} = ANY($1)`,
    [ids]
  );
  return { rows: result.rows, rowsAffected: result.affectedRows ?? 0, elapsed: 0 };
};

const decode = async (
  adapter: RxDBAdapterPGlite,
  target: QueryCacheTarget,
  rows: readonly EntityRow[]
): Promise<DecodedRow[]> =>
  Promise.all(
    rows.map(async row => ({
      row,
      image: (await getEntityObjectFromResult(target.metadata, row, adapter.encryptionContext)) as DecodedRow['image']
    }))
  );

const entityTypeOf = (adapter: RxDBAdapterPGlite, target: QueryCacheTarget): EntityType | undefined =>
  adapter.rxdb.schemaManager.getEntityType(target.metadata.name, target.metadata.namespace);

/**
 * 回填提交之后：把实体缓存里已有的实例刷成新值，再派发 INSERT / UPDATE 事件。
 *
 * @param adapter - 适配器（事件总线与实体缓存的主人）
 * @param target - 已解析的物理定位
 * @param before - 写入之前读回的行：区分新增与更新，并给更新配 `inversePatch`
 * @param after - 写入之后读回的行，用作 `patch`
 *
 * @remarks
 * 先刷实例再发事件：事件的消费方（`QueryManager`）顺着 id 去取实体，顺序反过来取到的是没刷新的旧实例。
 * 只刷**已在缓存里**的：没进过缓存的行下次查询时按新数据建实例，这里替它建只会白占缓存。
 * `patch` 用落地后回读、解码过的行，不拿远端原样的 JSON 顶：命中缓存时 `createEntityRef` 走 `Object.assign`，
 * 一次类型转换都不做，日期会从 `Date` 变成字符串。
 */
export const settleQueryCacheUpsert = async (
  adapter: RxDBAdapterPGlite,
  target: QueryCacheTarget,
  before: PGliteExecuteResult,
  after: PGliteExecuteResult
): Promise<void> => {
  const written = await decode(adapter, target, after.rows);
  const EntityType = entityTypeOf(adapter, target);
  if (EntityType) {
    const cachedRows = written
      .filter(({ image }) => adapter.rxdb.entityManager.hasEntityRef(EntityType, image.id))
      .map(({ row }) => row);
    if (cachedRows.length > 0)
      await transaction_pglite_result(adapter, EntityType, { ...after, rows: cachedRows }, true);
  }

  const previous = new Map((await decode(adapter, target, before.rows)).map(({ image }) => [String(image.id), image]));
  const created: RxDBEntityLocalCreatedEventData[] = [];
  const updated: RxDBEntityLocalUpdatedEventData[] = [];
  for (const { image } of written) {
    const base = {
      namespace: target.metadata.namespace,
      entity: target.metadata.name,
      id: image.id,
      recordAt: new Date()
    };
    const inverse = previous.get(String(image.id));
    if (inverse) {
      updated.push({ ...base, type: 'UPDATE', patch: image as EntityPatch, inversePatch: inverse as EntityPatch });
    } else {
      created.push({ ...base, type: 'INSERT', patch: image as unknown as EntityFull, inversePatch: null });
    }
  }
  if (created.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(created));
  if (updated.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(updated));
};

/**
 * 删除提交之后：把实体缓存里的实例标成已删，再为**确实存在过**的行派发 DELETE 事件。
 *
 * @param adapter - 适配器
 * @param target - 已解析的物理定位
 * @param before - 删除之前读回的行
 *
 * @remarks
 * 表里本来就没有的 id 删不掉任何行，凭空发 DELETE 会让活查询为没发生的事重算。`inversePatch` 必须是删除前的整行：
 * 带条件的查询拿它比 `where`，空对象会把所有查询判成「与我无关」，行删了列表却不动。
 */
export const settleQueryCacheRemove = async (
  adapter: RxDBAdapterPGlite,
  target: QueryCacheTarget,
  before: PGliteExecuteResult
): Promise<void> => {
  const deleted = await decode(adapter, target, before.rows);
  const EntityType = entityTypeOf(adapter, target);
  if (EntityType) {
    remove_entity_ids_from_cache(
      adapter,
      EntityType,
      deleted.map(({ image }) => image.id)
    );
  }

  const removed: RxDBEntityLocalRemovedEventData[] = deleted.map(({ image }) => ({
    namespace: target.metadata.namespace,
    entity: target.metadata.name,
    type: 'DELETE',
    id: image.id,
    patch: null,
    inversePatch: image as EntityPatch,
    recordAt: new Date()
  }));
  if (removed.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(removed));
};
