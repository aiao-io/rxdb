/**
 * @fileoverview SQLite family 的存储约束漂移检查（US-030 AC#10 / #11 / #16）。
 *
 * 只读比对：元数据确定性生成的约束名集合（阶段 A 只纳入 `ck_` 起头的对象）与
 * `sqlite_master` 里建表 SQL 文本中的实际约束名集合。不一致抛
 * `RxDBConstraintDriftError`，列出缺失与多余的名字，不自动补建——补建由用户写进
 * `migrations`（它恰好排在漂移检查之前执行）。
 *
 * SQLite 的 CHECK 约束没有独立的目录行，名字只存在于建表 SQL 文本里
 * （`ALTER TABLE ADD CONSTRAINT CHECK` 也会重写该文本），所以解析 sql 文本。
 * 比对范围刻意收窄：外键约束（作者原名）、`idx_` 普通索引、系统 CRUD 触发器与
 * FTS 触发器都不在范围——否则每张既有表首次 `init()` 就被报「多余」（AC#16）。
 */

import { compileCheckConstraint, getEntityMetadata, RxDBConstraintDriftError, type EntityType } from '@aiao/rxdb';
import type { SqliteResult } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata } from '../sqlite-core.utils.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';

/** 漂移检查只读查询的最小接口：引导事务执行器门面（`execute` 落在当前事务里，返回原生结果）。 */
type ConstraintCatalogQuerier = Pick<RxDBAdapterSqliteBase, never> & {
  execute(sql: string, bindings?: unknown[]): Promise<SqliteResult>;
};

/** 建表 SQL 文本里的命名约束：`CONSTRAINT "name"`。只取 `ck_` 起头（阶段 A 范围）。 */
const NAMED_CONSTRAINT_PATTERN = /CONSTRAINT\s+"([^"]+)"/g;

/** 从建表 SQL 文本里解析 `ck_` 起头的约束名集合。 */
const actualCheckNames = (createSql: string): Set<string> => {
  const names = new Set<string>();
  for (const match of createSql.matchAll(NAMED_CONSTRAINT_PATTERN)) {
    if (match[1].startsWith('ck_')) names.add(match[1]);
  }
  return names;
};

/**
 * SQLite family 的漂移检查：元数据声明的 CHECK 与库里的实际 CHECK 逐表比对。
 *
 * @param adapter - 引导事务执行器门面：`connect()` 引导期内 `ready()` 等的是当前
 *   connect promise，直接走 `adapter.query()` 会等自己、永久挂起，所以本函数必须
 *   在 {@link RxDBAdapterSqliteBase.bootstrapTransaction} 里以执行器调用
 * @param EntityTypes - 全部注册实体（含未声明 checks 的：删掉声明而未迁移的残留
 *   `ck_` 约束同样判为「多余」）
 * @throws {@link RxDBConstraintDriftError} 任一实体表出现缺失或多余的 `ck_` 约束时
 */
export const check_entity_constraints_sqlite = async (
  adapter: ConstraintCatalogQuerier,
  EntityTypes: readonly EntityType[]
): Promise<void> => {
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    const expected = new Set<string>();
    for (const check of metadata.checkMap.values()) {
      expected.add(compileCheckConstraint(metadata, check).name);
    }

    const tableName = get_table_name_by_metadata(metadata);
    const result = await adapter.execute(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [tableName]);
    const rows = result.results[0]?.rows ?? [];
    // 表不存在时无行可读：缺表补建排在漂移检查之前，走到这里表必在；真有缺失就跳过
    // 该表（下一轮 connect 的 ensureEntityTables 会补建并带着约束建出来）。
    if (rows.length === 0) continue;

    const actual = actualCheckNames(String(rows[0][0] ?? ''));
    const missing = Array.from(expected).filter(name => !actual.has(name)).sort();
    const extra = Array.from(actual).filter(name => !expected.has(name)).sort();
    if (missing.length > 0 || extra.length > 0) {
      throw new RxDBConstraintDriftError(metadata.name, metadata.tableName, missing, extra);
    }
  }
};
