import { EntityMetadata, EntityRelationManyToOneMetadata, OrderBy, PropertyType, RuleGroup } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { get_primary_key_column, quote_sql_identifier, ROWID, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import { build_rule, resolve_column_name, resolve_query_property } from './query_sql.utils.js';
import { MAIN_TABLE_ALIAS } from './sql_alias.utils.js';

interface GenerateSqlOptions {
  tableName: string;
  where?: string;
  join?: string;
  orderBy?: string;
  limit?: number;
  offset?: number;
  hasJoin?: boolean;
  metadata: EntityMetadata;
}

/**
 * SQL 生成结果：完整的 SQL 语句与可选的参数绑定。
 */
export interface GenerateSqlResult {
  sql: string;
  params?: SQLiteCompatibleType[];
}

/**
 * 校验分页参数，limit/offset 直接内联进 SQL，必须是非负整数
 */
const validate_pagination_value = (name: 'limit' | 'offset', value?: number): void => {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: ${value} — must be a non-negative integer`);
  }
};

/**
 * 排序方向与组合器都是直接拼进 SQL 的**裸 token**，不能靠 TS 类型保证 —— 运行时值可能来自
 * 网络负载、URL 参数或已漂移的调用方。放行任意字符串等于给出多语句注入口子（SQLC-005）。
 */
const SORT_DIRECTIONS = new Set(['asc', 'desc', 'ASC', 'DESC']);
const COMBINATORS = new Set(['and', 'or', 'AND', 'OR']);

const assert_sort_direction = (sort: unknown): string => {
  if (typeof sort !== 'string' || !SORT_DIRECTIONS.has(sort)) {
    throw new RxDBAdapterSqliteError(`Invalid sort direction: ${String(sort)}`);
  }
  return sort;
};

const assert_combinator = (combinator: unknown): string => {
  if (typeof combinator !== 'string' || !COMBINATORS.has(combinator)) {
    throw new RxDBAdapterSqliteError(`Invalid combinator: ${String(combinator)}`);
  }
  return combinator;
};

/**
 * 构建排序 SQL
 *
 * @remarks
 * `fieldAliasMap` 必须来自 `build_rule_group_join`（把 orderBy 一并传进去），否则关系路径与
 * keyValue 路径拿不到别名：`resolve_column_name` 只认本表 propertyMap，`owner.name` 这类字符串会被
 * 原样当作列名拼成 `_."owner.name"`，SQLite 直接报 no such column（SQLC-025）。
 *
 * @param orderBy 排序条件
 * @param metadata 实体元数据
 * @param adapter SQLite 适配器实例
 * @param fieldAliasMap 字段到 JOIN 别名 / json_extract 表达式的映射
 * @returns SQL 排序子句
 */
export const build_order_by = (
  orderBy?: OrderBy[],
  metadata?: EntityMetadata,
  adapter?: RxDBAdapterSqliteBase,
  fieldAliasMap?: Map<string, string>
): string | undefined => {
  if (!orderBy?.length) return undefined;
  return orderBy
    .map(o => {
      if (resolve_query_property(o.field, metadata, adapter)?.type === PropertyType.binary) {
        throw new RxDBAdapterSqliteError(`Binary field "${o.field}" does not support sorting`);
      }
      const fieldSql =
        fieldAliasMap?.get(o.field) ??
        `${MAIN_TABLE_ALIAS}.${quote_sql_identifier(resolve_column_name(o.field, metadata))}`;
      return `${fieldSql} ${assert_sort_direction(o.sort)}`;
    })
    .join(', ');
};

/**
 * 生成 ruleGroup sql 查询条件
 * @param ruleGroup 规则组对象
 * @param fieldAliasMap 字段别名映射
 * @param entityMetadata 实体元数据（可选）
 * @param adapter SQLite 适配器实例（可选，用于 EXISTS 查询）
 * @param params bigint/binary 查询参数收集器
 * @returns SQL 条件字符串
 */
export const buildRuleGroup = <RG extends RuleGroup>(
  ruleGroup: RG,
  fieldAliasMap: Map<string, string> = new Map(),
  entityMetadata?: EntityMetadata,
  adapter?: RxDBAdapterSqliteBase,
  params?: SQLiteCompatibleType[]
): string => {
  if (!ruleGroup?.rules) return '';
  const processedRules = ruleGroup.rules
    .map(ruleOrRuleGroup => {
      if ('combinator' in ruleOrRuleGroup) {
        return buildRuleGroup(ruleOrRuleGroup, fieldAliasMap, entityMetadata, adapter, params);
      }
      return build_rule(ruleOrRuleGroup, fieldAliasMap, entityMetadata, adapter, buildRuleGroup, params);
    })
    .filter(Boolean);

  if (!processedRules.length) return '';
  if (processedRules.length === 1) return processedRules[0];

  return `(${processedRules.join(` ${assert_combinator(ruleGroup.combinator)} `)})`;
};

/**
 * 生成 SQL 查询语句
 * @param options SQL 生成选项
 * @returns 完整的 SQL 语句
 */
export const generate_sql = (options: GenerateSqlOptions): string => {
  const { tableName, where, limit, offset, orderBy, join, hasJoin, metadata } = options;

  let selectClause = `${MAIN_TABLE_ALIAS}.rowid as ${ROWID}, ${MAIN_TABLE_ALIAS}.*`;

  // 处理树形结构的特殊字段
  if (metadata.features?.tree?.hasChildren && metadata.features?.tree?.type === 'adjacency-list') {
    const parentRelation = metadata.relationMap.get('parent')! as EntityRelationManyToOneMetadata;
    const parentColumnName = parentRelation.columnName;
    // 主键物理列名可被 columnName 改写（SQLC-014）
    selectClause += `, EXISTS(SELECT 1 FROM ${quote_sql_identifier(tableName)} __sub WHERE __sub.${quote_sql_identifier(parentColumnName)} = ${MAIN_TABLE_ALIAS}.${quote_sql_identifier(get_primary_key_column(metadata))}) AS "hasChildren"`;
  }

  const parts = [
    `SELECT ${hasJoin ? 'DISTINCT ' : ''}${selectClause} FROM ${quote_sql_identifier(tableName)} ${MAIN_TABLE_ALIAS}`
  ];
  if (join) parts.push(join);
  if (where) parts.push(` WHERE ${where}`);
  if (orderBy) parts.push(` ORDER BY ${orderBy}`);
  validate_pagination_value('limit', limit);
  validate_pagination_value('offset', offset);
  if (limit !== undefined) parts.push(` LIMIT ${limit}`);
  if (offset !== undefined) {
    // SQLite 语法要求 OFFSET 必须跟在 LIMIT 之后，LIMIT -1 表示不限制行数
    if (limit === undefined) parts.push(' LIMIT -1');
    parts.push(` OFFSET ${offset}`);
  }
  return parts.join('') + ';';
};
