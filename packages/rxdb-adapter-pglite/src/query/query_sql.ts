import {
  type CountOptions,
  type EntityData,
  type EntityMetadata,
  type FindAllOptions,
  type FindOptions,
  type OrderBy,
  PropertyType,
  type RuleGroup
} from '@aiao/rxdb';
import {
  getTableNameByMetadata,
  quoteIdentifier,
  RxdbAdapterPGliteError,
  transformValueJsToPGlite
} from '../pglite.utils.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { build_rule_group_join_pg } from './join_sql.js';
import { type FieldAlias, jsonAccessor, type JsonAccessorKind, wantsJsonbComparison } from './json_accessor.js';
import { validateEncryptedQuery } from './validate-encrypted-query.js';

interface GenerateSqlOptions {
  tableName: string;
  where?: string;
  join?: string;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export interface GenerateSqlResult {
  sql: string;
  params: unknown[];
}

interface RuntimeRule {
  field: string;
  operator: string;
  value?: unknown;
}

interface RuntimeRuleGroup {
  combinator: string;
  rules: unknown[];
}

const MAIN_TABLE_ALIAS = '_' as const;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_JSON_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;
const COMPARISON_OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=']);
const PATTERN_OPERATORS = new Set([
  'contains',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith'
]);
const BINARY_OPERATORS = new Set(['=', '!=', 'null', 'notNull', 'in', 'notIn']);
/**
 * 转义 LIKE 模式里的通配符，使用户值只按字面量匹配
 *
 * `contains` / `startsWith` / `endsWith` 的语义是「字面子串/前缀/后缀」，但它们被编译成
 * `LIKE`，而 `%`（任意串）和 `_`（任意单字符）在 LIKE 里是通配符。不转义时
 * `startsWith('a_b')` 会连 `axb` 一起命中。
 *
 * PostgreSQL 的 `LIKE` 默认转义字符就是反斜杠，所以只需转义值本身，SQL 无需附加
 * `ESCAPE` 子句。反斜杠自身必须先转义，否则会吃掉后面补上的转义符。
 */
const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const SUPPORTED_OPERATORS = new Set([
  ...COMPARISON_OPERATORS,
  ...PATTERN_OPERATORS,
  'null',
  'notNull',
  'in',
  'notIn',
  'between',
  'notBetween'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRuleGroup = (value: unknown): RuntimeRuleGroup => {
  if (!isRecord(value) || typeof value.combinator !== 'string' || !Array.isArray(value.rules)) {
    throw new RxdbAdapterPGliteError('Invalid query rule group');
  }
  return { combinator: value.combinator, rules: value.rules };
};

const readRule = (value: unknown): RuntimeRule => {
  if (!isRecord(value) || typeof value.field !== 'string' || typeof value.operator !== 'string') {
    throw new RxdbAdapterPGliteError('Invalid query rule');
  }
  return { field: value.field, operator: value.operator, value: value.value };
};

const isRuleGroup = (value: unknown): boolean => isRecord(value) && Array.isArray(value.rules);

const assertSafeIdentifier = (value: string, label: string): void => {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new RxdbAdapterPGliteError(`Invalid ${label}: ${value}`);
  }
};

const assertSafeJsonPath = (parts: string[]): void => {
  if (parts.some(part => !SAFE_JSON_PATH_SEGMENT.test(part))) {
    throw new RxdbAdapterPGliteError(`Invalid JSON path: ${parts.join('.')}`);
  }
};

const resolve_column_name = (fieldName: string, entityMetadata?: EntityMetadata): string => {
  if (fieldName.includes('.')) {
    throw new RxdbAdapterPGliteError(`Invalid direct query field: ${fieldName}`);
  }
  if (!entityMetadata) {
    assertSafeIdentifier(fieldName, 'query field');
    return fieldName;
  }

  const property = entityMetadata.propertyMap.get(fieldName);
  if (property) return property.columnName;

  const foreignKeyNames = entityMetadata.foreignKeyNames ?? [];
  const foreignKeyColumnNames = entityMetadata.foreignKeyColumnNames ?? foreignKeyNames;
  const fkIndex = foreignKeyNames.indexOf(fieldName);
  if (fkIndex >= 0) return foreignKeyColumnNames[fkIndex];

  throw new RxdbAdapterPGliteError(`Unknown query field: ${fieldName}`);
};

const formatColumn = (columnName: string): string => quoteIdentifier(columnName);

const build_order_by = (orderBy?: OrderBy[], metadata?: EntityMetadata): string | undefined => {
  if (!orderBy?.length) return undefined;
  return orderBy
    .map(item => {
      const sort = String(item.sort).toLowerCase();
      if (sort !== 'asc' && sort !== 'desc') {
        throw new RxdbAdapterPGliteError(`Invalid sort direction: ${String(item.sort)}`);
      }
      const property = metadata?.propertyMap.get(item.field);
      if (property?.type === PropertyType.binary) {
        throw new RxdbAdapterPGliteError(`Binary property "${item.field}" does not support sorting`);
      }
      const columnName = resolve_column_name(item.field, metadata);
      return `${MAIN_TABLE_ALIAS}.${quoteIdentifier(columnName)} ${sort.toUpperCase()}`;
    })
    .join(', ');
};

const get_field_sql = (
  originalField: string,
  aliasField?: string,
  entityMetadata?: EntityMetadata,
  hasJoin?: boolean,
  kind: JsonAccessorKind = 'text'
): string => {
  if (aliasField) return aliasField;

  if (!originalField.includes('.')) {
    const columnName = resolve_column_name(originalField, entityMetadata);
    const prefix = hasJoin ? `${MAIN_TABLE_ALIAS}.` : '';
    return `${prefix}${formatColumn(columnName)}`;
  }

  const parts = originalField.split('.');
  const baseField = parts[0];
  const prop = entityMetadata?.propertyMap.get(baseField);
  if (prop && (prop.type === PropertyType.json || prop.type === PropertyType.keyValue)) {
    const jsonPath = parts.slice(1);
    assertSafeJsonPath(jsonPath);
    return jsonAccessor(quoteIdentifier(prop.columnName), jsonPath, kind);
  }

  if (entityMetadata) {
    throw new RxdbAdapterPGliteError(`Unknown relation query field: ${originalField}`);
  }

  parts.forEach(part => assertSafeIdentifier(part, 'query field'));
  const lastIndex = parts.length - 1;
  return `${quoteIdentifier(parts.slice(0, lastIndex).join('.'))}.${formatColumn(parts[lastIndex])}`;
};

const getProperty = (field: string, metadata?: EntityMetadata) => {
  if (!metadata) return undefined;
  return metadata.propertyMap.get(field.split('.')[0]);
};

const assertOperator = (operator: string): void => {
  if (!SUPPORTED_OPERATORS.has(operator)) {
    throw new RxdbAdapterPGliteError(`Unsupported query operator: ${operator}`);
  }
};

const assertPropertyOperator = (property: ReturnType<typeof getProperty>, operator: string): void => {
  if (property?.type === PropertyType.binary && !BINARY_OPERATORS.has(operator)) {
    throw new RxdbAdapterPGliteError(`Binary property "${property.name}" does not support operator ${operator}`);
  }
  if (property?.type === PropertyType.bigint && PATTERN_OPERATORS.has(operator)) {
    throw new RxdbAdapterPGliteError(`Bigint property "${property.name}" does not support operator ${operator}`);
  }
};

const transformQueryValue = (value: unknown, property: ReturnType<typeof getProperty>): unknown => {
  if (property?.type !== PropertyType.bigint && property?.type !== PropertyType.binary) return value;
  return transformValueJsToPGlite(value, property);
};

const build_rule_pg = (
  ruleValue: unknown,
  params: unknown[],
  fieldAliasMap: Map<string, FieldAlias>,
  entityMetadata?: EntityMetadata,
  hasJoin?: boolean
): string => {
  const rule = readRule(ruleValue);
  assertOperator(rule.operator);

  const alias = fieldAliasMap.get(rule.field);
  const fieldSql = get_field_sql(rule.field, alias?.text, entityMetadata, hasJoin);
  const prop = getProperty(rule.field, entityMetadata);
  const { operator, value } = rule;
  assertPropertyOperator(prop, operator);

  if (operator === 'null' || operator === 'notNull') {
    return operator === 'null' ? `${fieldSql} IS NULL` : `${fieldSql} IS NOT NULL`;
  }

  if (value === null) {
    if (operator === '=') return `${fieldSql} IS NULL`;
    if (operator === '!=') return `${fieldSql} IS NOT NULL`;
    throw new RxdbAdapterPGliteError(`Operator ${operator} does not accept null`);
  }
  if (value === undefined) {
    throw new RxdbAdapterPGliteError(`Operator ${operator} requires a value`);
  }

  if (prop && (prop.type === PropertyType.json || prop.type === PropertyType.keyValue)) {
    if (operator === 'contains' || operator === 'notContains') {
      if (!isRecord(value)) {
        throw new RxdbAdapterPGliteError(`JSON operator ${operator} requires an object value`);
      }
      params.push(JSON.stringify(value));
      const containsSql = `${fieldSql} @> $${params.length}::jsonb`;
      return operator === 'notContains' ? `NOT (${containsSql})` : containsSql;
    }

    // 数值/布尔比较改走 jsonb 操作数：`->>` 的结果是 text，`'10' > '9'` 按字典序
    // 为 false，`meta.count = 10` 查 `> 9` 会返回空集且不报错（PGL-006）。
    // 用 jsonb 而不是 `::numeric`：后者对异构数据会在运行期抛 22P02。
    if (COMPARISON_OPERATORS.has(operator) && wantsJsonbComparison(value)) {
      // join 路径必须用它自己算出的 jsonb 形态：拿 metadata 重算会得到主表列，
      // 与 alias 指向的连接表不是同一个东西。
      const jsonbField = alias ? alias.jsonb : get_field_sql(rule.field, undefined, entityMetadata, hasJoin, 'jsonb');
      if (jsonbField) {
        params.push(JSON.stringify(value));
        return `${jsonbField} ${operator} $${params.length}::jsonb`;
      }
    }
  }

  if (prop && (prop.type === PropertyType.stringArray || prop.type === PropertyType.numberArray)) {
    if (operator === 'in' || operator === 'notIn') {
      if (!Array.isArray(value)) {
        throw new RxdbAdapterPGliteError(`Operator ${operator} requires an array value`);
      }
      const castType = prop.type === PropertyType.stringArray ? 'text[]' : 'numeric[]';
      params.push(value);
      const containsSql = `${fieldSql} @> $${params.length}::${castType}`;
      return operator === 'notIn' ? `NOT ${containsSql}` : containsSql;
    }
  }

  if (operator === 'in' || operator === 'notIn') {
    if (!Array.isArray(value)) {
      throw new RxdbAdapterPGliteError(`Operator ${operator} requires an array value`);
    }
    if (value.length === 0) return operator === 'in' ? '1=0' : '1=1';
    params.push(value.map(item => transformQueryValue(item, prop)));
    return `${fieldSql} ${operator === 'in' ? '= ANY' : '!= ALL'}($${params.length})`;
  }

  if (operator === 'between' || operator === 'notBetween') {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new RxdbAdapterPGliteError(`Operator ${operator} requires a two-value array`);
    }
    params.push(transformQueryValue(value[0], prop), transformQueryValue(value[1], prop));
    const sqlOperator = operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN';
    return `${fieldSql} ${sqlOperator} $${params.length - 1} AND $${params.length}`;
  }

  if (PATTERN_OPERATORS.has(operator)) {
    if (typeof value !== 'string') {
      throw new RxdbAdapterPGliteError(`Operator ${operator} requires a string value`);
    }
    const literal = escapeLikePattern(value);
    const pattern =
      operator === 'contains' || operator === 'notContains' ? `%${literal}%`
      : operator === 'startsWith' || operator === 'notStartsWith' ? `${literal}%`
      : `%${literal}`;
    params.push(pattern);
    return `${fieldSql} ${operator.startsWith('not') ? 'NOT LIKE' : 'LIKE'} $${params.length}`;
  }

  if (!COMPARISON_OPERATORS.has(operator)) {
    throw new RxdbAdapterPGliteError(`Unsupported query operator: ${operator}`);
  }
  params.push(transformQueryValue(value, prop));
  if (prop?.type === PropertyType.uuid) {
    return `${fieldSql}::uuid ${operator} $${params.length}::uuid`;
  }
  return `${fieldSql} ${operator} $${params.length}`;
};

export const buildRuleGroupPG = <RG extends RuleGroup<EntityData> = RuleGroup<EntityData>>(
  ruleGroup: RG,
  params: unknown[],
  fieldAliasMap: Map<string, FieldAlias> = new Map(),
  entityMetadata?: EntityMetadata,
  hasJoin?: boolean
): string => {
  const runtimeGroup = readRuleGroup(ruleGroup);
  const combinator = runtimeGroup.combinator.toLowerCase();
  if (combinator !== 'and' && combinator !== 'or') {
    throw new RxdbAdapterPGliteError(`Invalid query combinator: ${runtimeGroup.combinator}`);
  }

  const processedRules = runtimeGroup.rules
    .map(ruleOrGroup =>
      isRuleGroup(ruleOrGroup) ?
        buildRuleGroupPG(ruleOrGroup as RuleGroup<EntityData>, params, fieldAliasMap, entityMetadata, hasJoin)
      : build_rule_pg(ruleOrGroup, params, fieldAliasMap, entityMetadata, hasJoin)
    )
    .filter(sql => sql.length > 0);

  if (processedRules.length === 0) return '';
  if (processedRules.length === 1) return processedRules[0];
  return `(${processedRules.join(` ${combinator.toUpperCase()} `)})`;
};

const generate_select_sql = (options: GenerateSqlOptions, params: unknown[]): string => {
  const distinct = options.join ? 'DISTINCT ' : '';
  let sql = `SELECT ${distinct}${MAIN_TABLE_ALIAS}.* FROM ${options.tableName} AS ${MAIN_TABLE_ALIAS}`;
  if (options.join) sql += ` ${options.join}`;
  if (options.where) sql += ` WHERE ${options.where}`;
  if (options.orderBy) sql += ` ORDER BY ${options.orderBy}`;
  if (options.limit !== undefined) {
    params.push(options.limit);
    sql += ` LIMIT $${params.length}`;
  }
  if (options.offset !== undefined && options.offset > 0) {
    params.push(options.offset);
    sql += ` OFFSET $${params.length}`;
  }
  return sql;
};

const generate_count_sql_helper = (options: GenerateSqlOptions): string => {
  const countExpression = options.join ? `COUNT(DISTINCT ${MAIN_TABLE_ALIAS}.id)` : 'COUNT(*)';
  let sql = `SELECT ${countExpression} as count FROM ${options.tableName} AS ${MAIN_TABLE_ALIAS}`;
  if (options.join) sql += ` ${options.join}`;
  if (options.where) sql += ` WHERE ${options.where}`;
  return sql;
};

export const generate_find_sql = (
  adapter: RxDBAdapterPGlite,
  metadata: EntityMetadata,
  options: FindOptions | FindAllOptions
): GenerateSqlResult => {
  validateEncryptedQuery(
    metadata,
    {
      where: options.where,
      orderBy: options.orderBy,
      groupBy: 'groupBy' in options ? options.groupBy : undefined,
      projection: 'projection' in options ? options.projection : undefined
    },
    (name, namespace) => adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace)
  );
  const tableName = getTableNameByMetadata(metadata);
  const params: unknown[] = [];
  const { joinSQL, fieldAliasMap } =
    options.where ?
      build_rule_group_join_pg(adapter, metadata, options.where)
    : { joinSQL: '', fieldAliasMap: new Map<string, FieldAlias>() };
  const hasJoin = joinSQL.length > 0;
  const where = options.where ? buildRuleGroupPG(options.where, params, fieldAliasMap, metadata, hasJoin) : undefined;
  const orderBy = build_order_by(options.orderBy, metadata);
  const limit = 'limit' in options ? options.limit : undefined;
  const offset = 'offset' in options ? options.offset : undefined;
  const sql = generate_select_sql({ tableName, where, join: joinSQL, orderBy, limit, offset }, params);
  return { sql, params };
};

export const generate_count_sql = (
  adapter: RxDBAdapterPGlite,
  metadata: EntityMetadata,
  options: CountOptions
): GenerateSqlResult => {
  if (options.groupBy) {
    throw new RxdbAdapterPGliteError('groupBy not supported in count queries');
  }
  validateEncryptedQuery(metadata, { where: options.where }, (name, namespace) =>
    adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace)
  );

  const tableName = getTableNameByMetadata(metadata);
  const params: unknown[] = [];
  const { joinSQL, fieldAliasMap } =
    options.where ?
      build_rule_group_join_pg(adapter, metadata, options.where)
    : { joinSQL: '', fieldAliasMap: new Map<string, FieldAlias>() };
  const hasJoin = joinSQL.length > 0;
  const where = options.where ? buildRuleGroupPG(options.where, params, fieldAliasMap, metadata, hasJoin) : undefined;
  return { sql: generate_count_sql_helper({ tableName, where, join: joinSQL }), params };
};
