import { quote_sql_identifier } from '../sqlite-core.utils.js';
import type { FtsField } from './types.js';

/**
 * 生成单个 collection 的 FTS5 外部内容虚拟表 DDL。
 *
 * 表名约定：`_fts_<table>`；tokenizer 固定为 `unicode61 remove_diacritics 2`。
 * 使用 SQLite 隐式 `rowid` 作为 external content 关联键（`content_rowid` 默认即 `rowid`）：
 * 业务主键既可能是 `INTEGER PRIMARY KEY`（rowid 别名）也可能是 `TEXT/UUID`，无论哪种
 * 类型 SQLite 都会维护稳定的隐式 `rowid`，trigger 与查询一致使用 `rowid` 关联即可。
 * 业务主键值通过 `JOIN sourceTable src ON src.rowid = fts.rowid` 在查询阶段还原。
 *
 * @param table - 业务表名（不带 `_fts_` 前缀）
 * @param fields - 参与 FTS5 索引的字段（顺序保留，作为 FTS5 列声明顺序）
 * @returns 单条 `CREATE VIRTUAL TABLE IF NOT EXISTS` SQL 语句
 * @public
 */
export const buildCreateFtsTableSql = (table: string, fields: readonly FtsField[]): string => {
  if (fields.length === 0) {
    throw new Error(`buildCreateFtsTableSql: no searchable fields for table "${table}"`);
  }
  const ftsTable = quote_sql_identifier(`_fts_${table}`);
  const columnList = fields.map(f => `  ${quote_sql_identifier(f.name)}`).join(',\n');
  const contentTable = table.replace(/'/g, "''");
  return [
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable}`,
    `USING fts5(`,
    columnList + ',',
    `  content='${contentTable}',`,
    `  content_rowid='rowid',`,
    `  tokenize='unicode61 remove_diacritics 2'`,
    `);`
  ].join('\n');
};
