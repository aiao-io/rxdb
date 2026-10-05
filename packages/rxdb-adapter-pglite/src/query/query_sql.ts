import {
  type CountOptions,
  type EntityData,
  type EntityMetadata,
  type EntityMetadataResolver,
  type EntityPropertyMetadata,
  type FindAllOptions,
  type FindOptions,
  isManualOrderEntity,
  manualOrderGroupFields,
  type OrderBy,
  PropertyType,
  type RuleGroup,
  SORT_ORDER_FIELD
} from '@aiao/rxdb';
import {
  getTableNameByMetadata,
  INVALID_QUERY_ERROR_CODE,
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
  if (!isRecord(value) || typeof value['combinator'] !== 'string' || !Array.isArray(value['rules'])) {
    throw new RxdbAdapterPGliteError('Invalid query rule group', INVALID_QUERY_ERROR_CODE);
  }
  return { combinator: value['combinator'], rules: value['rules'] };
};

const readRule = (value: unknown): RuntimeRule => {
  if (!isRecord(value) || typeof value['field'] !== 'string' || typeof value['operator'] !== 'string') {
    throw new RxdbAdapterPGliteError('Invalid query rule', INVALID_QUERY_ERROR_CODE);
  }
  return { field: value['field'], operator: value['operator'], value: value['value'] };
};

const isRuleGroup = (value: unknown): boolean => isRecord(value) && Array.isArray(value['rules']);

const assertSafeIdentifier = (value: string, label: string): void => {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new RxdbAdapterPGliteError(`Invalid ${label}: ${value}`, INVALID_QUERY_ERROR_CODE);
  }
};

const assertSafeJsonPath = (parts: string[]): void => {
  if (parts.some(part => !SAFE_JSON_PATH_SEGMENT.test(part))) {
    throw new RxdbAdapterPGliteError(`Invalid JSON path: ${parts.join('.')}`, INVALID_QUERY_ERROR_CODE);
  }
};

const resolve_column_name = (fieldName: string, entityMetadata?: EntityMetadata): string => {
  if (fieldName.includes('.')) {
    throw new RxdbAdapterPGliteError(`Invalid direct query field: ${fieldName}`, INVALID_QUERY_ERROR_CODE);
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

  throw new RxdbAdapterPGliteError(`Unknown query field: ${fieldName}`, INVALID_QUERY_ERROR_CODE);
};

const formatColumn = (columnName: string): string => quoteIdentifier(columnName);

/**
 * 可空列的 NULLS 方向
 *
 * @remarks
 * 约定 NULL 是最小值（asc 靠前、desc 靠后），与 SQLite、JS 比较器 `compareOrderValues` 以及
 * `Repository.findByCursor` 的游标谓词一致；PostgreSQL 默认相反（asc 时 NULLS LAST）。
 * 非空列不写：结果相同，且显式 NULLS FIRST 会让默认 btree 索引无法用于正向扫描。
 * 外键列不在 propertyMap 里，按可空处理。
 */
const nulls_order = (sort: 'asc' | 'desc', property?: EntityPropertyMetadata): string => {
  if (property && !property.nullable) return '';
  return sort === 'asc' ? ' NULLS FIRST' : ' NULLS LAST';
};

/** varchar 落盘的列类型：比较才受库 locale 影响 */
const TEXT_PROPERTY_TYPES: ReadonlySet<string> = new Set([PropertyType.string, PropertyType.enum]);

/**
 * 外键列的类型：跟关联实体的主键走，与 `create_table_sql` 建外键列时同源
 *
 * 外键不在 `propertyMap` 里；关联实体用 string 主键时外键就是文本列，不能当 uuid 看。
 */
const foreign_key_type = (
  field: string,
  metadata: EntityMetadata,
  resolve?: EntityMetadataResolver
): string | undefined => {
  const relation = metadata.foreignKeyRelationMap.get(field);
  if (!relation) return undefined;
  if (!resolve) {
    throw new RxdbAdapterPGliteError(
      `Foreign key "${field}" needs an entity metadata resolver to decide its collation`,
      INVALID_QUERY_ERROR_CODE
    );
  }
  const mapped = resolve(relation.mappedEntity, relation.mappedNamespace ?? metadata.namespace);
  if (!mapped) {
    throw new RxdbAdapterPGliteError(`Mapped entity metadata '${relation.mappedEntity}' not found`);
  }
  return Array.from(mapped.propertyMap.values()).find(property => (property as { primary?: boolean }).primary)?.type;
};

/** 手动排序实体里要按码点比较的列：`sortOrder` 与文本类分组字段（含文本外键） */
const is_code_point_field = (field: string, metadata: EntityMetadata, resolve?: EntityMetadataResolver): boolean => {
  if (field === SORT_ORDER_FIELD) return true;
  if (!manualOrderGroupFields(metadata).includes(field)) return false;
  const type = metadata.propertyMap.get(field)?.type ?? foreign_key_type(field, metadata, resolve);
  return type !== undefined && TEXT_PROPERTY_TYPES.has(type);
};

/**
 * 手动排序键与文本分组字段的显式 collation（US-028）
 *
 * 分数索引键按码点比较才有序；PostgreSQL 的文本比较跟随库的 locale，非 `C` 时 `'Zz'` 与 `'a0'` 会翻转，
 * 与核心、SQLite（TEXT 默认 BINARY）给出不同顺序。分组字段打头参与默认排序，string / enum 分组字段与
 * 指向 string 主键的外键同理；uuid / boolean / 非文本外键不是文本，其余字段与普通实体都不动。
 */
const manual_order_collate = (field: string, metadata?: EntityMetadata, resolve?: EntityMetadataResolver): string =>
  metadata && isManualOrderEntity(metadata) && is_code_point_field(field, metadata, resolve) ? ' COLLATE "C"' : '';

const build_order_by = (
  orderBy?: OrderBy[],
  metadata?: EntityMetadata,
  resolve?: EntityMetadataResolver
): string | undefined => {
  if (!orderBy?.length) return undefined;
  return orderBy
    .map(item => {
      const sort = String(item.sort).toLowerCase();
      if (sort !== 'asc' && sort !== 'desc') {
        throw new RxdbAdapterPGliteError(`Invalid sort direction: ${String(item.sort)}`, INVALID_QUERY_ERROR_CODE);
      }
      const property = metadata?.propertyMap.get(item.field);
      if (property?.type === PropertyType.binary) {
        throw new RxdbAdapterPGliteError(
          `Binary property "${item.field}" does not support sorting`,
          INVALID_QUERY_ERROR_CODE
        );
      }
      const columnName = resolve_column_name(item.field, metadata);
      const collate = manual_order_collate(item.field, metadata, resolve);
      return `${MAIN_TABLE_ALIAS}.${quoteIdentifier(columnName)}${collate} ${sort.toUpperCase()}${nulls_order(sort, property)}`;
    })
    .join(', ');
};

/**
 * 本实体列的表限定前缀
 *
 * @remarks
 * 主查询有 JOIN 时为主表别名 `_`；树查询递归成员里为 `children`——递归表 `c` 与 `children`
 * 列同名，不限定会报 42702 列名歧义（RV-045）。
 */
const qualify = (tableAlias: string | undefined, columnSql: string): string =>
  tableAlias ? `${tableAlias}.${columnSql}` : columnSql;

const get_field_sql = (
  originalField: string,
  aliasField?: string,
  entityMetadata?: EntityMetadata,
  tableAlias?: string,
  kind: JsonAccessorKind = 'text'
): string => {
  if (aliasField) return aliasField;

  if (!originalField.includes('.')) {
    const columnName = resolve_column_name(originalField, entityMetadata);
    return qualify(tableAlias, formatColumn(columnName));
  }

  const parts = originalField.split('.');
  const baseField = parts[0];
  const prop = entityMetadata?.propertyMap.get(baseField);
  if (prop && (prop.type === PropertyType.json || prop.type === PropertyType.keyValue)) {
    const jsonPath = parts.slice(1);
    assertSafeJsonPath(jsonPath);
    return jsonAccessor(qualify(tableAlias, quoteIdentifier(prop.columnName)), jsonPath, kind);
  }

  if (entityMetadata) {
    throw new RxdbAdapterPGliteError(`Unknown relation query field: ${originalField}`, INVALID_QUERY_ERROR_CODE);
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
    throw new RxdbAdapterPGliteError(`Unsupported query operator: ${operator}`, INVALID_QUERY_ERROR_CODE);
  }
};

const assertPropertyOperator = (property: ReturnType<typeof getProperty>, operator: string): void => {
  if (property?.type === PropertyType.binary && !BINARY_OPERATORS.has(operator)) {
    throw new RxdbAdapterPGliteError(
      `Binary property "${property.name}" does not support operator ${operator}`,
      INVALID_QUERY_ERROR_CODE
    );
  }
  if (property?.type === PropertyType.bigint && PATTERN_OPERATORS.has(operator)) {
    throw new RxdbAdapterPGliteError(
      `Bigint property "${property.name}" does not support operator ${operator}`,
      INVALID_QUERY_ERROR_CODE
    );
  }
};

const transformQueryValue = (value: unknown, property: ReturnType<typeof getProperty>): unknown => {
  if (property?.type !== PropertyType.bigint && property?.type !== PropertyType.binary) return value;
  return transformValueJsToPGlite(value, property);
};

/**
 * keyValue 列的 contains/notContains：逐键展开成 `->>` 文本比较后按 LIKE 组合
 * （contains 是 OR、notContains 是 AND），与核心 JS `get_entity_match_rule`、sqlite-core
 * `handle_flatmap_contains` 同一套逐键字面子串语义，不落到 `PropertyType.json` 已有的
 * `@>` JSONB 子集包含上（RV-027）。
 *
 * 缺失键/显式 JSON null 时 `->>` 取出 SQL NULL：`LIKE` 对 NULL 的结果是三值逻辑的 UNKNOWN，
 * 在 OR 组合里天然不贡献命中、在 AND 组合里天然不会被当成"确定不包含"而放行，不需要显式判空
 * ——与核心 JS 把缺失键视为 UNKNOWN（既不计入 contains 命中也不满足 notContains）殊途同归（RV-028）。
 */
const build_keyvalue_contains_pg = (
  fieldSql: string,
  operator: 'contains' | 'notContains',
  value: Record<string, unknown>,
  params: unknown[]
): string => {
  const entries = Object.entries(value).filter(([, v]) => v != null);
  // 空条件集按 contains/notContains 各自组合算子的空集代数求值：OR 的空集恒假、AND 的空集恒真，
  // 与「空数组 in/notIn」同一口径（见上面 `in`/`notIn` 的空候选集处理）。
  if (!entries.length) return operator === 'contains' ? '1=0' : '1=1';

  const conditions = entries.map(([key, v]) => {
    const text = jsonAccessor(fieldSql, [key], 'text');
    params.push(`%${escapeLikePattern(`${v}`)}%`);
    const likeSql = `${text} LIKE $${params.length}`;
    return operator === 'notContains' ? `NOT (${likeSql})` : likeSql;
  });
  return `(${conditions.join(operator === 'contains' ? ' OR ' : ' AND ')})`;
};

const build_rule_pg = (
  ruleValue: unknown,
  params: unknown[],
  fieldAliasMap: Map<string, FieldAlias>,
  entityMetadata?: EntityMetadata,
  tableAlias?: string,
  resolve?: EntityMetadataResolver
): string => {
  const rule = readRule(ruleValue);
  assertOperator(rule.operator);

  const alias = fieldAliasMap.get(rule.field);
  const fieldSql = get_field_sql(rule.field, alias?.text, entityMetadata, tableAlias);
  const prop = getProperty(rule.field, entityMetadata);
  const { operator, value } = rule;
  assertPropertyOperator(prop, operator);
  // 连接表上的同名字段不是本实体的排序键
  const orderCollate = alias ? '' : manual_order_collate(rule.field, entityMetadata, resolve);

  if (operator === 'null' || operator === 'notNull') {
    return operator === 'null' ? `${fieldSql} IS NULL` : `${fieldSql} IS NOT NULL`;
  }

  if (value === null) {
    if (operator === '=') return `${fieldSql} IS NULL`;
    if (operator === '!=') return `${fieldSql} IS NOT NULL`;
    throw new RxdbAdapterPGliteError(`Operator ${operator} does not accept null`, INVALID_QUERY_ERROR_CODE);
  }
  if (value === undefined) {
    throw new RxdbAdapterPGliteError(`Operator ${operator} requires a value`, INVALID_QUERY_ERROR_CODE);
  }

  // in/notIn 的空候选集是两个 SQL 后端与核心 JS 都已归一化成的恒假/恒真常量
  // （sqlite-core `build_rule`、核心 `get_entity_match_rule` 的空集合短路），且不区分列类型/是否为
  // NULL——必须在下面按属性类型分流的数组重叠判断之前处理，否则空候选集会被 `&&` 编译成
  // "与空数组重叠恒假"，NULL 列上与 notIn 应有的恒真常量不一致。
  if ((operator === 'in' || operator === 'notIn') && Array.isArray(value) && value.length === 0) {
    return operator === 'in' ? '1=0' : '1=1';
  }

  if (prop && (prop.type === PropertyType.json || prop.type === PropertyType.keyValue)) {
    if (operator === 'contains' || operator === 'notContains') {
      if (!isRecord(value)) {
        throw new RxdbAdapterPGliteError(
          `JSON operator ${operator} requires an object value`,
          INVALID_QUERY_ERROR_CODE
        );
      }
      // keyValue 是既有的逐键字面子串谓词（与核心 JS、sqlite-core `handle_flatmap_contains`
      // 同一套契约：contains 是 OR、notContains 是 AND），不是 PropertyType.json 原生提供的
      // JSONB 子集包含——两者混进同一个 `@>` 分支会把「字面子串」误判成「对象子集相等」（RV-027）。
      if (prop.type === PropertyType.keyValue) {
        return build_keyvalue_contains_pg(fieldSql, operator, value, params);
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
      const jsonbField =
        alias ? alias.jsonb : get_field_sql(rule.field, undefined, entityMetadata, tableAlias, 'jsonb');
      if (jsonbField) {
        params.push(JSON.stringify(value));
        return `${jsonbField} ${operator} $${params.length}::jsonb`;
      }
    }
  }

  if (prop && (prop.type === PropertyType.stringArray || prop.type === PropertyType.numberArray)) {
    if (operator === 'in' || operator === 'notIn') {
      if (!Array.isArray(value)) {
        throw new RxdbAdapterPGliteError(`Operator ${operator} requires an array value`, INVALID_QUERY_ERROR_CODE);
      }
      const castType = prop.type === PropertyType.stringArray ? 'text[]' : 'numeric[]';
      params.push(value);
      // 核心 JS（`.some(item => value.includes(item))`）与 sqlite-core（`json_each` + IN）的
      // in/notIn 都是"数组列与候选值任一元素交集"；`@>` 是全包含（要求数组列包含所有候选值），
      // 会把交集查询误判成子集查询（RV-034）。`&&` 是数组重叠运算符，语义正是"至少一个公共元素"。
      const overlapSql = `${fieldSql} && $${params.length}::${castType}`;
      return operator === 'notIn' ? `NOT (${overlapSql})` : overlapSql;
    }
  }

  if (operator === 'in' || operator === 'notIn') {
    if (!Array.isArray(value)) {
      throw new RxdbAdapterPGliteError(`Operator ${operator} requires an array value`, INVALID_QUERY_ERROR_CODE);
    }
    params.push(value.map(item => transformQueryValue(item, prop)));
    return `${fieldSql} ${operator === 'in' ? '= ANY' : '!= ALL'}($${params.length})`;
  }

  if (operator === 'between' || operator === 'notBetween') {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new RxdbAdapterPGliteError(`Operator ${operator} requires a two-value array`, INVALID_QUERY_ERROR_CODE);
    }
    params.push(transformQueryValue(value[0], prop), transformQueryValue(value[1], prop));
    const sqlOperator = operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN';
    return `${fieldSql}${orderCollate} ${sqlOperator} $${params.length - 1} AND $${params.length}`;
  }

  if (PATTERN_OPERATORS.has(operator)) {
    if (typeof value !== 'string') {
      throw new RxdbAdapterPGliteError(`Operator ${operator} requires a string value`, INVALID_QUERY_ERROR_CODE);
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
    throw new RxdbAdapterPGliteError(`Unsupported query operator: ${operator}`, INVALID_QUERY_ERROR_CODE);
  }
  params.push(transformQueryValue(value, prop));
  if (prop?.type === PropertyType.uuid) {
    return `${fieldSql}::uuid ${operator} $${params.length}::uuid`;
  }
  // 等值不受 collation 影响，只有大小比较需要码点序
  const collate = operator === '=' || operator === '!=' ? '' : orderCollate;
  return `${fieldSql}${collate} ${operator} $${params.length}`;
};

export const buildRuleGroupPG = <RG extends RuleGroup<EntityData> = RuleGroup<EntityData>>(
  ruleGroup: RG,
  params: unknown[],
  fieldAliasMap: Map<string, FieldAlias> = new Map(),
  entityMetadata?: EntityMetadata,
  tableAlias?: string,
  resolve?: EntityMetadataResolver
): string => {
  const runtimeGroup = readRuleGroup(ruleGroup);
  const combinator = runtimeGroup.combinator.toLowerCase();
  if (combinator !== 'and' && combinator !== 'or') {
    throw new RxdbAdapterPGliteError(`Invalid query combinator: ${runtimeGroup.combinator}`, INVALID_QUERY_ERROR_CODE);
  }

  const processedRules = runtimeGroup.rules
    .map(ruleOrGroup =>
      isRuleGroup(ruleOrGroup) ?
        buildRuleGroupPG(
          ruleOrGroup as RuleGroup<EntityData>,
          params,
          fieldAliasMap,
          entityMetadata,
          tableAlias,
          resolve
        )
      : build_rule_pg(ruleOrGroup, params, fieldAliasMap, entityMetadata, tableAlias, resolve)
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

/** 按适配器的 schemaManager 解析关联实体元数据 */
export const metadata_resolver =
  (adapter: RxDBAdapterPGlite): EntityMetadataResolver =>
  (name, namespace) =>
    adapter.rxdb.schemaManager.getEntityMetadata(name, namespace);

export const generate_find_sql = (
  adapter: RxDBAdapterPGlite,
  metadata: EntityMetadata,
  options: FindOptions | FindAllOptions
): GenerateSqlResult => {
  const resolve = metadata_resolver(adapter);
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
  const tableAlias = joinSQL.length > 0 ? MAIN_TABLE_ALIAS : undefined;
  const where =
    options.where ? buildRuleGroupPG(options.where, params, fieldAliasMap, metadata, tableAlias, resolve) : undefined;
  const orderBy = build_order_by(options.orderBy, metadata, resolve);
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
    throw new RxdbAdapterPGliteError('groupBy not supported in count queries', INVALID_QUERY_ERROR_CODE);
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
  const tableAlias = joinSQL.length > 0 ? MAIN_TABLE_ALIAS : undefined;
  const where =
    options.where ?
      buildRuleGroupPG(options.where, params, fieldAliasMap, metadata, tableAlias, metadata_resolver(adapter))
    : undefined;
  return { sql: generate_count_sql_helper({ tableName, where, join: joinSQL }), params };
};
