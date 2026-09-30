/**
 * @fileoverview 把 {@link SwitchVersionActions} 翻成本后端可执行的 SQL（undo/redo/切分支共用）。
 *
 * @remarks
 * **这份文件与另一个后端的同名文件形状几乎一样，是刻意保留的两份，不是漏抽的重复。**
 * 对照的是 `packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts`。
 * 两边的**控制流**确实平行（按 action 分类 → 解信封 → 生成 insert/update/delete → 拼结果），
 * 但每一步用的都是本后端的方言原语，抽出去只剩一个壳：
 *
 * - **类型口径相反**：Postgres 是强类型的，`'42'` 进 `integer` 列直接报错，所以 pglite 侧带着
 *   `normalizeLegacyEntityId` 把历史行里的 id 按列类型归一；SQLite 有列亲和性，`'42'` 会被
 *   悄悄转成 `42`，那一步在 sqlite 侧既不需要也不该有（它会把一个本来合法的字符串 id 改掉）。
 * - **绑定与批量不同**：sqlite 侧要按 `chunkBySqliteBindLimit` 切批（SQLITE_MAX_VARIABLE_NUMBER），
 *   还要用 `ROWID` 定位无主键行；pglite 侧走 `getSqlWithParams`，两者都没有对应物。
 * - **值编解码不同**：`transformValueSqliteToJs` 与 `transformValuePGliteToJs` 读回来的原始表示
 *   不一样（bigint / bytea / boolean 各有各的形态）。
 *
 * 于是「抽公共层」实际能抽走的只有那个 switch 骨架，而它本身不承载任何判断——抽完两边仍各写
 * 一份方言实现，多出来的是一个所有人都得跳过去看的间接层。这批 SQL 若要真的合一，前提是先有
 * 一层「方言无关的语句 IR」，那是另一个量级的工程（且两个适配器互不依赖，公共层落在哪个包
 * 本身也是未定的适配器公开面决策）。判定与顺延记录见 `requirements/roadmap.md`
 * 的「epic-006 评审顺延的架构项」。
 *
 * **两边共享的那一格已经是真的共享的**：`normalizeUpdateEntity` 与
 * `unenvelopePlaintextPatches` 都指向核心 / `@aiao/rxdb-adapter-encrypted` 的同一份实现，
 * 不是各写一遍。新增逻辑先问一句「这一格与方言有关吗」——无关的往那两处放。
 */
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
  normalizeUpdateEntity,
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

/**
 * 列集过滤掉 readonly 列后是否一个可写列都不剩。
 *
 * @remarks
 * 版本机器记下的 update，列集有可能整个落在 readonly 簿记列上（`createdAt` / `updatedAt` /
 * `createdBy` / `updatedBy`）—— 同步应用推来一条只动审计列的行就是这个形状。这种 patch 经
 * {@link normalizeUpdateEntity} 归一化后是空对象，真写下去的只剩适配器自己注入的 `updatedAt`：
 * 一次没有语义内容、却照样触发器落变更日志的空写。所以整条跳过 —— 把行恢复到目标态这件事，
 * 在这一行上本来就无事可做。sqlite-core 的同名文件同样跳过，两家在这一格上必须长得一样。
 */
const hasNoWritableColumn = (metadata: EntityMetadata, patch: EntityData): boolean =>
  Object.keys(normalizeUpdateEntity(metadata, patch)).length === 0;

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
    // 只收真正写过的 id：被跳过的行没落过写，它的 RETURNING 行自然也不存在，
    // 不该被当成「更新过」再发事件、再回填身份缓存。
    const writtenIds = new Set<RxDBEntityId>();

    for (const dataRaw of entityDataArray) {
      // FR-006：把历史行里的信封解回明文，让写入钩子只加密一次。
      const data = await decryptEntityDataForApply(adapter, metadata, dataRaw);
      const { id, ...updateData } = data;
      if (!isEntityId(id)) throw new TypeError('Switch update requires a string, number or bigint entity id');
      if (hasNoWritableColumn(metadata, updateData)) continue;
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
      writtenIds.add(id);
    }
    if (sqlStatements.length === 0) continue;

    result.updates.push({
      metadata,
      ids: writtenIds,
      sql: sqlStatements.join('---STATEMENT_SEPARATOR---'),
      params: [], // 已经内联到 SQL 中
      changes: changesMap
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
