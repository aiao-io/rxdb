import { CountOptions, EntityMetadata, EntityType, isRuleGroup } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteError, get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';
import { build_rule_group_join } from './join_sql.js';
import { GenerateSqlResult, buildRuleGroup } from './query_sql.js';
import { MAIN_TABLE_ALIAS } from './sql_alias.utils.js';
import { validateEncryptedQuery } from './validate-encrypted-query.js';

/**
 * 生成 count 查询
 */
export const count_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: CountOptions<EntityType, object>
): GenerateSqlResult => {
  if (!isRuleGroup(options.where)) {
    throw new RxDBAdapterSqliteError('Invalid count query rule group');
  }
  const whereOptions = options.where;
  if (options.groupBy) {
    throw new RxDBAdapterSqliteError('groupBy not supported yet');
  }
  validateEncryptedQuery(metadata, { where: whereOptions, groupBy: options.groupBy }, (name, namespace) =>
    adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace)
  );
  const { joinSQL, fieldAliasMap } = build_rule_group_join(adapter, metadata, whereOptions);
  const tableName = get_table_name_by_metadata(metadata);
  const params: SQLiteCompatibleType[] = [];
  const where = buildRuleGroup(whereOptions, fieldAliasMap, metadata, adapter, params);
  // 有 JOIN 时必须 COUNT(DISTINCT ...)：一个父实体匹配 N 条关联行会被 JOIN 展开成 N 行，
  // 裸 COUNT 会把它计 N 次。find_sql 在 hasJoin 时已经加 DISTINCT（见 generate_sql），
  // count 不同口径就会与 find(...).length 对不上（SQLC-009）
  const countExpr = joinSQL ? `COUNT(DISTINCT ${MAIN_TABLE_ALIAS}.rowid)` : `COUNT(${MAIN_TABLE_ALIAS}.rowid)`;
  const parts = [`SELECT ${countExpr} AS count FROM ${quote_sql_identifier(tableName)} ${MAIN_TABLE_ALIAS}`];
  if (joinSQL) parts.push(joinSQL);
  if (where) parts.push(` WHERE ${where}`);
  const sql = parts.join('');
  return params.length ? { sql, params } : { sql };
};
