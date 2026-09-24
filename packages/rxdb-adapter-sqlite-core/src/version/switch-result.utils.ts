/**
 * @fileoverview 把 {@link SwitchVersionActions} 翻成本后端可执行的 SQL（undo/redo/切分支共用）。
 *
 * @remarks
 * **这份文件与另一个后端的同名文件形状几乎一样，是刻意保留的两份，不是漏抽的重复。**
 * 对照的是 `packages/rxdb-adapter-pglite/src/version/switch-result.utils.ts`。
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
  normalizeUpdateEntity,
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

/**
 * 列集过滤掉 readonly 列后是否一个可写列都不剩。
 *
 * @remarks
 * 版本机器记下的 update，列集有可能整个落在 readonly 簿记列上（`createdAt` / `updatedAt` /
 * `createdBy` / `updatedBy`）—— 同步应用推来一条只动审计列的行就是这个形状。这种 patch 经
 * {@link normalizeUpdateEntity} 归一化后是空对象，真写下去的只剩适配器自己注入的 `updatedAt`：
 * 一次没有语义内容、却照样触发器落变更日志的空写。所以整条跳过 —— 把行恢复到目标态这件事，
 * 在这一行上本来就无事可做。`update_sql` 的空 patch 守卫对调用方的要求正是这个
 *（"caller should no-op instead"）。
 */
const hasNoWritableColumn = (metadata: EntityMetadata, patch: EntityData): boolean =>
  Object.keys(normalizeUpdateEntity(metadata, patch)).length === 0;

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
    // 只收真正写过的 id：被跳过的行没落过写，就不该被 SELECT 回来当成「更新过」再发事件、
    // 再回填身份缓存。changes 里多留的条目只是没人读，不影响 dispatch。
    const ids = new Set<RxDBEntityId>();
    for (const rawEntity of rawEntities) {
      const entityData = await decryptEntityDataForApply(adapter, metadata, rawEntity);
      const { id, ...patch } = entityData;
      if (hasNoWritableColumn(metadata, patch)) continue;
      // 目标状态的 updatedAt（patch）与被替换状态的 updatedAt（inversePatch）都只是水位输入，
      // 真正写下去的是「此刻」——undo/redo 是新的写入，详见 getSwitchUpdatedAt。
      const inversePatch = changes.get(id as RxDBEntityId)?.inversePatch;
      const updatedAt =
        metadata.propertyMap.has('updatedAt') ?
          getSwitchUpdatedAt([entityData['updatedAt'], inversePatch?.['updatedAt']])
        : undefined;
      // **不要展开 adapter.rxdb.context。** update_sql 会读到的只有 userId，读到就把 updatedBy
      // 盖成当前登录用户；而工作树的捕获早在这条 SQL 生成之前，就按调用方给的 patch 记好单元了。
      // 多盖的这一列是捕获侧永远看不见的净变化（updatedBy 属 tracked 列，不在
      // UNTRACKED_BOOKKEEPING_FIELDS 里），冷重放当场对不上。同文件的 INSERT 分支不展开，
      // PGlite 的同名文件也不展开 —— 这里曾经是唯一的例外。
      statements.push(
        toSqliteStatement(
          await update_sql(metadata, { id }, patch, {
            encryption: adapter.encryptionContext,
            updatedAt
          })
        )
      );
      ids.add(id as RxDBEntityId);
    }
    if (statements.length === 0) continue;
    result.updates.push({
      metadata,
      ids,
      statements,
      selectStatements: buildSelectStatements(metadata, ids),
      changes
    });
  }

  return result;
};
