import {
  EntityData,
  EntityMetadata,
  parseRxDBChangeKey,
  PropertyType,
  RxDBEntityId,
  SwitchVersionActions
} from '@aiao/rxdb';

import insert_sql from '../entity/insert_sql.js';
import update_sql from '../entity/update_sql.js';
import {
  getSqlWithParams,
  getSwitchUpdatedAt,
  getTableNameByMetadata,
  transformValuePGliteToJs
} from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { unenvelopePlaintextPatches } from '../system/encrypt-patch.js';
import { SwitchVersionSqlResult } from './switch-result.interface.js';

/**
 * FR-006 undo/redo 应用桥接：历史行对加密列存的是信封字符串，
 * 写入钩子会再次加密。先解回明文，让正常加密路径只跑一次。
 */
const decryptEntityDataForApply = async (
  adapter: RxDBAdapterPGlite,
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
    patch: rest as Record<string, unknown>,
    keyring
  });
  return { ...plain, id } as EntityData;
};

/**
 * 将 SwitchVersionActions 转换为 PostgreSQL SQL 语句
 *
 * @param adapter - PGlite 适配器实例
 * @param actions - 版本切换操作
 * @returns SQL 操作结果，按删除/插入/更新分组
 */
type EntityId = RxDBEntityId;
type ChangePatches = { patch: EntityData | null; inversePatch: EntityData | null };
type VersionEntityType = new (...args: never[]) => EntityData & { id: EntityId };

const isEntityId = (value: unknown): value is EntityId =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint';

const requireMetadata = (adapter: RxDBAdapterPGlite, namespace: string, entityName: string): EntityMetadata => {
  const metadata = adapter.rxdb.schemaManager.getEntityMetadata(entityName, namespace);
  if (!metadata) throw new TypeError(`Missing entity metadata for ${namespace}.${entityName}`);
  return metadata;
};

const normalizeLegacyEntityId = (metadata: EntityMetadata, entityId: RxDBEntityId): RxDBEntityId => {
  if (typeof entityId !== 'string') return entityId;
  const idProperty = metadata.propertyMap.get('id');
  if (!idProperty) throw new TypeError(`Missing id metadata for ${metadata.namespace}.${metadata.name}`);
  if (idProperty.type === PropertyType.bigint) return BigInt(entityId);
  if (idProperty.type === PropertyType.integer) {
    const value = Number(entityId);
    if (Number.isInteger(value)) return value;
    throw new TypeError(`Invalid integer id for ${metadata.namespace}.${metadata.name}: ${entityId}`);
  }
  if (idProperty.type === PropertyType.number) {
    const value = Number(entityId);
    if (Number.isFinite(value)) return value;
    throw new TypeError(`Invalid numeric id for ${metadata.namespace}.${metadata.name}: ${entityId}`);
  }
  if (idProperty.type === PropertyType.string || idProperty.type === PropertyType.uuid) return entityId;
  throw new TypeError(`Unsupported id type for ${metadata.namespace}.${metadata.name}: ${idProperty.type}`);
};

const parseSwitchEntity = (adapter: RxDBAdapterPGlite, entityKey: string) => {
  const [namespace, entityName, entityId] = parseRxDBChangeKey(entityKey);
  if (!namespace || !entityName || entityId === '') {
    throw new TypeError(`Invalid switch entity key: ${entityKey}`);
  }
  const metadata = requireMetadata(adapter, namespace, entityName);
  return {
    entityKey: `${namespace}:${entityName}`,
    entityId: normalizeLegacyEntityId(metadata, entityId),
    metadata
  };
};

const getGroupedMetadata = (adapter: RxDBAdapterPGlite, entityKey: string): EntityMetadata => {
  const separator = entityKey.indexOf(':');
  if (separator < 1 || separator === entityKey.length - 1) throw new TypeError(`Invalid entity key: ${entityKey}`);
  return requireMetadata(adapter, entityKey.slice(0, separator), entityKey.slice(separator + 1));
};

const transformPatch = (patch: object | null, metadata: EntityMetadata): EntityData | null => {
  if (!patch) return null;
  const result: EntityData = { ...patch };
  for (const key of Object.keys(result)) {
    const property = metadata.propertyMap.get(key);
    if (property && property.encrypted !== true) {
      result[key] = transformValuePGliteToJs(result[key], property);
    }
  }
  return result;
};

export const convertSwitchResultToSql = async (
  adapter: RxDBAdapterPGlite,
  actions: SwitchVersionActions
): Promise<SwitchVersionSqlResult> => {
  const { deletes, inserts, updates } = actions;
  const result: SwitchVersionSqlResult = { deletes: [], inserts: [], updates: [] };

  /*
   * 处理删除操作
   */
  const needDeleteEntitiesMap = new Map<string, Set<EntityId>>();
  const deleteChangesMap = new Map<string, Map<EntityId, ChangePatches>>();

  for (const [entityKey, switchChange] of deletes.entries()) {
    const { entityKey: key, entityId, metadata } = parseSwitchEntity(adapter, entityKey);
    const set = needDeleteEntitiesMap.get(key);
    if (set) {
      set.add(entityId);
    } else {
      needDeleteEntitiesMap.set(key, new Set([entityId]));
    }

    // 存储 change 数据用于事件发送
    let changesMap = deleteChangesMap.get(key);
    if (!changesMap) {
      changesMap = new Map();
      deleteChangesMap.set(key, changesMap);
    }
    changesMap.set(entityId, {
      patch: transformPatch(switchChange.patch, metadata),
      inversePatch: transformPatch(switchChange.inversePatch, metadata)
    });
  }

  for (const [key, idSet] of needDeleteEntitiesMap) {
    const metadata = getGroupedMetadata(adapter, key);
    const tableName = getTableNameByMetadata(metadata);
    const idType = metadata.propertyMap.get('id')?.type;

    // PostgreSQL 使用 = ANY($1) 语法，支持参数化数组
    const ids = Array.from(idSet);
    const deleteSql =
      idType === PropertyType.integer ? `DELETE FROM ${tableName} WHERE id = ANY($1::integer[]) RETURNING *;`
      : idType === PropertyType.bigint ? `DELETE FROM ${tableName} WHERE id = ANY($1::bigint[]) RETURNING *;`
      : `DELETE FROM ${tableName} WHERE id = ANY($1) RETURNING *;`;

    result.deletes.push({
      metadata,
      ids: idSet,
      sql: deleteSql,
      params: [ids],
      changes: deleteChangesMap.get(key)!
    });
  }

  /*
   * 处理插入操作
   */
  const needInsertEntitiesMap = new Map<string, EntityData[]>();
  const insertChangesMap = new Map<string, Map<EntityId, ChangePatches>>();

  for (const [entityKey, switchChange] of inserts.entries()) {
    const { entityKey: key, entityId, metadata } = parseSwitchEntity(adapter, entityKey);
    const set = needInsertEntitiesMap.get(key);
    const entityData = { ...switchChange.patch, id: entityId };
    if (set) {
      set.push(entityData);
    } else {
      needInsertEntitiesMap.set(key, [entityData]);
    }

    // 存储 change 数据用于事件发送
    let changesMap = insertChangesMap.get(key);
    if (!changesMap) {
      changesMap = new Map();
      insertChangesMap.set(key, changesMap);
    }
    changesMap.set(entityId, {
      patch: transformPatch(switchChange.patch, metadata),
      inversePatch: transformPatch(switchChange.inversePatch, metadata)
    });
  }

  for (const [key, entityDataArray] of needInsertEntitiesMap) {
    const metadata = getGroupedMetadata(adapter, key);

    // PostgreSQL 使用 INSERT ... ON CONFLICT DO UPDATE 替代 INSERT OR REPLACE
    // 为了批量处理，合并所有 INSERT 语句，用 ---STATEMENT_SEPARATOR--- 分隔
    const sqlStatements: string[] = [];
    for (const entityDataRaw of entityDataArray) {
      // FR-006：写入钩子会再次加密，这里先把历史行里的信封字符串解回明文。
      const entityData = await decryptEntityDataForApply(adapter, metadata, entityDataRaw);
      // 为缺失的必需字段添加默认值
      for (const [propertyName, property] of metadata.propertyMap) {
        if (entityData[propertyName] === undefined && property.default !== undefined) {
          if (typeof property.default === 'function') {
            entityData[propertyName] = property.default();
          } else {
            entityData[propertyName] = property.default;
          }
        }
      }
      const {
        columns: insertedColumns,
        sql: insertSql,
        params: insertParams
      } = await insert_sql(metadata, entityData, {
        returning: false,
        encryption: adapter.encryptionContext
      });
      const upsertSql = `${insertSql.slice(0, -1)}${generateOnConflictClause(metadata, insertedColumns)} RETURNING *;`;
      sqlStatements.push(getSqlWithParams(upsertSql, insertParams));
    }
    const combinedSql = sqlStatements.join('---STATEMENT_SEPARATOR---');

    result.inserts.push({
      metadata,
      ids: new Set(entityDataArray.map(data => data['id']).filter(isEntityId)),
      sql: combinedSql,
      params: [], // 已经内联到 SQL 中
      changes: insertChangesMap.get(key)!
    });
  }

  /*
   * 处理更新操作
   */
  const needUpdateEntitiesMap = new Map<string, EntityData[]>();
  const updateChangesMap = new Map<string, Map<EntityId, ChangePatches>>();

  for (const [entityKey, switchChange] of updates.entries()) {
    const { entityKey: key, entityId, metadata } = parseSwitchEntity(adapter, entityKey);
    const set = needUpdateEntitiesMap.get(key);
    const entityData = { ...switchChange.patch, id: entityId };
    if (set) {
      set.push(entityData);
    } else {
      needUpdateEntitiesMap.set(key, [entityData]);
    }

    // 存储 change 数据用于事件发送
    let changesMap = updateChangesMap.get(key);
    if (!changesMap) {
      changesMap = new Map();
      updateChangesMap.set(key, changesMap);
    }

    // 获取目标实体的 metadata 来转换值（boolean、date 等）
    changesMap.set(entityId, {
      patch: transformPatch(switchChange.patch, metadata),
      inversePatch: transformPatch(switchChange.inversePatch, metadata) ?? {}
    });
  }

  for (const [key, entityDataArray] of needUpdateEntitiesMap) {
    const metadata = getGroupedMetadata(adapter, key);
    const changesMap = updateChangesMap.get(key)!;
    const sqlStatements: string[] = [];

    for (const dataRaw of entityDataArray) {
      // FR-006：把历史行里的信封解回明文，让写入钩子只加密一次。
      const data = await decryptEntityDataForApply(adapter, metadata, dataRaw);
      const { id, ...updateData } = data;
      if (!isEntityId(id)) throw new TypeError('Switch update requires a string, number or bigint entity id');
      // 目标状态的 updatedAt（patch）与被替换状态的 updatedAt（inversePatch）都只是水位输入，
      // 真正写下去的是「此刻」——undo/redo 是新的写入，详见 getSwitchUpdatedAt。
      const updatedAt =
        metadata.propertyMap.has('updatedAt') ?
          getSwitchUpdatedAt([data['updatedAt'], changesMap.get(id)?.inversePatch?.['updatedAt']])
        : undefined;
      const { sql: updateSql, params: updateParams } = await update_sql<VersionEntityType>(
        metadata,
        { id },
        updateData,
        {
          updatedAt,
          encryption: adapter.encryptionContext
        }
      );
      sqlStatements.push(getSqlWithParams(updateSql, updateParams));
    }
    const combinedSql = sqlStatements.join('---STATEMENT_SEPARATOR---');

    result.updates.push({
      metadata,
      ids: new Set(entityDataArray.map(data => data['id']).filter(isEntityId)),
      sql: combinedSql,
      params: [], // 已经内联到 SQL 中
      changes: updateChangesMap.get(key)!
    });
  }

  return result;
};

/** upsert 命中冲突时不得被覆盖的属性（创建信息属于原始行） */
const IMMUTABLE_ON_CONFLICT_PROPERTIES = ['id', 'createdAt', 'createdBy'] as const;

/**
 * 生成 PostgreSQL ON CONFLICT 子句
 * 用于实现 upsert 语义（如果存在则更新）
 *
 * 更新列**取自本次 INSERT 实际写入的物理列**，而不是另行遍历 `propertyMap`：
 * - 外键物理列只存在于 `relationMap`，遍历 propertyMap 会整个漏掉它们，
 *   冲突行的关联身份于是停在当前值不被恢复（PGL-010）
 * - 两边各算各的列集合，从来没有对过账
 *
 * 没有可更新列时必须是 `DO NOTHING`：空的 `DO UPDATE SET` 是语法错误。
 *
 * @param metadata - 实体元数据，用于解析不可变属性的列名
 * @param insertedColumns - 本次 INSERT 写入的物理列名
 */
const generateOnConflictClause = (metadata: EntityMetadata, insertedColumns: readonly string[]): string => {
  const immutableColumns = new Set(
    IMMUTABLE_ON_CONFLICT_PROPERTIES.map(name => metadata.propertyMap.get(name)?.columnName ?? name)
  );
  const updateColumns = insertedColumns
    .filter(column => !immutableColumns.has(column))
    .map(column => `"${column}" = EXCLUDED."${column}"`)
    .join(', ');

  if (!updateColumns) return ' ON CONFLICT (id) DO NOTHING';
  return ` ON CONFLICT (id) DO UPDATE SET ${updateColumns}`;
};
