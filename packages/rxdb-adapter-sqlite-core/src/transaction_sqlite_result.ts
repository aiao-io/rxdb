import {
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  EntityStaticType,
  EntityType,
  getEntityMetadata,
  getEntityStatus,
  getEntityStorageMetadata,
  RxDBChange
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from './sqlite-core.interface.js';
import {
  get_primary_key_column,
  getEntityObjectFromResult,
  ROWID,
  transformValueSqliteToJs
} from './sqlite-core.utils.js';

const decodeChangeResult = <T extends object>(adapter: RxDBAdapterSqliteBase, data: T): T => {
  const change = data as Record<string, unknown>;
  const namespace = change['namespace'];
  const entity = change['entity'];
  const metadata =
    typeof namespace === 'string' && typeof entity === 'string' ?
      adapter.rxdb.schemaManager.getEntityMetadata(entity, namespace)
    : undefined;
  if (!metadata && typeof namespace === 'string' && typeof entity === 'string') {
    console.warn(`Entity metadata not found for ${namespace}.${entity}`);
  }
  const decodePatch = (patch: unknown): Record<string, unknown> | null | undefined => {
    if (patch == null || !metadata) return patch as Record<string, unknown> | null | undefined;
    if (typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid RxDB change patch');
    const decoded = decodeRxDBChangePatch(
      metadata,
      patch as Readonly<Record<string, unknown>>,
      adapter.encryptionContext.resolveEntityMetadata
    );
    if (!decoded) return decoded;
    for (const [key, value] of Object.entries(decoded)) {
      const property = metadata.propertyMap.get(key);
      if (!property || property.encrypted === true) continue;
      decoded[key] = transformValueSqliteToJs(value, property);
    }
    return decoded;
  };
  return {
    ...change,
    entityId: decodeRxDBChangeEntityId(change['entityId']),
    inversePatch: decodePatch(change['inversePatch']),
    patch: decodePatch(change['patch'])
  } as T;
};

/**
 * 一次写入的提交记录：提交的字段值，以及提交时的编辑序号（`EntityStatus.writeMark`）。
 */
export interface SqliteWriteSubmission {
  readonly submitted: object;
  readonly mark: number;
}

/**
 * 本次写入的提交记录，按被写的实体索引（{@link transaction_sqlite_result} 的最后一个参数）。
 */
export type SqliteWriteSubmissions<T extends EntityType> = ReadonlyMap<InstanceType<T>, SqliteWriteSubmission>;

/** 结果行落到已缓存实体：写入回执按提交值收尾，外部数据避让未保存编辑，强制刷新整行覆盖 */
const settle_cached_entity = <T extends EntityType>(
  entity: InstanceType<T>,
  data: Partial<InstanceType<T>>,
  forcedUpdate: boolean,
  mergeExternalChanges: boolean,
  submissions: SqliteWriteSubmissions<T> | ((data: Partial<InstanceType<T>>) => void) | undefined
): void => {
  if (typeof submissions === 'function') return submissions(data);
  const state = getEntityStatus(entity);
  const submission = submissions?.get(entity);
  if (submission) return state.applyWriteResult(data, submission.submitted, submission.mark);
  if (mergeExternalChanges) return state.applyExternal(data);
  if (forcedUpdate) state.replace(data);
};

/**
 * 处理 SQLite 事务结果，返回实体数组
 * @param adapter
 * @param EntityType
 * @param sqliteSuccessResult
 * @param forcedUpdate
 * @param skipCreate 跳过创建新实体（仅更新已有缓存）
 * @param mergeExternalChanges 合并数据库数据，同时保留未保存字段
 * @param submissions 写回合并句柄或本次写入的提交记录（按被写的实体索引）：命中的已缓存实体按
 *   `EntityStatus.applyWriteResult` 收尾，以返回行推进基线并保留提交之后的新编辑
 * @returns
 */
export const transaction_sqlite_result = async <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  EntityType: T,
  sqliteSuccessResult: SqliteSuccessResult,
  forcedUpdate = false,
  skipCreate = false,
  mergeExternalChanges = false,
  submissions?: SqliteWriteSubmissions<T> | ((data: Partial<InstanceType<T>>) => void)
): Promise<InstanceType<T>[]> => {
  const result: InstanceType<T>[] = [];
  const metadata = getEntityStorageMetadata(adapter.rxdb, EntityType);
  const isRxDBChange = metadata === getEntityMetadata(RxDBChange);
  const em = adapter.rxdb.entityManager;
  // 结果集里的列名是物理列名，主键列可被 columnName 改写（SQLC-014）
  const primaryKeyColumn = get_primary_key_column(metadata);
  for (const { columns, rows } of sqliteSuccessResult.results) {
    const idIndex = columns.findIndex(c => c === primaryKeyColumn);
    const rowIdIndex = columns.findIndex(c => c === ROWID);
    if (idIndex === -1) continue;
    for (const row of rows) {
      const id = row[idIndex] as EntityStaticType<T, 'idType'>;
      let entity: InstanceType<T>;
      // 从缓存里拿保证每个 id 是唯一实体（用单次 getEntityRef 代替 has + get 两次 Map 查找）
      const cached = em.getEntityRef(EntityType, id) as InstanceType<T> | undefined;
      if (cached) {
        entity = cached;
        const rawEntityObjectData = await getEntityObjectFromResult<InstanceType<T>>(
          metadata,
          columns,
          row,
          adapter.encryptionContext
        );
        const entityObjectData = isRxDBChange ? decodeChangeResult(adapter, rawEntityObjectData) : rawEntityObjectData;

        // 始终更新计算属性（如 hasChildren），因为它们是从数据库动态计算的
        metadata.computedPropertyMap.forEach((prop, propName) => {
          if (!forcedUpdate && propName in entityObjectData) {
            entity[propName as keyof InstanceType<T>] = entityObjectData[propName];
          }
        });
        settle_cached_entity(entity, entityObjectData, forcedUpdate, mergeExternalChanges, submissions);
      } else if (!skipCreate) {
        const rawData = await getEntityObjectFromResult<InstanceType<T>>(
          metadata,
          columns,
          row,
          adapter.encryptionContext
        );
        const data = isRxDBChange ? decodeChangeResult(adapter, rawData) : rawData;
        // 同 `rxdb_adapter_mutations`：`EntityInstanceType<T>` 与本文件通用的 `InstanceType<T>`
        // 对具体 `T` 同解，泛型体内是两个延迟条件类型，这里桥接一次。
        entity = em.createEntityRef(EntityType, data) as InstanceType<T>;
      } else {
        continue;
      }
      result.push(entity);
      const state = getEntityStatus(entity);
      state.local = true;
      // 写入回执与外部合并都已按 patch 重算过 modified；只有整行覆盖才归零
      if (!mergeExternalChanges && typeof submissions !== 'function' && !submissions?.has(entity))
        state.modified = false;
      // 能在结果集里查到这一行，说明该 id 此刻在数据库中确实存在（未被删除）——
      // 无论是否 forcedUpdate 都要清除 removed，否则撤销删除 / 分支切换复活的行会因为
      // 命中缓存里那个仍标着 removed=true 的旧引用，永远显示"已删除"（RXD-011）
      state.removed = false;
      if (rowIdIndex !== -1) {
        const rowId = BigInt(row[rowIdIndex] as number);
        adapter.cacheRowIdEntity(rowId, entity);
      }
    }
  }
  return result;
};

/**
 * 更新实体缓存
 * 只更新已有的实体，委托给 transaction_sqlite_result
 * @param adapter
 * @param EntityType
 * @param sqliteSuccessResult
 */
export const update_entity_from_sqlite_result = async <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  EntityType: T,
  sqliteSuccessResult: SqliteSuccessResult
): Promise<void> => {
  await transaction_sqlite_result(adapter, EntityType, sqliteSuccessResult, true, true);
};

/**
 * 从缓存中移除已删除实体（按 id），并将其状态标记为 removed
 * @param adapter
 * @param EntityType
 * @param ids
 */
export const remove_entity_ids_from_cache = <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  EntityType: T,
  ids: EntityStaticType<T, 'idType'>[]
) => {
  // 从缓存里拿保证每个 id 是唯一实体
  const em = adapter.rxdb.entityManager;
  ids.forEach(id => {
    const entity = em.getEntityRef(EntityType, id);
    if (!entity) return;
    const state = getEntityStatus(entity);
    state.local = false;
    state.removed = true;
    state.modified = false;
    // #row_id_map 是强引用，不回收就让已删实体永远驻留；且 SQLite 会复用 rowid，
    // 陈旧映射会让新行按 rowid 查到旧实体。撤销删除时 transaction_sqlite_result
    // 会按新结果重新 cacheRowIdEntity，所以回收是安全的（SQLC-033）
    adapter.removeCacheEntity(entity);
  });
};
