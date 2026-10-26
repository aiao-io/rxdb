/**
 * 生成通过 rowIds 查询实体的 SQL
 * 用于 handle_rxdb_change 中根据 NOTIFY 事件的 rowIds 查询实体
 *
 * PGlite 版本使用 id IN (...) 而不是 SQLite 的 __rowid
 */

import { EntityMetadata, type WorktreeTableSet } from '@aiao/rxdb';
import { getTableNameByMetadata } from '../table-name-resolver.js';

export interface GenerateSqlResult {
  sql: string;
  params?: unknown[];
}

/**
 * 生成 findByRowIds 查询 SQL
 *
 * @param metadata - 实体元数据
 * @param rowIds - 行 ID 数组
 * @returns SQL 查询和参数
 */
export default (
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  rowIds: Array<string | number>
): GenerateSqlResult => {
  const tableName = getTableNameByMetadata(metadata, tableSet);

  // PostgreSQL 使用 $1, $2, ... 参数占位符
  const placeholders = rowIds.map((_, index) => `$${index + 1}`).join(', ');

  const sql = `SELECT * FROM ${tableName} WHERE id IN (${placeholders})`;

  return {
    sql,
    params: rowIds
  };
};
