import {
  EntityMetadata,
  EntityRelationManyToManyMetadata,
  EntityRelationManyToOneMetadata,
  EntityRelationMetadata,
  EntityRelationOneToOneMetadata,
  PropertyType,
  RelationKind,
  RuleGroup,
  tryGetEntityMetadata,
  type EntityPropertyMetadata,
  type WorktreeTableSet
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import {
  get_primary_key_column,
  get_sql_value,
  quote_sql_identifier,
  RxDBAdapterSqliteError,
  transformValueJsToSqlite
} from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import { build_rule_group_join } from './join_sql.js';
import {
  allocate_scope_alias,
  format_qualified_identifier,
  format_table_alias,
  MAIN_RULE_SCOPE,
  MAIN_TABLE_ALIAS,
  type RuleScope
} from './sql_alias.utils.js';

export { format_table_alias, get_relation_key, MAIN_RULE_SCOPE, MAIN_TABLE_ALIAS } from './sql_alias.utils.js';
export type { RelationPair, RuleScope } from './sql_alias.utils.js';

/**
 * SQL 构建层消费的查询规则结构（结构化子集，避免 Rule 联合的繁琐窄化）。
 */
interface QueryRuleValue {
  operator: string;
  value?: unknown;
  where?: RuleGroup;
}

interface QueryRule extends QueryRuleValue {
  field: string;
}

/**
 * EXISTS 子查询的 where 编译结果
 *
 * @remarks
 * `where` 里的关系路径（`items.productName`）需要在子查询内部再挂 JOIN，
 * 而 JOIN 只能放在 FROM 后面，因此条件与 JOIN 必须分开返回（SQLC-010）。
 */
export interface ExistsSubquery {
  /**
   * 子查询的 WHERE 条件
   */
  where: string;

  /**
   * 子查询内部关系路径产生的 JOIN 子句（自带前导空格），无关系路径时为空串
   */
  join: string;
}

/**
 * 一层 EXISTS 子查询分到的别名
 *
 * @remarks
 * `alias` 是子查询根表别名（顶层下是 `child`，再深一层是 `child_2`……），`reservedAliases`
 * 已含外层各级与本层新分的两个别名，子查询的 where 照它编译即可（见 {@link RuleScope}）。
 */
export interface ExistsScope extends RuleScope {
  /** 外层实体（关联条件里「当前实体」那一侧）的别名 */
  readonly outerAlias: string;
  /** MANY_TO_MANY 中间表的别名 */
  readonly junctionAlias: string;
}

const EXISTS_CHILD_ALIAS = 'child';
const EXISTS_JUNCTION_ALIAS = 'junction';

/**
 * 为外层作用域里的一条 EXISTS 分配子查询别名
 *
 * @remarks
 * 新分的两个别名都并进 `reservedAliases`：关系名恰好叫 `child` / `junction` 时，子查询里的
 * JOIN 规划不会再生成同名别名把子查询根表或中间表遮住。
 *
 * @param scope - EXISTS 规则所在的作用域
 * @returns 子查询的作用域；顶层下与原先固定的 `child` / `junction` 相同
 */
export const exists_scope_of = (scope: RuleScope): ExistsScope => {
  const alias = allocate_scope_alias(EXISTS_CHILD_ALIAS, scope.reservedAliases);
  const junctionAlias = allocate_scope_alias(EXISTS_JUNCTION_ALIAS, [...scope.reservedAliases, alias]);
  return {
    outerAlias: scope.alias,
    alias,
    junctionAlias,
    reservedAliases: [...scope.reservedAliases, alias, junctionAlias]
  };
};

/**
 * 操作符映射
 *
 * @remarks
 * 子串类操作符（contains / startsWith / endsWith 及其取反）刻意不在这里 —— 它们没有对应的
 * 中缀 SQL 操作符，改由 {@link build_substring_condition} 编译成 `instr` / `substr`（SQLC-007）。
 */
const OPERATOR_MAP: Record<string, string> = {
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  in: 'IN',
  notIn: 'NOT IN',
  between: 'BETWEEN',
  notBetween: 'NOT BETWEEN'
} as const;

/**
 * 编译成 `instr` / `substr` 而非中缀操作符的子串类操作符
 */
const SUBSTRING_OPERATORS: ReadonlySet<string> = new Set([
  'contains',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith'
]);

const BIGINT_QUERY_OPERATORS = new Set([
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'in',
  'notIn',
  'between',
  'notBetween',
  'null',
  'notNull'
]);

const BINARY_QUERY_OPERATORS = new Set(['=', '!=', 'in', 'notIn', 'null', 'notNull']);

export const resolve_query_property = (
  field: string,
  entityMetadata?: EntityMetadata,
  adapter?: RxDBAdapterSqliteBase
): EntityPropertyMetadata | undefined => {
  if (!entityMetadata) return undefined;
  const directProperty = entityMetadata.propertyMap.get(field);
  if (directProperty) return directProperty;

  const foreignKeyRelation = entityMetadata.foreignKeyRelationMap?.get(field);
  if (foreignKeyRelation && adapter) {
    return adapter.rxdb.schemaManager
      .getEntityMetadata(
        foreignKeyRelation.mappedEntity,
        foreignKeyRelation.mappedNamespace ?? entityMetadata.namespace
      )
      ?.propertyMap.get('id');
  }

  if (!field.includes('.') || !adapter) return undefined;
  try {
    return adapter.rxdb.schemaManager.getFieldRelations(entityMetadata, field).property;
  } catch {
    return undefined;
  }
};

const validate_typed_query_operator = (rule: QueryRule, property?: EntityPropertyMetadata): void => {
  if (property?.type === PropertyType.bigint && !BIGINT_QUERY_OPERATORS.has(rule.operator)) {
    throw new RxDBAdapterSqliteError(`Unsupported bigint query operator "${rule.operator}" for field "${rule.field}"`);
  }
  if (property?.type === PropertyType.binary && !BINARY_QUERY_OPERATORS.has(rule.operator)) {
    throw new RxDBAdapterSqliteError(`Unsupported binary query operator "${rule.operator}" for field "${rule.field}"`);
  }
};

const bind_query_parameter = (
  value: unknown,
  property: EntityPropertyMetadata,
  params: SQLiteCompatibleType[]
): void => {
  const transformed = transformValueJsToSqlite(value, property);
  if (transformed === undefined) {
    throw new TypeError(`Query value for ${property.name} cannot be undefined`);
  }
  params.push(transformed);
};

const bind_typed_rule_value = (
  rule: QueryRule,
  property: EntityPropertyMetadata,
  params?: SQLiteCompatibleType[]
): string => {
  if (!params) {
    throw new RxDBAdapterSqliteError(`Query parameters are required for ${property.type} field "${rule.field}"`);
  }

  if (rule.operator === 'in' || rule.operator === 'notIn') {
    if (!Array.isArray(rule.value)) return '';
    rule.value.forEach(value => bind_query_parameter(value, property, params));
    return `(${rule.value.map(() => '?').join(', ')})`;
  }

  if (rule.operator === 'between' || rule.operator === 'notBetween') {
    if (!Array.isArray(rule.value) || rule.value.length < 2) return '';
    const [first, second] = rule.value;
    if (first == null || second == null) return '';
    bind_query_parameter(first, property, params);
    bind_query_parameter(second, property, params);
    return '? AND ?';
  }

  bind_query_parameter(rule.value, property, params);
  return '?';
};

/**
 * 将 JS 属性名解析为数据库列名
 * 如果 entityMetadata 存在，优先使用 columnName
 * 支持嵌套路径，如 keyValue.string
 */
export const resolve_column_name = (fieldName: string, entityMetadata?: EntityMetadata): string => {
  // 处理嵌套路径，如 keyValue.string
  if (entityMetadata && fieldName.includes('.')) {
    const parts = fieldName.split('.');
    // 找到顶层的 keyValue 属性
    const topProp = entityMetadata.propertyMap.get(parts[0]);
    if (!topProp) return fieldName;

    // 如果顶层是 keyValue，返回其 columnName（内部属性没有独立的 columnName）
    if (topProp.type === PropertyType.keyValue) {
      // keyValue 内部属性的路径，如 'string' 或 'nested.deep.value'
      // 这些内部属性没有独立的 columnName，使用 keyValue 的 columnName
      return topProp.columnName;
    }

    // 处理其他可能的嵌套类型
    // 只查找直到遇到 keyValue
    for (let i = 0; i < parts.length - 1; i++) {
      const prop = entityMetadata.propertyMap.get(parts[i]);
      if (!prop) return fieldName;

      // 如果是 keyValue 类型，直接返回其 columnName
      if (prop.type === PropertyType.keyValue) {
        return prop.columnName;
      }
    }

    // 处理最后一层
    const lastProp = entityMetadata.propertyMap.get(parts[parts.length - 1]);
    if (lastProp) {
      return lastProp.columnName;
    }
    return fieldName;
  }

  if (entityMetadata) {
    // 先查属性
    const property = entityMetadata.propertyMap.get(fieldName);
    if (property) {
      return property.columnName;
    }
    // 再查外键
    const foreignKeyNames = entityMetadata.foreignKeyNames || [];
    const foreignKeyColumnNames = entityMetadata.foreignKeyColumnNames || foreignKeyNames;
    const fkIndex = foreignKeyNames.indexOf(fieldName);
    if (fkIndex !== -1) {
      return foreignKeyColumnNames[fkIndex];
    }
  }
  return fieldName;
};

/**
 * 获取字段的 SQL 表示
 *
 * @param tableAlias 没有别名映射的本表字段挂在哪个表别名上，缺省是顶层主表 `_`
 */
export const get_field_sql = (
  originalField: string,
  aliasField?: string,
  entityMetadata?: EntityMetadata,
  tableAlias: string = MAIN_TABLE_ALIAS
): string => {
  if (aliasField) return aliasField;
  // 对于没有点号的字段（本层主表字段），添加本层主表别名前缀
  if (!originalField.includes('.')) {
    return format_qualified_identifier(tableAlias, resolve_column_name(originalField, entityMetadata));
  }
  const lastIdx = originalField.lastIndexOf('.');
  const pathAlias = originalField.slice(0, lastIdx);
  const fieldName = originalField.slice(lastIdx + 1);
  // 对带点号的字段也做 columnName 映射
  const columnName = resolve_column_name(fieldName, entityMetadata);
  return `${quote_sql_identifier(pathAlias)}.${quote_sql_identifier(columnName)}`;
};

/**
 * 获取规则值的 SQL 表示
 *
 * @remarks
 * 子串类操作符不在这里拼模式串 —— 它们的值原样返回字面量，`%` `_` 由
 * {@link build_substring_condition} 当普通字符处理（SQLC-007）。
 *
 * @param rule 规则对象
 * @returns SQL 值字符串
 */
export const get_rule_value = (rule: QueryRuleValue): string => {
  const { operator, value } = rule;

  switch (operator) {
    case 'in':
    case 'notIn':
      return format_in_values(value);

    case 'between':
    case 'notBetween':
      return format_between_values(value);

    default:
      return format_value(value);
  }
};

/**
 * 获取SQL操作符
 * @param operator
 * @returns
 */
export const get_sql_operator = (operator: string): string => {
  const mapped = OPERATOR_MAP[operator];
  if (mapped === undefined) {
    throw new RxDBAdapterSqliteError(`Unsupported query operator: ${operator}`);
  }
  return mapped;
};

/**
 * 格式化 IN/NOT IN 操作符的值
 *
 * @param value - 规则值，非数组或空数组时退化为 `(NULL)`
 * @returns 可直接拼进 SQL 的括号列表
 * @throws {TypeError} 元素无法表示为 SQL 字面量时
 *
 * @remarks
 * 不能直接 `map(get_sql_value).join()`：`get_sql_value` 对 `Date` / `Uint8Array` / 数字数组
 * **返回对象本身**（那是给参数绑定用的返回形态，不是字面量）。直接 join 会把 `Date`
 * `toString()` 成 `Wed Jul 29 2026 ...` 这类带空格的裸文本拼进 SQL —— 直接语法错误。
 *
 * 这里只接受能安全转成字面量的标量：字符串 / 数字 / bigint / 布尔 / null 由 `get_sql_value`
 * 返回字符串或数字；`Date` 单独转成 ISO 串、再按字符串转义（与 `format_value` 同口径）；其余（二进制、
 * 嵌套数组）在 IN 列表里本就无合法字面量形式，fail-fast 而不是拼出非法 SQL。
 */
const format_in_values = (value: unknown): string => {
  if (!Array.isArray(value)) return '(NULL)';
  if (!value.length) return '(NULL)';
  const literals = value.map(item => {
    if (item instanceof Date) return get_sql_value(item.toISOString()) as string;
    const literal = get_sql_value(item);
    if (typeof literal === 'string' || typeof literal === 'number' || typeof literal === 'bigint') return literal;
    if (typeof literal === 'boolean') return literal ? 1 : 0;
    throw new TypeError(
      `IN/NOT IN does not support ${Object.prototype.toString.call(item)} values: no valid SQL literal form.`
    );
  });
  return `(${literals.join(', ')})`;
};

/**
 * 格式化 BETWEEN/NOT BETWEEN 操作符的值
 *
 * @returns 可拼进 SQL 的 `a and b`；边界缺失或为空时返回 `''`，由 {@link build_rule} 翻成恒真/恒假常量
 *
 * @remarks
 * 空串是**「本规则匹配空集」**的哨兵，不是「本规则不存在」。区别是致命的：调用链上
 * `buildRuleGroup` 会 `.filter(Boolean)` 掉空串，只剩这一条规则时连 WHERE 子句都不再生成 ——
 * 用户填了半截的日期区间于是换到整张表。翻译工作统一在 {@link build_rule} 做，见那里的注释。
 */
const format_between_values = (value: unknown): string => {
  if (!Array.isArray(value) || value.length < 2) return '';
  const [first, second] = value;
  if (first == null || second == null) return '';
  const firstVal = first instanceof Date ? first.toISOString() : first;
  const secondVal = second instanceof Date ? second.toISOString() : second;
  return `${get_sql_value(firstVal)} and ${get_sql_value(secondVal)}`;
};

/**
 * 格式化普通值
 */
const format_value = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return get_sql_value(value) as string;
  if (typeof value === 'number') return value.toString();
  if (value instanceof Date) return get_sql_value(value.toISOString()) as string;
  return get_sql_value(value) as string;
};

/**
 * 把规则值折算成参与子串比较的文本
 *
 * @remarks
 * 与 JS 增量匹配对齐：那一侧比较的是 `${entityValue}`，所以这里也统一走字符串化，
 * Date 取 ISO 串（与列里存的格式一致）。
 */
const to_match_text = (value: unknown): string =>
  value instanceof Date ? value.toISOString()
  : typeof value === 'string' ? value
  : String(value);

/**
 * 生成子串类操作符的 SQL 条件
 *
 * @remarks
 * 不用 `LIKE`：SQLite 的 `LIKE` 会把值里的 `%` `_` 当通配符，且对 ASCII 大小写不敏感，
 * 与 JS 增量匹配的 `String.includes` / `startsWith` / `endsWith` 结论相反 —— 同一份数据，
 * 首次 SQL 查询命中、写入后的增量匹配又不命中，响应式查询会自行漂移（SQLC-007）。
 * `instr` / `substr` 走二进制比较，天然是「字面量 + 大小写敏感」，也就不需要 `ESCAPE` 子句。
 *
 * 空串的边界与 JS 一致：`instr(X, '')` 返回 1，`substr(X, length(X) + 1)` 返回 `''`，
 * 对应 `includes('')` / `startsWith('')` / `endsWith('')` 恒为真。
 *
 * 产出的都是单个比较表达式，优先级高于 AND/OR，因此不需要自带括号
 * （对比 {@link handle_array_in} 的两段式条件）。
 *
 * @param fieldSql 已限定的列 SQL
 * @param operator 子串类操作符
 * @param value 规则值
 * @returns SQL 条件字符串
 * @throws {RxDBAdapterSqliteError} 操作符不属于子串类时
 */
export const build_substring_condition = (fieldSql: string, operator: string, value: unknown): string => {
  const text = to_match_text(value);
  const literal = get_sql_value(text) as string;
  // SQLite 的 length()/substr() 按字符（码点）计数而非 UTF-16 code unit，
  // 用 String.length 会把代理对多算一位、切片起点整体前移。
  const tail = `substr(${fieldSql}, length(${fieldSql}) - ${[...text].length} + 1)`;

  switch (operator) {
    case 'contains':
      return `instr(${fieldSql}, ${literal}) > 0`;
    case 'notContains':
      return `instr(${fieldSql}, ${literal}) = 0`;
    case 'startsWith':
      return `instr(${fieldSql}, ${literal}) = 1`;
    case 'notStartsWith':
      return `instr(${fieldSql}, ${literal}) <> 1`;
    case 'endsWith':
      return `${tail} = ${literal}`;
    case 'notEndsWith':
      return `${tail} <> ${literal}`;
    default:
      throw new RxDBAdapterSqliteError(`Unsupported substring operator: ${operator}`);
  }
};

/**
 * 处理 keyValue 字段的 contains/notContains 查询
 *
 * @remarks
 * **已知限制**：当前实现假定点号仅用于嵌套路径分隔。
 * 如果 keyValue 对象内部的键本身包含点号，此方法将无法正确工作。
 * 详见 query_sql.ts 中 `_try_process_top_level_flatmap` 的文档说明。
 *
 * 返回 `null` 表示「这条规则不归本函数管」（交回通用子串路径），与「匹配空集」是两回事 ——
 * 后者必须返回恒真/恒假常量。曾经在条目全为空时返回 `''`：`build_substring_rule` 只把 `null`
 * 当作「不归我管」，于是空串被原样带出，再被 `buildRuleGroup` 的 `.filter(Boolean)` 删掉，
 * 一条本该收窄结果的 `contains` 过滤器换到了整张表。
 *
 * @param tableAlias 列所在表的别名：EXISTS 子查询里是子查询根表，不是顶层主表 `_`
 */
export const handle_flatmap_contains = (
  entityMetadata: EntityMetadata,
  originalField: string,
  rule: QueryRuleValue,
  tableAlias: string = MAIN_TABLE_ALIAS
): string | null => {
  const prop = entityMetadata.propertyMap.get(originalField);
  if (!prop || prop.type !== PropertyType.keyValue) return null;
  if (typeof rule.value !== 'object' || Array.isArray(rule.value)) return null;

  const entries = Object.entries(rule.value as Record<string, unknown>).filter(([, v]) => v != null);
  // 空条件集按下面 combinator 的空集代数求值：contains 是 OR 的空集（恒假），
  // notContains 是 AND 的空集（恒真）。与「空数组 in/notIn」同一口径。
  if (!entries.length) return rule.operator === 'contains' ? '1 = 0' : '1 = 1';

  const combinator = rule.operator === 'contains' ? ' OR ' : ' AND ';

  const conditions = entries.map(([k, vRaw]) => {
    const escapedKey = k.replace(/'/g, "''");
    const fieldSql = `json_extract(${format_qualified_identifier(tableAlias, prop.columnName)}, '$.${escapedKey}')`;
    // 与非 keyValue 路径共用同一套子串语义（SQLC-007）
    return build_substring_condition(fieldSql, rule.operator, vRaw);
  });

  return `(${conditions.join(combinator)})`;
};

/**
 * 处理数组字段的 in/notIn 查询
 *
 * @remarks
 * notIn 分支必须显式排除 NULL 行（SQLC-008）。标量列的取反操作符靠 SQL 三值逻辑天然排除
 * NULL，JS 增量匹配也据此把 notIn 归入 `NULL_EXCLUDED_OPERATORS` 直接返回 false
 * （见 `packages/rxdb/src/query/query-matching.utils.ts` 的设计契约）。但 `json_each()`
 * 对 NULL 列不产生任何行，裸 `NOT EXISTS(...)` 恒为真 —— 数组列因此成为唯一会保留 NULL 行的
 * 例外，同一行在首次 SQL 查询与写入后的增量匹配之间结论相反，响应式查询会自行漂移。
 *
 * 生成的两段式条件自带括号：`buildRuleGroup` 对单条规则不补括号，
 * 否则 `a OR tags notIn [...]` 会被 AND 的优先级悄悄改写成 `(a OR tags IS NOT NULL) AND ...`。
 * in 分支无需守卫：`EXISTS(...)` 对 NULL 列本就为假。
 *
 * @param tableAlias 列所在表的别名：EXISTS 子查询里是子查询根表，不是顶层主表 `_`
 */
export const handle_array_in = (
  entityMetadata: EntityMetadata,
  originalField: string,
  rule: QueryRuleValue,
  tableAlias: string = MAIN_TABLE_ALIAS
): string | null => {
  const prop = entityMetadata.propertyMap.get(originalField);
  if (!prop) return null;
  if (prop.type !== PropertyType.stringArray && prop.type !== PropertyType.numberArray) return null;

  const columnSql = format_qualified_identifier(tableAlias, prop.columnName);
  const inValues = get_rule_value(rule);
  const existsSql = `EXISTS (SELECT 1 FROM json_each(${columnSql}) WHERE json_each.value IN ${inValues})`;
  return rule.operator === 'notIn' ? `(${columnSql} IS NOT NULL AND NOT ${existsSql})` : existsSql;
};

/**
 * 生成子串类操作符的完整规则 SQL
 *
 * @remarks
 * keyValue 列的对象值要逐键展开成 `json_extract(...)` 比较，不能落到本列上，
 * 因此先让 {@link handle_flatmap_contains} 认领；它返回 null 表示「不是 keyValue 对象匹配」。
 *
 * @param rule 规则对象
 * @param originalField 规则上的原始字段名
 * @param fieldAliasMap 字段别名映射
 * @param entityMetadata 实体元数据
 * @param tableAlias 本层主表别名
 * @returns SQL 条件字符串
 */
const build_substring_rule = (
  rule: QueryRule,
  originalField: string,
  fieldAliasMap: Map<string, string>,
  entityMetadata: EntityMetadata | undefined,
  tableAlias: string
): string => {
  if (
    entityMetadata &&
    !originalField.includes('.') &&
    (rule.operator === 'contains' || rule.operator === 'notContains')
  ) {
    const result = handle_flatmap_contains(entityMetadata, originalField, rule, tableAlias);
    if (result !== null) return result;
  }

  const field = get_field_sql(originalField, fieldAliasMap.get(originalField), entityMetadata, tableAlias);
  return build_substring_condition(field, rule.operator, rule.value);
};

/**
 * `buildRuleGroup` 的函数形态：EXISTS 子查询递归编译 where 时回调它
 */
export type BuildRuleGroupFn = (
  rg: RuleGroup,
  fam: Map<string, string>,
  em?: EntityMetadata,
  ad?: RxDBAdapterSqliteBase,
  queryParams?: SQLiteCompatibleType[],
  scope?: RuleScope
) => string;

/**
 * 编译 EXISTS 子查询的 where：字段绑到这一层分到的子查询别名，关系路径按子查询根实体重新规划 JOIN
 */
const compile_exists_where = (
  adapter: RxDBAdapterSqliteBase,
  buildRuleGroupFn: BuildRuleGroupFn,
  params: SQLiteCompatibleType[] | undefined,
  ruleGroup: RuleGroup,
  relationMetadata: EntityMetadata,
  scope: ExistsScope
): ExistsSubquery => {
  // 为子查询创建字段别名映射，使用 columnName 作为数据库列引用
  const childFieldAliasMap = new Map<string, string>();
  relationMetadata.propertyMap.forEach((property, key) => {
    childFieldAliasMap.set(key, format_qualified_identifier(scope.alias, property.columnName));
  });
  // 外键名也要绑到子查询根表：`owner.id` 会被 JOIN 规划就地归一化成 `ownerId`，
  // 不预置的话它落回 get_field_sql 的裸字段分支，拼成外层主表的 `_."ownerId"`（SQLC-010）
  const fkNames = relationMetadata.foreignKeyNames ?? [];
  const fkColumnNames = relationMetadata.foreignKeyColumnNames ?? fkNames;
  fkNames.forEach((fkName, index) => {
    childFieldAliasMap.set(fkName, format_qualified_identifier(scope.alias, fkColumnNames[index] ?? fkName));
  });
  // 子查询里的关系路径按**子查询根实体**重新规划 JOIN，第一跳挂到本层子查询别名上（SQLC-010）
  const { joinSQL, fieldAliasMap } = build_rule_group_join(adapter, relationMetadata, ruleGroup, undefined, {
    baseAlias: scope.alias,
    reservedAliases: scope.reservedAliases,
    fieldAliasMap: childFieldAliasMap
  });
  // 递归编译时带上本层作用域：内层再遇到 EXISTS 时关联到这一层，并分到外层没用过的别名
  return { where: buildRuleGroupFn(ruleGroup, fieldAliasMap, relationMetadata, adapter, params, scope), join: joinSQL };
};

/**
 * 生成 rule sql 查询条件
 * @param rule 规则对象
 * @param fieldAliasMap 字段别名映射
 * @param entityMetadata 实体元数据
 * @param adapter SQLite 适配器实例（可选，用于 EXISTS 查询）
 * @param buildRuleGroupFn buildRuleGroup 函数引用（可选，用于 EXISTS 子查询）
 * @param params bigint/binary 查询参数收集器
 * @param scope 规则所在的查询层，缺省是顶层主表 `_`
 * @returns SQL 条件字符串
 */
export const build_rule = (
  rule: QueryRule,
  fieldAliasMap: Map<string, string>,
  entityMetadata?: EntityMetadata,
  adapter?: RxDBAdapterSqliteBase,
  buildRuleGroupFn?: BuildRuleGroupFn,
  params?: SQLiteCompatibleType[],
  scope: RuleScope = MAIN_RULE_SCOPE
): string => {
  // 特殊处理：EXISTS/NOT EXISTS 操作符
  if (entityMetadata && adapter && buildRuleGroupFn && (rule.operator === 'exists' || rule.operator === 'notExists')) {
    const buildWhere = (ruleGroup: RuleGroup, relationMetadata: EntityMetadata, existsScope: ExistsScope) =>
      compile_exists_where(adapter, buildRuleGroupFn, params, ruleGroup, relationMetadata, existsScope);
    const result = handle_exists(rule, entityMetadata, adapter, buildWhere, scope);
    if (result !== null) return result;
  }

  const originalField = String(rule.field);
  const property = resolve_query_property(originalField, entityMetadata, adapter);
  validate_typed_query_operator(rule, property);

  // 特殊处理：null/notNull 操作符（不需要 value）
  if (rule.operator === 'null' || rule.operator === 'notNull') {
    const aliasField = fieldAliasMap.get(originalField);
    const field = get_field_sql(originalField, aliasField, entityMetadata, scope.alias);
    return rule.operator === 'null' ? `${field} IS NULL` : `${field} IS NOT NULL`;
  }

  // 空数组 in/notIn：匹配空集 → in 恒假、notIn 恒真（避免 IN (NULL) 的错误语义）
  if ((rule.operator === 'in' || rule.operator === 'notIn') && Array.isArray(rule.value) && rule.value.length === 0) {
    return rule.operator === 'in' ? '1 = 0' : '1 = 1';
  }

  const isNull = rule.value === null;
  // 只有 = / != 能和 null 组合（映射成 IS NULL / IS NOT NULL）。其余操作符下 operator 与 value
  // 会双双被置空，最终输出退化成裸字段 `_."col"`，被 SQLite 当真值判断求值 ——
  // 一条非法比较就此静默变成「该列不为 0 且不为 NULL」（SQLC-027）
  if (isNull && rule.operator !== '=' && rule.operator !== '!=') {
    throw new RxDBAdapterSqliteError(
      `Operator '${rule.operator}' cannot be combined with a null value on field '${originalField}'; use '=' or '!=' for null comparisons`
    );
  }
  // 子串类操作符没有对应的中缀 SQL 操作符，必须在 get_sql_operator 之前分流（SQLC-007）
  if (SUBSTRING_OPERATORS.has(rule.operator)) {
    return build_substring_rule(rule, originalField, fieldAliasMap, entityMetadata, scope.alias);
  }

  const operator = isNull ? '' : get_sql_operator(rule.operator).toLowerCase();
  const isBoundType = property?.type === PropertyType.bigint || property?.type === PropertyType.binary;
  const value =
    isNull ?
      rule.operator === '=' ? 'IS NULL'
      : rule.operator === '!=' ? 'IS NOT NULL'
      : ''
    : isBoundType ? bind_typed_rule_value(rule, property, params)
    : get_rule_value(rule);

  // 区间取不出边界（非数组、长度不足、任一端为 null/undefined）。此前这里 `return ''`，
  // 而空串会被 buildRuleGroup 的 `.filter(Boolean)` 连同整条谓词删掉 —— 只填了结束日期的
  // 日期筛选于是换到**整张表**。更糟的是响应式查询：JS 增量匹配那侧照样按原 rule 求值，
  // `compareRuleValues` 对空边界返回 false（SQL 三值逻辑，见 query-matching.utils.ts），
  // 于是首屏 SQL 结果与后续增量更新结论相反，查询自行漂移。
  // 这里按 JS 侧的结论翻成恒假/恒真常量，与上面「空数组 in/notIn」同一口径。
  if (!value && ['in', 'notIn', 'between', 'notBetween'].includes(rule.operator)) {
    return rule.operator === 'in' || rule.operator === 'between' ? '1 = 0' : '1 = 1';
  }

  const aliasField = fieldAliasMap.get(originalField);

  // 特殊处理：JSON 数组字段（stringArray, numberArray）
  if (entityMetadata && !originalField.includes('.') && (rule.operator === 'in' || rule.operator === 'notIn')) {
    const result = handle_array_in(entityMetadata, originalField, rule, scope.alias);
    if (result !== null) return result;
  }

  const field = get_field_sql(originalField, aliasField, entityMetadata, scope.alias);
  const sqlOperator =
    isNull ? ''
    : isBoundType ? get_sql_operator(rule.operator)
    : operator;
  // 只按片段拼接，不对整条 SQL 做空白替换：字面量与带引号的标识符里的连续空格、换行、tab
  // 都是值的一部分，压成单个空格会让 `'a  b'` 变成 `'a b'`，查到另一行（与 JS 增量匹配相反）
  return [field, sqlOperator, value].filter(Boolean).join(' ');
};

/**
 * 构建 ONE_TO_MANY EXISTS 子查询 SQL
 */
const _build_one_to_many_exists = (
  entityMetadata: EntityMetadata,
  relation: EntityRelationMetadata,
  relationMetadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  scope: ExistsScope,
  subquery?: ExistsSubquery
): string => {
  if (relation.kind !== RelationKind.ONE_TO_MANY) {
    throw new Error('_build_one_to_many_exists requires ONE_TO_MANY relation');
  }

  const childTable = get_table_name_by_metadata(relationMetadata, tableSet);
  const childAlias = scope.alias;

  const mappedPropertyRelation = relationMetadata.relations.find(r => r.name === relation.mappedProperty) as
    EntityRelationManyToOneMetadata | undefined;
  if (!mappedPropertyRelation) {
    throw new Error(
      `Cannot find mappedProperty relation "${relation.mappedProperty}" in entity "${relationMetadata.name}"`
    );
  }

  const foreignKeyColumn = mappedPropertyRelation.columnName;

  let sql = `EXISTS (SELECT 1 FROM ${quote_sql_identifier(childTable)} ${format_table_alias(childAlias)}`;
  if (subquery?.join) sql += subquery.join;
  sql += ` WHERE ${format_qualified_identifier(childAlias, foreignKeyColumn)} = ${format_qualified_identifier(scope.outerAlias, get_primary_key_column(entityMetadata))}`;

  if (subquery?.where) {
    sql += ` AND ${subquery.where}`;
  }

  sql += ')';
  return sql;
};

/**
 * 构建 MANY_TO_ONE EXISTS 子查询 SQL
 */
const _build_many_to_one_exists = (
  relation: EntityRelationManyToOneMetadata,
  relationMetadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  scope: ExistsScope,
  subquery?: ExistsSubquery
): string => {
  const foreignKeyColumn = relation.columnName;

  if (!subquery?.where) {
    return `${format_qualified_identifier(scope.outerAlias, foreignKeyColumn)} IS NOT NULL`;
  }

  const parentTable = get_table_name_by_metadata(relationMetadata, tableSet);
  const childAlias = scope.alias;

  let sql = `EXISTS (SELECT 1 FROM ${quote_sql_identifier(parentTable)} ${format_table_alias(childAlias)}`;
  sql += subquery.join;
  sql += ` WHERE ${format_qualified_identifier(scope.outerAlias, foreignKeyColumn)} = ${format_qualified_identifier(childAlias, get_primary_key_column(relationMetadata))}`;
  sql += ` AND ${subquery.where}`;
  sql += ')';
  return sql;
};

/**
 * 构建 ONE_TO_ONE EXISTS 子查询 SQL
 */
const _build_one_to_one_exists = (
  entityMetadata: EntityMetadata,
  relation: EntityRelationOneToOneMetadata,
  relationMetadata: EntityMetadata,
  adapter: RxDBAdapterSqliteBase,
  scope: ExistsScope,
  subquery?: ExistsSubquery
): string => {
  const mappedRelation = adapter.rxdb.schemaManager.findMappedRelation(entityMetadata, relation);

  if (mappedRelation?.relation) {
    const relatedTable = get_table_name_by_metadata(relationMetadata, adapter.tableSet);
    const childAlias = scope.alias;
    const foreignKeyColumn = mappedRelation.relation.columnName;
    if (!foreignKeyColumn) {
      throw new RxDBAdapterSqliteError(`Mapped relation "${mappedRelation.relation.name}" has no columnName`);
    }

    let sql = `EXISTS (SELECT 1 FROM ${quote_sql_identifier(relatedTable)} ${format_table_alias(childAlias)}`;
    if (subquery?.join) sql += subquery.join;
    sql += ` WHERE ${format_qualified_identifier(childAlias, foreignKeyColumn)} = ${format_qualified_identifier(scope.outerAlias, get_primary_key_column(entityMetadata))}`;

    if (subquery?.where) {
      sql += ` AND ${subquery.where}`;
    }

    sql += ')';
    return sql;
  } else {
    const foreignKeyColumn = relation.columnName;

    if (!subquery?.where) {
      return `${format_qualified_identifier(scope.outerAlias, foreignKeyColumn)} IS NOT NULL`;
    }

    const relatedTable = get_table_name_by_metadata(relationMetadata, adapter.tableSet);
    const childAlias = scope.alias;

    let sql = `EXISTS (SELECT 1 FROM ${quote_sql_identifier(relatedTable)} ${format_table_alias(childAlias)}`;
    sql += subquery.join;
    sql += ` WHERE ${format_qualified_identifier(scope.outerAlias, foreignKeyColumn)} = ${format_qualified_identifier(childAlias, get_primary_key_column(relationMetadata))}`;
    sql += ` AND ${subquery.where}`;
    sql += ')';
    return sql;
  }
};

/**
 * 构建 MANY_TO_MANY EXISTS 子查询 SQL
 */
const _build_many_to_many_exists = (
  entityMetadata: EntityMetadata,
  relation: EntityRelationMetadata,
  relationMetadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  scope: ExistsScope,
  subquery?: ExistsSubquery
): string => {
  const relatedTable = get_table_name_by_metadata(relationMetadata, tableSet);
  const childAlias = scope.alias;

  const junctionEntityType = (relation as EntityRelationManyToManyMetadata).junctionEntityType;
  if (!junctionEntityType) {
    throw new Error(`MANY_TO_MANY relation "${relation.name}" missing junctionEntityType`);
  }

  const junctionMetadata = tryGetEntityMetadata(junctionEntityType);
  if (!junctionMetadata) {
    throw new Error(`Cannot find metadata for junction entity`);
  }

  const junctionTable = get_table_name_by_metadata(junctionMetadata, tableSet);
  const junctionAlias = scope.junctionAlias;

  const junctionToCurrentRelation = junctionMetadata.relations.find(
    r => r.mappedEntity === entityMetadata.name && r.mappedNamespace === entityMetadata.namespace
  ) as EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata | undefined;
  if (!junctionToCurrentRelation) {
    throw new Error(
      `Cannot find relation in junction entity ${junctionMetadata.name} pointing to ${entityMetadata.name}`
    );
  }

  const junctionToRelatedRelation = junctionMetadata.relations.find(
    r => r.mappedEntity === relationMetadata.name && r.mappedNamespace === relationMetadata.namespace
  ) as EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata | undefined;
  if (!junctionToRelatedRelation) {
    throw new Error(
      `Cannot find relation in junction entity ${junctionMetadata.name} pointing to ${relationMetadata.name}`
    );
  }

  const currentEntityForeignKey = junctionToCurrentRelation.columnName;
  const relatedEntityForeignKey = junctionToRelatedRelation.columnName;

  let sql = `EXISTS (SELECT 1 FROM ${quote_sql_identifier(relatedTable)} ${format_table_alias(childAlias)}`;
  sql += ` INNER JOIN ${quote_sql_identifier(junctionTable)} ${format_table_alias(junctionAlias)}`;
  sql += ` ON ${format_qualified_identifier(junctionAlias, relatedEntityForeignKey)} = ${format_qualified_identifier(childAlias, get_primary_key_column(relationMetadata))}`;
  if (subquery?.join) sql += subquery.join;
  sql += ` WHERE ${format_qualified_identifier(junctionAlias, currentEntityForeignKey)} = ${format_qualified_identifier(scope.outerAlias, get_primary_key_column(entityMetadata))}`;

  if (subquery?.where) {
    sql += ` AND ${subquery.where}`;
  }

  sql += ')';

  return sql;
};

/**
 * 处理 EXISTS/NOT EXISTS 操作符
 *
 * @param rule 规则对象
 * @param entityMetadata 外层实体元数据
 * @param adapter SQLite 适配器实例
 * @param buildWhere 子查询 where 编译器，返回条件与子查询内部需要的 JOIN（SQLC-010）；第三个参数是这一层
 * 子查询分到的别名，where 里的字段要挂在 `existsScope.alias` 上
 * @param scope 这条规则所在的查询层，缺省是顶层主表 `_`；关联条件里「当前实体」那一侧用它的别名
 * @returns EXISTS 条件 SQL；规则不是 exists/notExists 或字段不是关系时返回 null
 */
export const handle_exists = (
  rule: QueryRule,
  entityMetadata: EntityMetadata,
  adapter: RxDBAdapterSqliteBase,
  buildWhere?: (ruleGroup: RuleGroup, relationMetadata: EntityMetadata, existsScope: ExistsScope) => ExistsSubquery,
  scope: RuleScope = MAIN_RULE_SCOPE
): string | null => {
  if (rule.operator !== 'exists' && rule.operator !== 'notExists') {
    return null;
  }

  const relation = entityMetadata.relationMap.get(rule.field);
  if (!relation) return null;

  const relationMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
    relation.mappedEntity,
    relation.mappedNamespace
  );

  if (!relationMetadata) {
    throw new Error(`Cannot find metadata for entity: ${relation.mappedNamespace}.${relation.mappedEntity}`);
  }

  const existsScope = exists_scope_of(scope);
  let subquery: ExistsSubquery | undefined;
  if (rule.where && buildWhere) {
    subquery = buildWhere(rule.where, relationMetadata, existsScope);
  }

  let existsSql: string;
  const { tableSet } = adapter;

  switch (relation.kind) {
    case RelationKind.ONE_TO_MANY:
      existsSql = _build_one_to_many_exists(entityMetadata, relation, relationMetadata, tableSet, existsScope, subquery);
      break;

    case RelationKind.MANY_TO_ONE:
      existsSql = _build_many_to_one_exists(relation, relationMetadata, tableSet, existsScope, subquery);
      break;

    case RelationKind.ONE_TO_ONE:
      existsSql = _build_one_to_one_exists(entityMetadata, relation, relationMetadata, adapter, existsScope, subquery);
      break;

    case RelationKind.MANY_TO_MANY:
      existsSql = _build_many_to_many_exists(entityMetadata, relation, relationMetadata, tableSet, existsScope, subquery);
      break;
  }

  return rule.operator === 'notExists' ? `NOT ${existsSql}` : existsSql;
};
