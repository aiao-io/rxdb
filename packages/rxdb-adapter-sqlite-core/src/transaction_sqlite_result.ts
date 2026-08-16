import {
  decodeRxDBChangeEntityId,
  decodeRxDBChangePatch,
  EntityStaticType,
  EntityType,
  getEntityMetadata,
  getEntityStatus,
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

const decodeForeignKeyValues = <T extends object>(
  adapter: RxDBAdapterSqliteBase,
  metadata: ReturnType<typeof getEntityMetadata>,
  data: T
): T => {
  const entityData = data as Record<string, unknown>;
  for (const relation of metadata.foreignKeyRelations) {
    const propertyName = `${relation.name}Id`;
    if (!(propertyName in entityData)) continue;
    const mappedMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
      relation.mappedEntity,
      relation.mappedNamespace ?? metadata.namespace
    );
    const idProperty = mappedMetadata?.propertyMap.get('id');
    if (idProperty) entityData[propertyName] = transformValueSqliteToJs(entityData[propertyName], idProperty);
  }
  return data;
};

/**
 * 处理 SQLite 事务结果，返回实体数组
 * @param adapter
 * @param EntityType
 * @param sqliteSuccessResult
 * @param forcedUpdate
 * @param skipCreate 跳过创建新实体（仅更新已有缓存）
 * @param mergeExternalChanges 合并数据库数据，同时保留未保存字段
 * @returns
 */
export const transaction_sqlite_result = async <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  EntityType: T,
  sqliteSuccessResult: SqliteSuccessResult,
  forcedUpdate = false,
  skipCreate = false,
  mergeExternalChanges = false
): Promise<InstanceType<T>[]> => {
  const result: InstanceType<T>[] = [];
  const metadata = getEntityMetadata(EntityType);
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
        const decodedEntityObjectData = decodeForeignKeyValues(adapter, metadata, rawEntityObjectData);
        const entityObjectData =
          isRxDBChange ? decodeChangeResult(adapter, decodedEntityObjectData) : decodedEntityObjectData;

        // 始终更新计算属性（如 hasChildren），因为它们是从数据库动态计算的
        metadata.computedPropertyMap.forEach((prop, propName) => {
          if (propName in entityObjectData) {
            entity[propName as keyof InstanceType<T>] = entityObjectData[propName];
          }
        });
        if (mergeExternalChanges) {
          const state = getEntityStatus(entity);
          if (state.modified) {
            state.mergeExternal(entityObjectData);
          } else {
            state.replace(entityObjectData);
          }
        } else if (forcedUpdate) {
          const state = getEntityStatus(entity);
          state.origin = structuredClone(entityObjectData);
          Object.assign(entity, entityObjectData);
        }
      } else if (!skipCreate) {
        const rawData = await getEntityObjectFromResult<InstanceType<T>>(
          metadata,
          columns,
          row,
          adapter.encryptionContext
        );
        const decodedData = decodeForeignKeyValues(adapter, metadata, rawData);
        const data = isRxDBChange ? decodeChangeResult(adapter, decodedData) : decodedData;
        entity = em.createEntityRef(EntityType, data);
      } else {
        continue;
      }
      result.push(entity);
      const state = getEntityStatus(entity);
      state.local = true;
      if (!mergeExternalChanges) state.modified = false;
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
