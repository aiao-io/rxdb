/**
 * PostgreSQL 全文索引运行时安装器。
 *
 * 与 `core/fts5-runtime.ts` 承担同一职责、遵循同一套迁移记录约定
 * （签名编码进迁移名，用作幂等 + 漂移检测），但安装顺序刻意相反：
 *
 * | 步骤 | FTS5 | pg-tsvector |
 * | ---- | ---- | ----------- |
 * | 1 | 建虚拟表 | `ALTER TABLE ADD COLUMN "_fts"` + GIN 索引 |
 * | 2 | 清空 + 回填 + 建 trigger（**同一次** rawQuery） | 建 trigger 函数 + trigger |
 * | 3 | — | 分批回填（借 trigger 重算） |
 *
 * FTS5 那边 trigger 必须晚于回填、且三条语句必须同批下发，否则 `_ad` trigger 会对着
 * 刚被清空的索引发 `'delete'` 命令，FTS5 抛 SQLITE_CORRUPT_VTAB。PG 没有这个陷阱：
 * `BEFORE INSERT OR UPDATE FOR EACH ROW` 只是在行落盘前算一个列值，不写第二张表，
 * 任何时刻装上都只会让后续写入更正确。正因为可以先装 trigger，回填才能写成
 * 「空更新」（见 {@link buildPgBackfillSql}），彻底消除与 trigger 表达式漂移的可能。
 *
 * @packageDocumentation
 */

import type { FtsInstallPlan } from '../../core/fts5-installer.js';
import type { InstallFtsResult, MigrationRecordStore, RuntimeSqlExecutor } from '../../core/fts5-runtime.js';
import { SearchExecutionError, SearchSchemaMismatchError } from '../../types.js';
import { FTS_COLUMN, loadPgFtsDdl } from './pg-fts-contract.js';
import {
  buildPgBackfillSql,
  buildPgPendingBackfillProbeSql,
  buildPgResetFtsSql,
  PG_BACKFILL_BATCH_SIZE,
  type PgTableRef
} from './pg-search-sql.js';
import { splitPgStatements } from './pg-statements.js';

/**
 * PostgreSQL 后端的迁移记录名。
 *
 * 前缀与 FTS5 的 `fts5__` 分开，两套后端各占一个命名空间：同一张表先后跑过两种存储时，
 * 不会把对方的 install 记录误读成「本后端已安装」。
 *
 * @param tableName - 物理表名
 * @param action - `install` 或 `backfill`
 * @param version - schema 版本号
 * @returns 迁移记录名
 * @internal
 */
export const pgFtsMigrationName = (tableName: string, action: 'install' | 'backfill', version = 1): string =>
  `pgfts__${tableName}__v${version}__${action}`;

/**
 * 表定位：所有 DDL、探针与查询 SQL 都以此为锚。
 *
 * @remarks
 * 这里**不能**用 `plan.sqlTableName`。那是 SQLite 适配器的物理表名
 * （`<namespace>$<table>`）；pg 适配器把 namespace 建成真正的 schema，
 * 表是 `"<namespace>"."<table>"`。两者恰好都由同一个 namespace 派生，
 * 于是「照搬 sqlTableName」看着很自然，实际让整个 pg 后端指向一张
 * 从来不存在的 `"public$article"`。
 */
const tableRefOf = (plan: FtsInstallPlan): PgTableRef => ({ schema: plan.namespace, table: plan.tableName });

/**
 * 派生对象（索引 / trigger / trigger 函数）的名字基。
 *
 * 与 {@link tableRefOf} 不同，这里就是**裸表名**：适配器的 DDL 构造器拿到裸名后
 * 自行拼出 `<table>__fts_idx` 等名字，schema 由它单独限定。探测这些对象时
 * 必须按同一规则拼，否则「装上了却探不到」会让每次启动都白重装一遍。
 */
const objectBaseOf = (plan: FtsInstallPlan): string => plan.tableName;

/**
 * 迁移记录名的锚。
 *
 * 刻意仍用 `sqlTableName`：迁移记录只是本地账本，换锚点会让所有存量安装记录
 * 一夜之间读不到，进而触发一次无谓的全表重装。它要的只是「同一张表稳定同名」，
 * 而 `<namespace>$<table>` 恰好满足，且跨 schema 天然不撞。
 */
const migrationTableOf = (plan: FtsInstallPlan): string => plan.sqlTableName ?? plan.tableName;

const installMigrationName = (plan: FtsInstallPlan): string =>
  `${pgFtsMigrationName(migrationTableOf(plan), 'install')}__${plan.signature}`;

const backfillMigrationName = (plan: FtsInstallPlan): string =>
  `${pgFtsMigrationName(migrationTableOf(plan), 'backfill')}__${plan.signature}`;

/** 从迁移名中解出签名后缀；格式不符时返回 `''`（视作空签名）。 */
const extractStoredSignature = (migrationName: string, tableName: string): string => {
  const prefix = `${pgFtsMigrationName(tableName, 'install')}__`;
  return migrationName.startsWith(prefix) ? migrationName.slice(prefix.length) : '';
};

/**
 * 逐条下发一段多语句 SQL。
 *
 * `RuntimeSqlExecutor.rawQuery` 落到 PGlite 的 `query()` 上走扩展查询协议，
 * 一次只吃一条语句；而 `@aiao/rxdb-adapter-pglite` 的 DDL 构造器返回的是 `;` 拼接串。
 */
const execEach = async (executor: RuntimeSqlExecutor, sql: string): Promise<void> => {
  for (const statement of splitPgStatements(sql)) {
    await executor.rawQuery(statement);
  }
};

/** 读取单值计数列。 */
const readCount = async (executor: RuntimeSqlExecutor, sql: string): Promise<number> => {
  const result = await executor.rawQuery(sql);
  const index = result.columns.indexOf('count');
  const raw = index < 0 ? undefined : result.rows[0]?.[index];
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new SearchExecutionError(`PostgreSQL count probe returned a non-numeric value: ${String(raw)}`);
  }
  return value;
};

/** 运行时对象探测结果。 */
interface PgRuntimeObjects {
  readonly hasColumn: boolean;
  readonly hasIndex: boolean;
  readonly hasTrigger: boolean;
  readonly functionSource: string;
}

/**
 * 探测四个运行时对象是否就位。
 *
 * @remarks
 * 每条子查询都按 schema 收窄。目录视图是**全库**的：不加 schema 条件时，
 * `public.article` 上装好的索引会让 `shop.article` 的探测直接返回「已就位」，
 * 于是 shop 那张表永远等不到自己的索引与 trigger，而安装流程每次都报健康。
 * 多租户按 namespace 分 schema 时这几乎必然发生。
 *
 * 四类对象的定位方式各不相同，因为 PG 的目录本身就长得不一样：
 * 列与索引各自带 schema 列；trigger 只能经 `pg_class` 回到它所依附的表，
 * 再由表回到 schema；函数不依附任何表，直接落在 `pg_proc.pronamespace` 上。
 * `schema` 省略时（调用方自建、就在 `search_path` 上的表）退回不限定的旧语义。
 */
const inspectPgRuntimeObjects = async (
  plan: FtsInstallPlan,
  executor: RuntimeSqlExecutor
): Promise<PgRuntimeObjects> => {
  const { schema, table } = tableRefOf(plan);
  const base = objectBaseOf(plan);
  // $6 = schema；NULL 时每个 `$6 IS NULL OR ...` 分支恒真，退化成不限定的探测
  const inSchema = (column: string): string => `($6::text IS NULL OR ${column} = $6::text)`;
  const result = await executor.rawQuery(
    [
      `SELECT`,
      `  (SELECT count(*) FROM information_schema.columns`,
      `    WHERE table_name = $1 AND column_name = $2 AND ${inSchema('table_schema')}) AS has_column,`,
      `  (SELECT count(*) FROM pg_indexes`,
      `    WHERE tablename = $1 AND indexname = $3 AND ${inSchema('schemaname')}) AS has_index,`,
      `  (SELECT count(*) FROM pg_trigger t`,
      `    JOIN pg_class c ON c.oid = t.tgrelid`,
      `    JOIN pg_namespace n ON n.oid = c.relnamespace`,
      `    WHERE t.tgname = $4 AND NOT t.tgisinternal AND c.relname = $1 AND ${inSchema('n.nspname')}) AS has_trigger,`,
      `  (SELECT COALESCE(p.prosrc, '') FROM pg_proc p`,
      `    JOIN pg_namespace n ON n.oid = p.pronamespace`,
      `    WHERE p.proname = $5 AND ${inSchema('n.nspname')} LIMIT 1) AS function_source`
    ].join('\n'),
    [
      table,
      FTS_COLUMN,
      `${base}_${FTS_COLUMN}_idx`,
      `${base}_${FTS_COLUMN}_trg`,
      `${base}_${FTS_COLUMN}_update`,
      schema ?? null
    ]
  );
  const at = (column: string): unknown => {
    const index = result.columns.indexOf(column);
    return index < 0 ? undefined : result.rows[0]?.[index];
  };
  return {
    hasColumn: Number(at('has_column')) > 0,
    hasIndex: Number(at('has_index')) > 0,
    hasTrigger: Number(at('has_trigger')) > 0,
    functionSource: String(at('function_source') ?? '')
  };
};

/**
 * 结构是否可信。
 *
 * 签名一致只证明「上次是按同一份 schema 装的」，证明不了这些对象现在还在、还对：
 * 用户可能手工 `DROP TRIGGER`，也可能上次安装恰好在建完列之后被杀。
 * 这里额外核对 trigger 函数体确实提到了每个字段列——字段被外部改动过时，
 * 光看对象存不存在会放行一个只索引了部分字段的实现。
 */
const hasHealthyPgRuntimeObjects = (plan: FtsInstallPlan, objects: PgRuntimeObjects): boolean => {
  if (!objects.hasColumn || !objects.hasIndex || !objects.hasTrigger) return false;
  if (!objects.functionSource.includes('to_tsvector(')) return false;
  return plan.fields.every(field => objects.functionSource.includes(`NEW."${field.name.replace(/"/g, '""')}"`));
};

const applyStructure = async (plan: FtsInstallPlan, executor: RuntimeSqlExecutor): Promise<void> => {
  // 传裸表名 + schema：构造器据此拼出 `"<schema>"."<table>"`，并把 trigger 函数
  // 一并限定到同一 schema（函数不依附表，不限定就会被两个 schema 的同名表抢）。
  const ddlOptions = { schema: plan.namespace };
  const table = objectBaseOf(plan);
  // DDL 构造器在这里才加载：静态引入会把整个 pglite 适配器拖进只用 sqlite 的下游的
  // 加载图里（见 pg-fts-contract.ts）。这一行只有 adapter 确实是 pglite 时才执行得到。
  const { buildCreateFtsTableSql, buildFtsTriggersSql } = await loadPgFtsDdl();
  // 两条 DDL 都是 IF NOT EXISTS，重复执行无副作用
  await execEach(executor, buildCreateFtsTableSql(table, plan.fields, ddlOptions));
  // 函数是 CREATE OR REPLACE、trigger 先 DROP IF EXISTS 再建，同样幂等
  await execEach(executor, buildFtsTriggersSql(table, plan.fields, ddlOptions));
};

/**
 * 分批回填至 `_fts` 全表非 NULL。
 *
 * 循环条件读的是**数据本身**而不是任何记账字段：`_fts IS NULL` 就是回填进度的持久化哨兵
 * （`ADD COLUMN` 给存量行留下 NULL，trigger 装上后新写入立刻是非 NULL）。
 * 因此进程在任意一批之间被杀，重入时自然从剩余行继续，既不重做已完成的部分，
 * 也不会把半成品当成就绪（US-703 AC#7）。
 *
 * 迭代次数有上限：正常情况下每批至少吃掉一行，吃不动就说明有行始终算不出非 NULL 值
 * （例如 trigger 被外部改坏），此时必须抛错而不是空转或静默返回。
 */
const backfillUntilComplete = async (plan: FtsInstallPlan, executor: RuntimeSqlExecutor): Promise<void> => {
  const ref = tableRefOf(plan);
  const probeSql = buildPgPendingBackfillProbeSql(ref);
  const backfillSql = buildPgBackfillSql({
    ...ref,
    primaryKey: plan.primaryKey,
    batchSize: PG_BACKFILL_BATCH_SIZE
  });
  let pending = await readCount(executor, probeSql);
  // +2：一轮把余量吃完，再留一轮确认归零
  let remainingRounds = Math.ceil(pending / PG_BACKFILL_BATCH_SIZE) + 2;
  while (pending > 0) {
    if (remainingRounds <= 0) {
      throw new SearchExecutionError(
        `PostgreSQL FTS backfill did not converge on table "${ref.table}": ${pending} row(s) still have a NULL "${FTS_COLUMN}" column`
      );
    }
    remainingRounds -= 1;
    await executor.rawQuery(backfillSql);
    pending = await readCount(executor, probeSql);
  }
};

/**
 * 执行单个 entity 的 PostgreSQL 全文索引安装；幂等，且中断后可续跑。
 *
 * - 已有同签名 install 记录且结构可信、回填已完成 → `already_installed`，无副作用
 * - 已有同签名 install 记录但结构缺失 / 回填未完成 → 补齐并返回 `repaired`
 * - 已有不同签名 install 记录 → 抛 {@link SearchSchemaMismatchError}
 * - 无记录 → 全新安装，返回 `installed`
 *
 * 调用方负责把多个 entity 的安装包进事务；本函数自身不开事务。
 *
 * @param plan - 由实体元数据推导出的安装计划
 * @param executor - 引导期 SQL 执行器
 * @param migrationStore - 迁移记录读写
 * @returns 安装结果
 * @throws {SearchSchemaMismatchError} 迁移历史与当前 schema 签名冲突
 * @public
 */
export async function installPgFtsForEntity(
  plan: FtsInstallPlan,
  executor: RuntimeSqlExecutor,
  migrationStore: MigrationRecordStore
): Promise<InstallFtsResult> {
  const migrationTable = migrationTableOf(plan);
  const existing = await migrationStore.listInstallMigrationsForTable(migrationTable);
  const expectedName = installMigrationName(plan);

  if (existing.length > 0) {
    // 同表并存多个不同签名 = 迁移历史被污染，真实结构不可信，一律 fail-fast
    const storedSigs = [...new Set(existing.map(m => extractStoredSignature(m.name, migrationTable)))];
    if (storedSigs.length !== 1 || existing[0].name !== expectedName) {
      throw new SearchSchemaMismatchError(plan.tableName, plan.signature, storedSigs.join(', '));
    }
    return await resumeInstall(plan, executor);
  }

  await applyStructure(plan, executor);
  await backfillUntilComplete(plan, executor);
  // 两条记录都在全部完成之后才写：中途被杀就没有记录，下次是一次干净的全新安装
  await Promise.all([
    migrationStore.recordMigration(expectedName),
    migrationStore.recordMigration(backfillMigrationName(plan))
  ]);

  return { tableName: plan.tableName, status: 'installed', fields: plan.fields };
}

/**
 * 签名命中时的续跑路径。
 *
 * 抽成独立函数纯粹是为了让 {@link installPgFtsForEntity} 的分支保持在三层以内。
 */
const resumeInstall = async (plan: FtsInstallPlan, executor: RuntimeSqlExecutor): Promise<InstallFtsResult> => {
  const objects = await inspectPgRuntimeObjects(plan, executor);
  if (hasHealthyPgRuntimeObjects(plan, objects)) {
    const pending = await readCount(executor, buildPgPendingBackfillProbeSql(tableRefOf(plan)));
    if (pending === 0) {
      return { tableName: plan.tableName, status: 'already_installed', fields: plan.fields };
    }
    // 上次回填被中断：接着把剩下的行补完，不重做已完成的部分
    await backfillUntilComplete(plan, executor);
    return { tableName: plan.tableName, status: 'repaired', fields: plan.fields };
  }

  // 结构缺失或被外部改动过：重建结构，再把每一行推过一次新 trigger 强制全量重算——
  // 留着旧向量会让新旧两套 trigger 产出的数据混在一起，命中与否取决于行的写入时间。
  //
  // 那条 SQL 字面上写的是 `SET "_fts" = NULL`，但它落不到盘上：BEFORE UPDATE trigger
  // 在行写入前就把 `NEW."_fts"` 重新算好了，于是「清空」实际执行成了「重算」。
  // 这正是要的效果，而且插件侧一个字的 to_tsvector 表达式都不用复制（复制必然漂移）。
  // 剩下本来就是 NULL 的行不在它的 WHERE 里，由紧随其后的分批回填收尾。
  await applyStructure(plan, executor);
  await executor.rawQuery(buildPgResetFtsSql(tableRefOf(plan)));
  await backfillUntilComplete(plan, executor);
  return { tableName: plan.tableName, status: 'repaired', fields: plan.fields };
};
