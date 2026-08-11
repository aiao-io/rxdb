import { pgDialect } from '../sql_dialect.js';
import { FTS_COLUMN, type FtsField } from './types.js';

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
 * @param table - 业务表名
 * @param fields - 参与 FTS 索引的字段（顺序保留，用于 {@link buildFtsTriggersSql} 生成 trigger）
 * @returns 多条 SQL 拼接（以 `;` 分隔）
 * @throws 当 `fields` 为空时抛出
 * @public
 */
export const buildCreateFtsTableSql = (table: string, fields: readonly FtsField[]): string => {
  if (fields.length === 0) {
    throw new Error(`buildCreateFtsTableSql: no searchable fields for table "${table}"`);
  }
  const escapedTable = pgDialect.escapeIdentifier(table);
  const escapedFtsCol = pgDialect.escapeIdentifier(FTS_COLUMN);
  const escapedIndex = pgDialect.escapeIdentifier(`${table}_${FTS_COLUMN}_idx`);

  const alter = `ALTER TABLE ${escapedTable} ADD COLUMN IF NOT EXISTS ${escapedFtsCol} tsvector;`;
  const createIndex = `CREATE INDEX IF NOT EXISTS ${escapedIndex} ON ${escapedTable} USING GIN (${escapedFtsCol});`;

  return `${alter}\n${createIndex}`;
};
