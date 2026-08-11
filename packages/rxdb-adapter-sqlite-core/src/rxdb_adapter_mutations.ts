import { EntityStaticType, EntityType, getEntityMetadata, getEntityStatus, RxDBMutationsMap } from '@aiao/rxdb';
import { generate_entity_deletes_sql } from './entity/deletes_sql.js';
import { generate_entity_inserts_sql, get_insert_column_count } from './entity/inserts_sql.js';
import { update_sql as generate_entity_update_sql } from './entity/update_sql.js';
import { generate_sql } from './query/query_sql.js';
import { MAIN_TABLE_ALIAS } from './query/query_sql.utils.js';
import { SqliteRepository } from './repository/SqliteRepository.js';
import type { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';
import {
  chunkBySqliteBindLimit,
  get_primary_key_column,
  get_table_name_by_metadata,
  getEntityObjectFromResult,
  getMonotonicUpdatedAt,
  quote_sql_identifier,
  ROWID
} from './sqlite-core.utils.js';

/**
 * 批量修改实体（创建/更新/删除）
 */
export const rxdb_adapter_mutations = async <T extends EntityType = EntityType>(
  adapter: RxDBAdapterSqliteBase,
  mutations: RxDBMutationsMap<T>
): Promise<InstanceType<T>[]> => {
  const entity_instance_map = new Map<T, Map<EntityStaticType<T, 'idType'>, InstanceType<T>>>();
  const now = new Date();
  const em = adapter.rxdb.entityManager;
  const all_entities = new Set<InstanceType<T>>();

  const remember_entity_instance = (entityType: T, entity: InstanceType<T>) => {
    let inner = entity_instance_map.get(entityType);
    if (!inner) {
      inner = new Map();
      entity_instance_map.set(entityType, inner);
    }
    inner.set(entity.id, entity);
  };

  const sync_entities_by_ids = async (
    entityType: T,
    metadata: ReturnType<typeof getEntityMetadata>,
    ids: EntityStaticType<T, 'idType'>[]
  ) => {
    for (const idsChunk of chunkBySqliteBindLimit(ids)) {
      const params = [...idsChunk];
      const sql = generate_sql({
        tableName: get_table_name_by_metadata(metadata),
        where: `${MAIN_TABLE_ALIAS}.${quote_sql_identifier(get_primary_key_column(metadata))} in (${params
          .map(() => '?')
          .join(',')})`,
        metadata
      });
      const sqliteSuccessResult = await adapter.query(sql, params);
      await sync_entities_from_result(entityType, sqliteSuccessResult);
    }
  };

  const sync_entities_from_result = async (
    entityType: T,
    sqliteSuccessResult: Awaited<ReturnType<typeof adapter.query>>
  ) => {
    const metadata = getEntityMetadata(entityType);
    const repository = adapter.getRepository<T, SqliteRepository<T>>(entityType);

    // 结果集里的列名是物理列名，主键列可被 columnName 改写（SQLC-014）
    const primaryKeyColumn = get_primary_key_column(metadata);

    for (const { columns, rows } of sqliteSuccessResult.results) {
      const idIndex = columns.findIndex(c => c === primaryKeyColumn);
      const rowIdIndex = columns.findIndex(c => c === ROWID);
      if (idIndex === -1) continue;

      for (const row of rows) {
        const id = row[idIndex] as EntityStaticType<T, 'idType'>;
        const entityObjectData = await getEntityObjectFromResult<InstanceType<T>>(
          metadata,
          columns,
          row,
          adapter.encryptionContext
        );
        const entityInstance = entity_instance_map.get(entityType)?.get(id);

        // 单次 getEntityRef 同时完成存在性检查与实体获取
        const existing = em.getEntityRef(entityType, id) as InstanceType<T> | undefined;
        let entity: InstanceType<T> | undefined = existing ?? entityInstance;
        if (!entity) {
          entity = em.createEntityRef(entityType, entityObjectData);
        } else if (!existing) {
          em.addEntityCache(entity);
        }

        const targetEntity = entity!;
        repository.updateEntity(targetEntity, entityObjectData);

        const state = getEntityStatus(targetEntity);
        state.local = true;
        state.modified = false;

        if (rowIdIndex !== -1) {
          const rowId = BigInt(row[rowIdIndex] as number);
          adapter.cacheRowIdEntity(rowId, targetEntity);
        }
      }
    }
  };

  // 创建 SQL
  for (const [EntityType, entities_set] of mutations.create.entries()) {
    const entities = Array.from(entities_set);
    for (const entity of entities) {
      all_entities.add(entity);
      remember_entity_instance(EntityType, entity);
    }
    const meta = getEntityMetadata(EntityType);

    for (const entitiesChunk of chunkBySqliteBindLimit(entities, get_insert_column_count(meta))) {
      const insert_result = await generate_entity_inserts_sql(
        meta,
        entitiesChunk,
        adapter.rxdb.context,
        adapter.encryptionContext
      );
      await adapter.query(insert_result.sql, insert_result.params);
    }

    await sync_entities_by_ids(
      EntityType,
      meta,
      entities.map(entity => entity.id)
    );
  }

  // 更新 SQL
  for (const [EntityType, entities_set] of mutations.update.entries()) {
    const entities = Array.from(entities_set);
    for (const entity of entities) {
      all_entities.add(entity);
      remember_entity_instance(EntityType, entity);
    }
    const meta = getEntityMetadata(EntityType);

    for (const entity of entities) {
      const patch = getEntityStatus(entity).patch;
      if (patch === null || Object.keys(patch).length === 0) continue;

      const updateResult = await generate_entity_update_sql(meta, entity, patch, {
        ...adapter.rxdb.context,
        encryption: adapter.encryptionContext,
        returning: false,
        updatedAt: getMonotonicUpdatedAt(entity, now)
      });
      await adapter.query(updateResult.sql, updateResult.params);
    }

    await sync_entities_by_ids(
      EntityType,
      meta,
      entities.map(entity => entity.id)
    );
  }

  // 删除 SQL
  for (const [EntityType, entities_set] of mutations.remove.entries()) {
    const entities = Array.from(entities_set);
    for (const entity of entities) all_entities.add(entity);
    const meta = getEntityMetadata(EntityType);
    if (entities.length > 0) {
      const delete_sql = generate_entity_deletes_sql(meta, entities);
      await adapter.query(delete_sql);
    }
  }

  // 更新 remove 实体状态（上面已加入 all_entities，这里只需同步状态）
  mutations.remove.forEach(entities =>
    entities.forEach(entity => {
      const status = getEntityStatus(entity);
      status.origin = structuredClone({ ...entity });
      status.modified = false;
      status.removed = true;
      status.local = false; // 标记为已从数据库删除
      // 同 transaction_sqlite_result 的 remove_entity_ids_from_cache：
      // rowid 强引用必须随删除回收，否则长生命周期增删场景内存单调增长（SQLC-033）
      adapter.removeCacheEntity(entity);
    })
  );

  return Array.from(all_entities);
};
