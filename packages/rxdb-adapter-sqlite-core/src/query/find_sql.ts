import { EntityMetadata, EntityType, FindOptions, isRuleGroup } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteError, get_table_name_by_metadata } from '../sqlite-core.utils.js';
import { build_rule_group_join } from './join_sql.js';
import { GenerateSqlResult, buildRuleGroup, build_order_by, generate_sql } from './query_sql.js';
import { validateEncryptedQuery } from './validate-encrypted-query.js';

/**
 * 生成 find 查询
 */
export const find_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindOptions<EntityType, object>
): GenerateSqlResult => {
  if (!isRuleGroup(options.where)) {
    throw new RxDBAdapterSqliteError('Invalid find query rule group');
  }
  const whereOptions = options.where;
  validateEncryptedQuery(
    metadata,
    {
      where: whereOptions,
      orderBy: options.orderBy,
      groupBy: options.groupBy,
      projection: options.projection
    },
    (name, namespace) => adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace)
  );

  // groupBy / projection 在 FindOptions 上是声明出来的，但 generate_sql 从来不消费它们 —— 先快速失败，避免静默忽略。
  // 必须排在 validateEncryptedQuery **之后**：加密列上的 groupBy/projection 有更精确的
  // 错误码（group_on_encrypted / projection_on_encrypted），不能被这里的通用错误抢先（SQLC-024）
  if (options.groupBy?.length) {
    throw new RxDBAdapterSqliteError('find: groupBy is declared but not implemented by the SQLite adapter');
  }
  if (options.projection?.length) {
    throw new RxDBAdapterSqliteError('find: projection is declared but not implemented by the SQLite adapter');
  }
  // orderBy 与 where 走同一次 JOIN 规划：共享别名表，关系路径与 keyValue 路径才能拿到别名（SQLC-025）
  const { joinSQL, fieldAliasMap, orderBy } = build_rule_group_join(adapter, metadata, whereOptions, options.orderBy);
  const params: SQLiteCompatibleType[] = [];
  const sql = generate_sql({
    tableName: get_table_name_by_metadata(metadata),
    where: buildRuleGroup(whereOptions, fieldAliasMap, metadata, adapter, params),
    orderBy: build_order_by(orderBy, metadata, adapter, fieldAliasMap),
    join: joinSQL,
    hasJoin: !!joinSQL,
    metadata,
    limit: options.limit,
    offset: options.offset
  });
  return params.length ? { sql, params } : { sql };
};
