/**
 * T030 [US1] —— FTS5 运行时安装器。
 *
 * 将 {@link extractFtsPlanFromMetadata} 产出的纯逻辑计划落到真实 SQLite 之上：
 *
 *  1. 生成 `_fts_<table>` 虚拟表 DDL（{@link buildCreateFtsTableSql}）
 *  2. 一次性下发「清空索引 + 回填存量 + 建 `_ai/_ad/_au` trigger」
 *     （{@link buildResetFtsSql} / {@link buildBackfillSql} / {@link buildFtsTriggersSql}）；
 *     trigger 建在回填之后且与之同批，理由见 {@link installFtsForEntity} 内的注释
 *  3. 写入 `RxDBMigration` 记录，**签名编码在迁移名中**，用作幂等 + 漂移检测
 *
 * 签名编码到 migration name 的设计：
 *  - `fts5__<table>__v1__install__<signature>`  表创建 + trigger
 *  - `fts5__<table>__v1__backfill__<signature>` 回填
 *  - 下次启动时若查到同 `<table>` 的 install 迁移但签名不同 → 抛 {@link SearchSchemaMismatchError}
 *  - 好处：无需额外 schema，复用现有 `rxdb_migration` 表，迁移表自身也对 user migration 透明
 *
 * 本模块的 SQL 执行通过 {@link RuntimeSqlExecutor} 依赖注入，迁移读写通过
 * {@link MigrationRecordStore} 抽象，便于 Node vitest 用 mock 驱动完整分支覆盖；
 * 真实 `rawQuery` / RxDB entity repo 装配在 `plugin.ts` 中完成。
 *
 * @packageDocumentation
 */

import {
  buildCreateFtsTableSql,
  buildFtsTriggersSql,
  FTS_BIGRAM_SQL_FUNCTION,
  quote_sql_identifier,
  type FtsField
} from '@aiao/rxdb-adapter-sqlite-core';

import { SearchSchemaMismatchError } from '../types.js';
import { ftsMigrationName, type FtsInstallPlan } from './fts5-installer.js';

/**
 * 原子 SQL 执行接口。与 `@aiao/rxdb-adapter-sqlite-core` 的
 * `RxDBAdapterSqliteBase.rawQuery` 形状一致。
 *
 * @public
 */
export interface RuntimeSqlExecutor {
  rawQuery(
    sql: string,
    params?: readonly unknown[]
  ): Promise<{
    rowsAffected: number;
    rows: unknown[][];
    columns: string[];
  }>;
}

/**
 * 迁移记录访问抽象。插件不直接依赖 `RxDBMigration` entity，方便单测与复用。
 *
 * @public
 */
export interface MigrationRecordStore {
  /**
   * 列出某个表所有 `fts5__<table>__v1__install__*` 迁移记录。
   * 通常只会有 0 或 1 条——若并存多个不同签名，说明迁移历史被污染，
   * `installFtsForEntity` 会直接抛 {@link SearchSchemaMismatchError}（fail-fast，不猜哪条可信）。
   */
  listInstallMigrationsForTable(tableName: string): Promise<readonly { name: string }[]>;
  /** 写入一条迁移记录（幂等可选，调用方保证不重复写入同名记录） */
  recordMigration(name: string): Promise<void>;
}

/** 单个 entity 的安装结果。 */
export interface InstallFtsResult {
  readonly tableName: string;
  readonly status: 'installed' | 'already_installed' | 'repaired';
  readonly fields: readonly FtsField[];
}

/** 物理表名：FTS5 虚拟表 / trigger / migration 记录均以此为锚 */
const physicalTableOf = (plan: FtsInstallPlan): string => plan.sqlTableName ?? plan.tableName;

/** 在 migration name 尾部编码签名，避免 schema 扩展。 */
const installMigrationName = (plan: FtsInstallPlan): string =>
  `${ftsMigrationName(physicalTableOf(plan), 'install')}__${plan.signature}`;

const backfillMigrationName = (plan: FtsInstallPlan): string =>
  `${ftsMigrationName(physicalTableOf(plan), 'backfill')}__${plan.signature}`;

const installNamePrefix = (tableName: string): string => `${ftsMigrationName(tableName, 'install')}__`;

interface RuntimeObject {
  readonly type: string;
  readonly name: string;
  readonly sql: string;
}

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim().toLowerCase();

const inspectRuntimeObjects = async (
  plan: FtsInstallPlan,
  executor: RuntimeSqlExecutor
): Promise<ReadonlyMap<string, RuntimeObject>> => {
  const table = physicalTableOf(plan);
  const fts = `_fts_${table}`;
  const names = [fts, `${fts}_ai`, `${fts}_ad`, `${fts}_au`];
  const placeholders = names.map(() => '?').join(', ');
  const result = await executor.rawQuery(
    `SELECT type, name, sql FROM sqlite_master WHERE name IN (${placeholders})`,
    names
  );
  const typeIndex = result.columns.indexOf('type');
  const nameIndex = result.columns.indexOf('name');
  const sqlIndex = result.columns.indexOf('sql');
  const objects = new Map<string, RuntimeObject>();
  if (typeIndex < 0 || nameIndex < 0 || sqlIndex < 0) return objects;
  for (const row of result.rows) {
    const name = String(row[nameIndex]);
    objects.set(name, { type: String(row[typeIndex]), name, sql: String(row[sqlIndex] ?? '') });
  }
  return objects;
};

const hasHealthyRuntimeObjects = (plan: FtsInstallPlan, objects: ReadonlyMap<string, RuntimeObject>): boolean => {
  const table = physicalTableOf(plan);
  const fts = `_fts_${table}`;
  const ftsObject = objects.get(fts);
  if (!ftsObject || ftsObject.type !== 'table') return false;
  const ftsSql = normalizeSql(ftsObject.sql);
  const escapedContent = table.replace(/'/g, "''").toLowerCase();
  const ftsRequirements = [
    'using fts5(',
    ...plan.fields.map(field => normalizeSql(quote_sql_identifier(field.name))),
    `content='${escapedContent}'`,
    `content_rowid='rowid'`,
    "tokenize='unicode61 remove_diacritics 2'"
  ];
  if (ftsRequirements.some(fragment => !ftsSql.includes(fragment))) return false;

  const source = normalizeSql(quote_sql_identifier(table));
  const ftsName = normalizeSql(quote_sql_identifier(fts));
  const fieldTokens = plan.fields.flatMap(field => [normalizeSql(quote_sql_identifier(field.name)), 'rxdb_fts_bigram']);
  const triggerRequirements = [
    [`${fts}_ai`, `after insert on ${source}`],
    [`${fts}_ad`, `after delete on ${source}`],
    [`${fts}_au`, `after update on ${source}`]
  ] as const;
  return triggerRequirements.every(([name, event]) => {
    const trigger = objects.get(name);
    if (!trigger || trigger.type !== 'trigger') return false;
    const sql = normalizeSql(trigger.sql);
    return sql.includes(event) && sql.includes(ftsName) && fieldTokens.every(token => sql.includes(token));
  });
};

const dropRuntimeObjects = async (plan: FtsInstallPlan, executor: RuntimeSqlExecutor): Promise<void> => {
  const table = physicalTableOf(plan);
  const fts = quote_sql_identifier(`_fts_${table}`);
  await executor.rawQuery(
    [
      `DROP TRIGGER IF EXISTS ${quote_sql_identifier(`_fts_${table}_ai`)};`,
      `DROP TRIGGER IF EXISTS ${quote_sql_identifier(`_fts_${table}_ad`)};`,
      `DROP TRIGGER IF EXISTS ${quote_sql_identifier(`_fts_${table}_au`)};`,
      `DROP TABLE IF EXISTS ${fts};`
    ].join('\n'),
    undefined
  );
};

/** 从迁移名中解出签名后缀；格式不符时返回 `''`（视作空签名）。 */
const extractStoredSignature = (migrationName: string, tableName: string): string => {
  const prefix = installNamePrefix(tableName);
  return migrationName.startsWith(prefix) ? migrationName.slice(prefix.length) : '';
};

/**
 * FTS5 虚拟表 reset 命令：清空索引但保留表结构。
 *
 * 必须用 `INSERT INTO <fts>(<fts>) VALUES('delete-all')`——FTS5 虚拟表不支持
 * 普通的 `DELETE FROM <fts>`（external-content 模式下会抛错），且没有 UNIQUE 约束，
 * 不能依赖 `INSERT OR IGNORE` 去重。
 *
 * @internal
 */
export const buildResetFtsSql = (plan: FtsInstallPlan): string => {
  const fts = quote_sql_identifier(`_fts_${physicalTableOf(plan)}`);
  return `INSERT INTO ${fts}(${fts}) VALUES('delete-all')`;
};

/** 回填 SQL：外部内容 FTS5 表用 rowid 绑定主键；stringArray 字段走 json_each 子查询。 */
export const buildBackfillSql = (plan: FtsInstallPlan): string => {
  const sqlTableName = physicalTableOf(plan);
  const fts = quote_sql_identifier(`_fts_${sqlTableName}`);
  const cols: string[] = [];
  const values: string[] = [];
  for (const f of plan.fields) {
    const col = quote_sql_identifier(f.name);
    cols.push(col);
    const raw =
      f.isArray ? `COALESCE((SELECT group_concat(value, char(10)) FROM json_each(src.${col})), '')` : `src.${col}`;
    // 必须与 buildFtsTriggersSql 的 valueWrapper 完全一致，
    // 否则存量（backfill）与增量（trigger）两批数据的分词方式不同，查询只能命中其中一半
    values.push(`${FTS_BIGRAM_SQL_FUNCTION}(${raw})`);
  }
  // 配合 buildResetFtsSql 使用：先清空再插入，避免历史残留数据导致重复行
  // （FTS5 虚拟表无 UNIQUE 约束，`INSERT OR IGNORE` 不会去重）
  return `INSERT INTO ${fts}(rowid, ${cols.join(', ')}) SELECT src.rowid, ${values.join(', ')} FROM ${quote_sql_identifier(sqlTableName)} AS src`;
};

/**
 * 执行单个 entity 的 FTS5 安装；幂等。
 *
 * 行为：
 *  - 若已存在同签名 install 记录 → `already_installed`，无副作用
 *  - 若已存在不同签名 install 记录 → 抛 {@link SearchSchemaMismatchError}
 *  - 否则按 DDL → triggers → backfill → 两条 migration 记录的顺序执行
 *
 * 调用方负责把多个 entity 的安装包进 `adapter.transaction(...)`，本函数自身
 * 不开事务——部分适配器/dialect 不允许 DDL 出现在事务中。
 */
export async function installFtsForEntity(
  plan: FtsInstallPlan,
  executor: RuntimeSqlExecutor,
  migrationStore: MigrationRecordStore
): Promise<InstallFtsResult> {
  const sqlTableName = plan.sqlTableName ?? plan.tableName;
  const existing = await migrationStore.listInstallMigrationsForTable(sqlTableName);
  const expectedName = installMigrationName(plan);

  if (existing.length > 0) {
    // 同表并存多个不同签名 = 迁移历史已被污染（外部干预/中断残留），
    // 真实 _fts_* 表结构不可信——即使当前签名命中其一也必须 fail-fast，
    // 不能用任意历史命中放行后让查询在运行期才炸。
    const storedSigs = [...new Set(existing.map(m => extractStoredSignature(m.name, sqlTableName)))];
    if (storedSigs.length === 1 && existing[0].name === expectedName) {
      const objects = await inspectRuntimeObjects(plan, executor);
      if (hasHealthyRuntimeObjects(plan, objects)) {
        return { tableName: plan.tableName, status: 'already_installed', fields: plan.fields };
      }

      await dropRuntimeObjects(plan, executor);
      await executor.rawQuery(buildCreateFtsTableSql(sqlTableName, plan.fields));
      await executor.rawQuery(
        [
          `${buildResetFtsSql(plan)};`,
          `${buildBackfillSql(plan)};`,
          buildFtsTriggersSql(sqlTableName, plan.fields, { valueWrapper: FTS_BIGRAM_SQL_FUNCTION })
        ].join('\n\n')
      );
      return { tableName: plan.tableName, status: 'repaired', fields: plan.fields };
    }
    throw new SearchSchemaMismatchError(plan.tableName, plan.signature, storedSigs.join(', '));
  }

  // 建虚拟表 → 「清空残留 + 回填 + 建 trigger」一次性提交
  //
  // 顺序与打包方式都不是风格问题，是正确性问题：
  //
  // 1. trigger 必须建在 backfill **之后**。反过来的话，trigger 已生效而索引刚被
  //    `'delete-all'` 清空的那一瞬间，任何一条用户 DELETE 都会让 `_ad` trigger 对着
  //    空索引发 `'delete'` 命令，FTS5 抛 SQLITE_CORRUPT_VTAB —— 用户看到的字面报错是
  //    「database disk image is malformed」。该语句回滚，行还在，所以再点一次又好了。
  // 2. 三条语句必须在**同一次** `rawQuery` 里下发。适配器按 rawQuery 粒度串行，
  //    拆成三次就等于留出两个可插入用户写入的窗口，第 1 点的顺序保证随即失效。
  //
  // 显式 reset 仍然保留，用于应对历史残留（用户手动操作过、上次 install 中断等）：
  // FTS5 虚拟表无 UNIQUE 约束，光靠 INSERT OR IGNORE 不去重。
  //
  // 残留窗口（已知且有意）：建表与本批次之间仍可能落入用户写入。此时 trigger 尚未存在，
  // 不会产生 `'delete'` 命令，而 backfill 读的是当下的表快照，索引与表依然一致。
  await executor.rawQuery(buildCreateFtsTableSql(sqlTableName, plan.fields));
  await executor.rawQuery(
    [
      `${buildResetFtsSql(plan)};`,
      `${buildBackfillSql(plan)};`,
      buildFtsTriggersSql(sqlTableName, plan.fields, { valueWrapper: FTS_BIGRAM_SQL_FUNCTION })
    ].join('\n\n')
  );

  await Promise.all([
    migrationStore.recordMigration(expectedName),
    migrationStore.recordMigration(backfillMigrationName(plan))
  ]);

  return { tableName: plan.tableName, status: 'installed', fields: plan.fields };
}
