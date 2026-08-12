import type { EntityData, EntityMetadata, RxDBEntityId, SwitchVersionActions } from '@aiao/rxdb';
import { parseRxDBChangeKey } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { generate_entity_insert_sql } from '../entity/insert_sql.js';
import { update_sql } from '../entity/update_sql.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../sqlite-core.interface.js';
import {
  chunkBySqliteBindLimit,
  get_primary_key_column,
  get_table_name_by_metadata,
  getSwitchUpdatedAt,
  quote_sql_identifier,
  ROWID,
  transformValueSqliteToJs
} from '../sqlite-core.utils.js';
import { unenvelopePlaintextPatches } from '../system/encrypt-patch.js';

const decryptEntityDataForApply = async (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  entityData: EntityData
): Promise<EntityData> => {
  const encMap = metadata.encryptedPropertyMap;
  if (!encMap || encMap.size === 0) return entityData;
  const { keyring } = adapter.encryptionContext;
  if (!keyring) return entityData;
  const { id, ...rest } = entityData;
  const plain = await unenvelopePlaintextPatches({
    entity: metadata,
    primaryKeyString: id as RxDBEntityId,
    patch: rest,
    keyring
  });
  return { ...plain, id };
};

/**
 * 一条待执行的 SQL 语句及其绑定参数。
 */
export interface SqliteStatement {
  sql: string;
  params: SQLiteCompatibleType[];
}

/**
 * 版本切换过程中一条变更的 patch 与 inversePatch。
 */
export interface SwitchVersionChangeData {
  patch: Record<string, unknown> | null;
  inversePatch: Record<string, unknown> | null;
}

/**
 * 版本切换中某一类操作（删除/插入/更新）的 SQL 集合及其变更记录。
 */
export interface SwitchVersionSqlItem {
  metadata: EntityMetadata;
  ids: Set<RxDBEntityId>;
  statements: SqliteStatement[];
  selectStatements?: SqliteStatement[];
  successResults?: SqliteSuccessResult;
  changes: Map<RxDBEntityId, SwitchVersionChangeData>;
}

/**
 * 版本切换生成的完整 SQL 结果：按删除/插入/更新三类分组。
 */
export interface SwitchVersionSqlResult {
  deletes: SwitchVersionSqlItem[];
  inserts: SwitchVersionSqlItem[];
  updates: SwitchVersionSqlItem[];
}

type ChangesMap = Map<RxDBEntityId, SwitchVersionChangeData>;

const ensureChangesMap = (outer: Map<string, ChangesMap>, key: string): ChangesMap => {
  let changes = outer.get(key);
  if (!changes) {
    changes = new Map();
    outer.set(key, changes);
  }
  return changes;
};

const copyChangeData = (value: object | null): Record<string, unknown> | null => (value === null ? null : { ...value });

const toSqliteStatement = (statement: { sql: string; params?: SQLiteCompatibleType[] }): SqliteStatement => ({
  sql: statement.sql,
  params: statement.params ?? []
});

const placeholders = (count: number): string => Array.from({ length: count }, () => '?').join(',');

const buildSelectStatements = (metadata: EntityMetadata, ids: Set<RxDBEntityId>): SqliteStatement[] | undefined => {
  const tableName = quote_sql_identifier(get_table_name_by_metadata(metadata));
  const statements = chunkBySqliteBindLimit(Array.from(ids)).map(params => ({
    sql: `SELECT _.rowid as ${quote_sql_identifier(ROWID)}, _.* FROM ${tableName} _ WHERE _.${quote_sql_identifier(get_primary_key_column(metadata))} in (${placeholders(params.length)});`,
    params
  }));
  return statements.length === 0 ? undefined : statements;
};

const getMetadata = (adapter: RxDBAdapterSqliteBase, key: string): EntityMetadata => {
  const [namespace, entityName] = key.split(':');
  const metadata = adapter.rxdb.schemaManager.getEntityMetadata(entityName, namespace);
  if (!metadata) {
    throw new Error(`找不到 namespace=${namespace} entityName=${entityName} 对应的实体元数据`);
  }
  return metadata;
};

export const convertSwitchResultToSql = async (
  adapter: RxDBAdapterSqliteBase,
  actions: SwitchVersionActions
): Promise<SwitchVersionSqlResult> => {
  const result: SwitchVersionSqlResult = { deletes: [], inserts: [], updates: [] };

  const deleteIdsByEntity = new Map<string, Set<RxDBEntityId>>();
  const deleteChangesByEntity = new Map<string, ChangesMap>();
  for (const [entityKey, switchChange] of actions.deletes) {
    const [namespace, entityName, entityId] = parseRxDBChangeKey(entityKey);
    const key = `${namespace}:${entityName}`;
    const ids = deleteIdsByEntity.get(key);
    if (ids) ids.add(entityId);
    else deleteIdsByEntity.set(key, new Set([entityId]));
    ensureChangesMap(deleteChangesByEntity, key).set(entityId, {
      patch: copyChangeData(switchChange.patch),
      inversePatch: copyChangeData(switchChange.inversePatch)
    });
  }

  for (const [key, ids] of deleteIdsByEntity) {
    const metadata = getMetadata(adapter, key);
    const tableName = quote_sql_identifier(get_table_name_by_metadata(metadata));
    const statements = chunkBySqliteBindLimit(Array.from(ids)).map(params => ({
      sql: `DELETE FROM ${tableName} WHERE ${quote_sql_identifier(get_primary_key_column(metadata))} in (${placeholders(params.length)});`,
      params
    }));
    result.deletes.push({
      metadata,
      ids,
      statements,
      changes: deleteChangesByEntity.get(key)!
    });
  }

  const insertDataByEntity = new Map<string, EntityData[]>();
  const insertChangesByEntity = new Map<string, ChangesMap>();
  for (const [entityKey, switchChange] of actions.inserts) {
    const [namespace, entityName, entityId] = parseRxDBChangeKey(entityKey);
    const key = `${namespace}:${entityName}`;
    const entityData = { ...switchChange.patch, id: entityId };
    const entities = insertDataByEntity.get(key);
    if (entities) entities.push(entityData);
    else insertDataByEntity.set(key, [entityData]);
    ensureChangesMap(insertChangesByEntity, key).set(entityId, {
      patch: copyChangeData(switchChange.patch),
      inversePatch: copyChangeData(switchChange.inversePatch)
    });
  }

  for (const [key, rawEntities] of insertDataByEntity) {
    const metadata = getMetadata(adapter, key);
    const statements: SqliteStatement[] = [];
    for (const rawEntity of rawEntities) {
      const entityData = await decryptEntityDataForApply(adapter, metadata, rawEntity);
      for (const [propertyName, property] of metadata.propertyMap) {
        if (entityData[propertyName] === undefined && property.default !== undefined) {
          entityData[propertyName] = typeof property.default === 'function' ? property.default() : property.default;
        }
      }
      const statement = await generate_entity_insert_sql(metadata, entityData, {
        useReplace: true,
        encryption: adapter.encryptionContext
      });
      statements.push(toSqliteStatement(statement));
    }
    const ids = new Set(rawEntities.map(entity => entity['id'] as RxDBEntityId));
    const selectStatements = buildSelectStatements(metadata, ids);
    result.inserts.push({
      metadata,
      ids,
      statements,
      selectStatements,
      changes: insertChangesByEntity.get(key)!
    });
  }

  const updateDataByEntity = new Map<string, EntityData[]>();
  const updateChangesByEntity = new Map<string, ChangesMap>();
  for (const [entityKey, switchChange] of actions.updates) {
    const [namespace, entityName, entityId] = parseRxDBChangeKey(entityKey);
    const key = `${namespace}:${entityName}`;
    const entityData = { ...switchChange.patch, id: entityId };
    const entities = updateDataByEntity.get(key);
    if (entities) entities.push(entityData);
    else updateDataByEntity.set(key, [entityData]);

    const metadata = adapter.rxdb.schemaManager.getEntityMetadata(entityName, namespace);
    const patch = copyChangeData(switchChange.patch);
    const inversePatch = copyChangeData(switchChange.inversePatch);
    if (metadata) {
      for (const changeData of [patch, inversePatch]) {
        if (!changeData) continue;
        for (const propertyName of Object.keys(changeData)) {
          const property = metadata.propertyMap.get(propertyName);
          if (property && property.encrypted !== true) {
            changeData[propertyName] = transformValueSqliteToJs(
              changeData[propertyName] as SQLiteCompatibleType,
              property
            );
          }
        }
      }
    }
    ensureChangesMap(updateChangesByEntity, key).set(entityId, { patch, inversePatch });
  }

  for (const [key, rawEntities] of updateDataByEntity) {
    const metadata = getMetadata(adapter, key);
    const changes = updateChangesByEntity.get(key)!;
    const statements: SqliteStatement[] = [];
    for (const rawEntity of rawEntities) {
      const entityData = await decryptEntityDataForApply(adapter, metadata, rawEntity);
      const { id, ...patch } = entityData;
      // 目标状态的 updatedAt（patch）与被替换状态的 updatedAt（inversePatch）都只是水位输入，
      // 真正写下去的是「此刻」——undo/redo 是新的写入，详见 getSwitchUpdatedAt。
      const inversePatch = changes.get(id as RxDBEntityId)?.inversePatch;
      const updatedAt =
        metadata.propertyMap.has('updatedAt') ?
          getSwitchUpdatedAt([entityData['updatedAt'], inversePatch?.['updatedAt']])
        : undefined;
      statements.push(
        toSqliteStatement(
          await update_sql(metadata, { id }, patch, {
            ...adapter.rxdb.context,
            encryption: adapter.encryptionContext,
            updatedAt
          })
        )
      );
    }
    const ids = new Set(rawEntities.map(entity => entity['id'] as RxDBEntityId));
    const selectStatements = buildSelectStatements(metadata, ids);
    result.updates.push({
      metadata,
      ids,
      statements,
      selectStatements,
      changes: updateChangesByEntity.get(key)!
    });
  }

  return result;
};
