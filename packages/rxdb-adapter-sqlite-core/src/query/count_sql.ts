import { CountOptions, EntityMetadata, EntityType, getEntityColumnName, isRuleGroup } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteError, quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import { build_rule_group_join } from './join_sql.js';
import { GenerateSqlResult, buildRuleGroup } from './query_sql.js';
import { MAIN_TABLE_ALIAS } from './sql_alias.utils.js';
import { validateEncryptedQuery } from './validate-encrypted-query.js';

/**
 * 分组列：只认本实体自己的属性或外键，关系路径与未知字段直接报错，不拼进 SQL
 */
const build_group_by = (metadata: EntityMetadata, groupBy: readonly string[]): string =>
  groupBy
    .map(field => {
      const column = getEntityColumnName(metadata, field);
      if (column === undefined) {
        throw new RxDBAdapterSqliteError(
          `Count groupBy field "${field}" must be a property or foreign key of ${metadata.name}`
        );
      }
      return `${MAIN_TABLE_ALIAS}.${quote_sql_identifier(column)}`;
    })
    .join(', ');

/**
 * 生成 count 查询
 *
 * @remarks
 * 给了 `groupBy` 时数的是分组个数：子查询先筛行、分组，外层再数有几组。
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
  validateEncryptedQuery(metadata, { where: whereOptions, groupBy: options.groupBy }, (name, namespace) =>
    adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace)
  );
  const groupBy = options.groupBy?.length ? build_group_by(metadata, options.groupBy) : undefined;
  const { joinSQL, fieldAliasMap } = build_rule_group_join(adapter, metadata, whereOptions);
  const tableName = get_table_name_by_metadata(metadata, adapter.tableSet);
  const params: SQLiteCompatibleType[] = [];
  const where = buildRuleGroup(whereOptions, fieldAliasMap, metadata, adapter, params);
  const from = [`${quote_sql_identifier(tableName)} ${MAIN_TABLE_ALIAS}`, joinSQL, where ? ` WHERE ${where}` : ''].join(
    ''
  );
  // 有 JOIN 时必须 COUNT(DISTINCT ...)：一个父实体匹配 N 条关联行会被 JOIN 展开成 N 行，
  // 裸 COUNT 会把它计 N 次。find_sql 在 hasJoin 时已经加 DISTINCT（见 generate_sql），
  // count 不同口径就会与 find(...).length 对不上（SQLC-009）。分组计数不受影响：展开的行落在同一组里
  const countExpr = joinSQL ? `COUNT(DISTINCT ${MAIN_TABLE_ALIAS}.rowid)` : `COUNT(${MAIN_TABLE_ALIAS}.rowid)`;
  const sql =
    groupBy ?
      `SELECT COUNT(*) AS count FROM (SELECT 1 FROM ${from} GROUP BY ${groupBy})`
    : `SELECT ${countExpr} AS count FROM ${from}`;
  return params.length ? { sql, params } : { sql };
};
