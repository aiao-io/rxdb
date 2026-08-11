import { EntityMetadata } from '@aiao/rxdb';
import type { RowId } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata, ROWID } from '../sqlite-core.utils.js';
import { generate_sql, GenerateSqlResult } from './query_sql.js';
/**
 * 生成 findByRowIds 查询
 */
export const find_by_row_ids_sql = (metadata: EntityMetadata, rowIds: RowId[]): GenerateSqlResult => {
  const where = rowIds.length === 0 ? '1 = 0' : `${ROWID} IN (${rowIds.map(() => '?').join(',')})`;
  const sql = generate_sql({
    tableName: get_table_name_by_metadata(metadata),
    where,
    metadata
  });
  return { sql, params: rowIds };
};
