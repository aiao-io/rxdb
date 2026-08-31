import { pgDialect } from '../sql_dialect.js';
import { qualifyFtsTable } from './qualify.js';
import { FTS_COLUMN, type FtsField, type FtsOptions } from './types.js';

/**
 * 生成 PostgreSQL FTS 物理结构 DDL：在原表追加 `_fts` `tsvector` 列 + GIN 索引。
 *
 * 与 `@aiao/rxdb-adapter-sqlite-core/fts5` 的 `buildCreateFtsTableSql` 在 API 形状上对齐，
 * 但底层机制截然不同：SQLite FTS5 创建外部内容虚拟表 `_fts_<table>`，PG 则直接在原表上
 * 物化 tsvector 列并加 GIN 索引——`SELECT ... WHERE _fts @@ plainto_tsquery(...)` 直接
 * 命中索引，无需 JOIN 虚拟表。
 *
 * 返回 2 条独立语句（用 `;` 分隔），调用方可按需拆分执行：
 * 1. `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS "_fts" tsvector`
 * 2. `CREATE INDEX IF NOT EXISTS "<table>__fts_idx" ON <table> USING GIN ("_fts")`
 *
 * 注意：`regconfig` 由 {@link buildFtsTriggersSql} 在 trigger 函数体内消费，DDL 阶段无需关心。
 *
 * @param table - 业务表名（**不含** schema；schema 走 {@link FtsOptions.schema}）
 * @param fields - 参与 FTS 索引的字段（顺序保留，用于 {@link buildFtsTriggersSql} 生成 trigger）
 * @param options - 可选 {@link FtsOptions.schema}；`regconfig` 在本阶段不消费
 * @returns 多条 SQL 拼接（以 `;` 分隔）
 * @throws 当 `fields` 为空时抛出
 * @public
 */
export const buildCreateFtsTableSql = (table: string, fields: readonly FtsField[], options?: FtsOptions): string => {
  if (fields.length === 0) {
    throw new Error(`buildCreateFtsTableSql: no searchable fields for table "${table}"`);
  }
  const escapedTable = qualifyFtsTable(table, options?.schema);
  const escapedFtsCol = pgDialect.escapeIdentifier(FTS_COLUMN);
  // 索引名不带 schema：索引跟着表进同一个 schema，跨 schema 不可能重名。
  const escapedIndex = pgDialect.escapeIdentifier(`${table}_${FTS_COLUMN}_idx`);

  const alter = `ALTER TABLE ${escapedTable} ADD COLUMN IF NOT EXISTS ${escapedFtsCol} tsvector;`;
  const createIndex = `CREATE INDEX IF NOT EXISTS ${escapedIndex} ON ${escapedTable} USING GIN (${escapedFtsCol});`;

  return `${alter}\n${createIndex}`;
};
