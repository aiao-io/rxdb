/**
 * @fileoverview Supabase 查询条件转换器
 *
 * 将 RxDB 的 RuleGroup 转换为 Supabase Query Builder 调用。
 * 支持普通字段查询、关联表 EXISTS 查询、多层嵌套查询。
 *
 * PostgREST 嵌套过滤语法参考：
 * https://postgrest.org/en/stable/references/api/resource_embedding.html#embedded-filters
 */

import {
  isRuleGroup,
  SchemaManager,
  type EntityMetadata,
  type EntityRelationMetadata,
  type Rule,
  type RuleGroup
} from '@aiao/rxdb';

// ============================================
// 类型定义
// ============================================

/** 规则转换器实际依赖的 PostgREST 链式过滤接口。 */
interface SupabaseQueryBuilder {
  eq(field: string, value: unknown): SupabaseQueryBuilder;
  neq(field: string, value: unknown): SupabaseQueryBuilder;
  lt(field: string, value: unknown): SupabaseQueryBuilder;
  lte(field: string, value: unknown): SupabaseQueryBuilder;
  gt(field: string, value: unknown): SupabaseQueryBuilder;
  gte(field: string, value: unknown): SupabaseQueryBuilder;
  in(field: string, values: readonly unknown[]): SupabaseQueryBuilder;
  is(field: string, value: unknown): SupabaseQueryBuilder;
  not(field: string, operator: string, value: unknown): SupabaseQueryBuilder;
  or(filters: string): SupabaseQueryBuilder;
  ilike(field: string, pattern: string): SupabaseQueryBuilder;
}

/** 查询规则扁平视图（避免 Rule union 类型解构限制） */
interface RuleView {
  field: string;
  operator: string;
  value?: unknown;
  where?: RuleGroup<unknown>;
}

type FieldFilterAst =
  | { kind: 'comparison'; field: string; operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; value: unknown }
  | { kind: 'list'; field: string; values: readonly unknown[]; negated: boolean }
  | {
      kind: 'pattern';
      field: string;
      value: string;
      prefixWildcard: boolean;
      suffixWildcard: boolean;
      negated: boolean;
    }
  | { kind: 'range'; field: string; min: unknown; max: unknown; negated: boolean }
  | { kind: 'null'; field: string; negated: boolean };

function assert_never(value: never): never {
  throw new Error(`Unexpected filter value: ${String(value)}`);
}

// ============================================
// 常量：操作符映射
// ============================================

// ============================================
// 工具函数
// ============================================

/** 值标准化：Date → ISO 字符串 */
function normalize_value(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize_value);
  return value;
}

/**
 * 转义 PostgREST 过滤值中的保留字符。
 *
 * 当值包含会破坏 `or()` / `in.()` 结构的保留字符（逗号、括号、双引号、反斜杠）时，
 * 用双引号包裹并转义内部的 `\` 与 `"`，避免值被 PostgREST 误解析成多个条件（或被注入）。
 * postgrest-js 会对最终查询串做百分号编码，因此此处只需产出逻辑双引号即可。
 *
 * @see https://postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters
 */
function encode_filter_value(value: unknown): string {
  const str = String(value);
  if (!/[,()"\\]/.test(str)) return str;
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function get_between_bounds(value: unknown, operator: 'between' | 'notBetween'): [unknown, unknown] {
  const normalized = normalize_value(value);
  if (!Array.isArray(normalized) || normalized.length !== 2) {
    throw new Error(`${operator} operator requires a two-item array`);
  }

  return [normalized[0], normalized[1]];
}

/** 获取关联实体的 metadata */
function get_relation_metadata(
  relation: EntityRelationMetadata,
  schemaManager: SchemaManager | undefined,
  fallback: EntityMetadata
): EntityMetadata {
  if (!schemaManager || !relation.mappedEntity) return fallback;
  return schemaManager.getEntityMetadata(relation.mappedEntity, relation.mappedNamespace ?? '') ?? fallback;
}

function normalize_field_filter(field: string, operator: string, value: unknown): FieldFilterAst {
  const normalized = normalize_value(value);

  switch (operator) {
    case '=':
      return normalized === null ?
          { kind: 'null', field, negated: false }
        : { kind: 'comparison', field, operator: 'eq', value: normalized };
    case '!=':
      return normalized === null ?
          { kind: 'null', field, negated: true }
        : { kind: 'comparison', field, operator: 'neq', value: normalized };
    case '<':
      return { kind: 'comparison', field, operator: 'lt', value: normalized };
    case '<=':
      return { kind: 'comparison', field, operator: 'lte', value: normalized };
    case '>':
      return { kind: 'comparison', field, operator: 'gt', value: normalized };
    case '>=':
      return { kind: 'comparison', field, operator: 'gte', value: normalized };
    case 'in':
    case 'notIn':
      if (!Array.isArray(normalized)) throw new Error('IN operator requires array');
      return { kind: 'list', field, values: normalized, negated: operator === 'notIn' };
    case 'contains':
    case 'includes':
    case 'notContains':
      return {
        kind: 'pattern',
        field,
        value: String(normalized),
        prefixWildcard: true,
        suffixWildcard: true,
        negated: operator === 'notContains'
      };
    case 'startsWith':
    case 'notStartsWith':
      return {
        kind: 'pattern',
        field,
        value: String(normalized),
        prefixWildcard: false,
        suffixWildcard: true,
        negated: operator === 'notStartsWith'
      };
    case 'endsWith':
    case 'notEndsWith':
      return {
        kind: 'pattern',
        field,
        value: String(normalized),
        prefixWildcard: true,
        suffixWildcard: false,
        negated: operator === 'notEndsWith'
      };
    case 'between':
    case 'notBetween': {
      const [min, max] = get_between_bounds(value, operator);
      return { kind: 'range', field, min, max, negated: operator === 'notBetween' };
    }
    case 'null':
    case 'isNull':
      return { kind: 'null', field, negated: false };
    case 'notNull':
    case 'isNotNull':
      return { kind: 'null', field, negated: true };
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

function emit_filter_ast(filter: FieldFilterAst): string {
  switch (filter.kind) {
    case 'comparison':
      return `${filter.field}.${filter.operator}.${encode_filter_value(filter.value)}`;
    case 'list':
      return `${filter.field}.${filter.negated ? 'not.' : ''}in.(${filter.values.map(encode_filter_value).join(',')})`;
    case 'pattern': {
      const value = `${filter.prefixWildcard ? '*' : ''}${filter.value}${filter.suffixWildcard ? '*' : ''}`;
      return `${filter.field}.${filter.negated ? 'not.' : ''}ilike.${encode_filter_value(value)}`;
    }
    case 'range': {
      const min = encode_filter_value(filter.min);
      const max = encode_filter_value(filter.max);
      const conditions = `${filter.field}.${filter.negated ? 'lt' : 'gte'}.${min},${filter.field}.${filter.negated ? 'gt' : 'lte'}.${max}`;
      return `${filter.negated ? 'or' : 'and'}(${conditions})`;
    }
    case 'null':
      return `${filter.field}.${filter.negated ? 'not.' : ''}is.null`;
  }
}

function emit_rule_node<T>(rule: Rule<T> | RuleGroup<T>): string {
  if (isRuleGroup(rule)) {
    const conditions = rule.rules.map(item => emit_rule_node(item as Rule<T> | RuleGroup<T>));
    return `${rule.combinator}(${conditions.join(',')})`;
  }

  const { field, operator, value } = rule as RuleView;
  if (field.includes('.') || operator === 'exists' || operator === 'notExists') {
    throw new Error('Relation filters inside OR groups are not supported by PostgREST');
  }
  return emit_filter_ast(normalize_field_filter(field, operator, value));
}

/**
 * 点分路径转嵌套 EXISTS 结构
 * @example 'orders.amount' → { field: 'orders', operator: 'exists', where: { rules: [{ field: 'amount', ... }] } }
 */
function expand_dot_path(field: string, operator: string, value: unknown): Rule {
  const [first, ...rest] = field.split('.');
  if (rest.length === 0) return { field, operator, value } as unknown as Rule;

  return {
    field: first,
    operator: 'exists',
    where: { combinator: 'and', rules: [expand_dot_path(rest.join('.'), operator, value)] }
  } as unknown as Rule;
}

// ============================================
// 公开 API
// ============================================

/**
 * 应用 RuleGroup 到 Supabase Query Builder
 */
export function apply_rule_group<T, TQuery>(
  query: TQuery,
  ruleGroup: RuleGroup<T>,
  metadata?: EntityMetadata,
  schemaManager?: SchemaManager
): TQuery {
  const builder = query as unknown as SupabaseQueryBuilder;
  if (!ruleGroup?.rules?.length) return query;

  // 单规则直接处理
  if (ruleGroup.rules.length === 1) {
    const rule = ruleGroup.rules[0];
    const result =
      isRuleGroup(rule) ?
        apply_rule_group(builder, rule as unknown as RuleGroup<T>, metadata, schemaManager)
      : apply_rule(builder, rule as Rule<T>, metadata, schemaManager);
    return result as unknown as TQuery;
  }

  // AND: 链式调用
  if (ruleGroup.combinator === 'and') {
    return ruleGroup.rules.reduce(
      (q, rule) =>
        isRuleGroup(rule) ?
          apply_rule_group(q, rule as unknown as RuleGroup<T>, metadata, schemaManager)
        : apply_rule(q, rule as Rule<T>, metadata, schemaManager),
      builder
    ) as unknown as TQuery;
  }

  // OR: 构建过滤字符串
  const conditions = ruleGroup.rules.map(rule => emit_rule_node(rule as Rule<T> | RuleGroup<T>));
  return builder.or(conditions.join(',')) as unknown as TQuery;
}

// ============================================
// 核心：规则应用
// ============================================

/** 应用单个规则 */
function apply_rule<T>(
  query: SupabaseQueryBuilder,
  rule: Rule<T>,
  metadata?: EntityMetadata,
  schemaManager?: SchemaManager
): SupabaseQueryBuilder {
  const { field, operator, value } = rule as RuleView;

  // 点分路径 → 展开为 EXISTS
  if (typeof field === 'string' && field.includes('.')) {
    return apply_rule(query, expand_dot_path(field, operator, value), metadata, schemaManager);
  }

  // EXISTS / NOT EXISTS（存在 / 不存在）
  if (operator === 'exists' || operator === 'notExists') {
    return apply_exists_rule(query, rule, metadata, schemaManager);
  }

  // 普通字段
  return apply_field_filter(query, field, operator, value);
}

/** 应用 EXISTS 规则 */
function apply_exists_rule<T>(
  query: SupabaseQueryBuilder,
  rule: Rule<T>,
  metadata?: EntityMetadata,
  schemaManager?: SchemaManager
): SupabaseQueryBuilder {
  const { field, operator, where: whereCondition } = rule as RuleView;
  const relationName = String(field);

  const relation = metadata?.relationMap?.get(relationName);
  if (!relation) {
    throw new Error(`Relation '${relationName}' not found in '${metadata?.name || 'unknown'}'`);
  }

  const subMetadata = metadata ? get_relation_metadata(relation, schemaManager, metadata) : undefined;
  if (!subMetadata) throw new Error(`Cannot resolve metadata for '${relationName}'`);

  // 无 WHERE：简单的 EXISTS 检查
  if (!whereCondition?.rules?.length) {
    return operator === 'exists' ? query.not(relationName, 'is', null) : query.is(relationName, null);
  }

  assert_not_exists_without_where(operator, relationName);

  return apply_nested_conditions(
    query.not(relationName, 'is', null),
    relationName,
    whereCondition,
    subMetadata,
    schemaManager,
    relationName
  );
}

/**
 * 拒绝「带子条件的 `notExists`」
 *
 * @remarks
 * PostgREST 没有可用的 anti-join：嵌套过滤（`relation.field=...`）只裁 embed 出来的子行，
 * 不裁父行；`!inner` 只能表达 EXISTS，取不到它的补集。
 * 之前这里对 `notExists` 直接放行，把子条件当**正向**过滤挂上去，
 * 结果是父行全返回（或恰好等于 EXISTS 集合）—— 与请求语义相反，且不报错。
 *
 * 因此显式拒绝而不是给个近似答案。真要支持得走服务端 RPC（返回反连接结果的 SQL 函数）。
 * 不带子条件的 `notExists` 不受影响，仍走 `relation IS NULL`。
 *
 * @throws {Error} operator 为 `notExists` 且带非空 `where` 时
 */
function assert_not_exists_without_where(operator: string, relationName: string): void {
  if (operator !== 'notExists') {
    return;
  }

  throw new Error(
    `notExists with a where clause is not supported on the Supabase/PostgREST backend ` +
      `(relation '${relationName}'): PostgREST cannot express an anti-join. ` +
      `Use notExists without a where clause, or move the condition into a server-side RPC.`
  );
}

/** 递归应用嵌套 EXISTS 条件 */
function apply_nested_conditions<T>(
  query: SupabaseQueryBuilder,
  relationPath: string,
  where: RuleGroup<T>,
  metadata: EntityMetadata,
  schemaManager?: SchemaManager,
  path: string = ''
): SupabaseQueryBuilder {
  if (!where?.rules?.length) return query;

  let result = query;

  for (const rule of where.rules) {
    if (isRuleGroup(rule)) {
      result = apply_nested_conditions(
        result,
        relationPath,
        rule as unknown as RuleGroup<T>,
        metadata,
        schemaManager,
        path
      );
      continue;
    }

    const { field, operator, value, where: subQueryWhere } = rule as RuleView;

    // 嵌套 EXISTS
    if (operator === 'exists' || operator === 'notExists') {
      const subRelation = metadata?.relationMap?.get(String(field));
      if (!subRelation) throw new Error(`Relation '${field}' not found in ${metadata.name}`);

      const subMeta = get_relation_metadata(subRelation, schemaManager, metadata);
      const subRelationName = String(field);
      const subWhere = subQueryWhere;

      if (subWhere?.rules?.length) {
        // 嵌套层同样没有 anti-join 可用，理由见 assert_not_exists_without_where
        assert_not_exists_without_where(operator, subRelationName);

        const newPath = path ? `${path}.${subRelationName}` : subRelationName;
        result = apply_nested_conditions(
          result.not(newPath, 'is', null),
          subRelationName,
          subWhere,
          subMeta,
          schemaManager,
          newPath
        );
      } else {
        const existsPath = path ? `${path}.${subRelationName}` : subRelationName;
        result = operator === 'exists' ? result.not(existsPath, 'is', null) : result.is(existsPath, null);
      }
      continue;
    }

    // 普通字段：添加路径前缀
    const prefixedField = path ? `${path}.${field}` : `${relationPath}.${field}`;
    result = apply_field_filter(result, prefixedField, operator, value);
  }

  return result;
}

// ============================================
// 字段过滤
// ============================================

/** 应用字段过滤条件 */
function apply_field_filter(
  query: SupabaseQueryBuilder,
  field: string,
  operator: string,
  value: unknown
): SupabaseQueryBuilder {
  const filter = normalize_field_filter(field, operator, value);

  switch (filter.kind) {
    case 'comparison':
      switch (filter.operator) {
        case 'eq':
          return query.eq(field, filter.value);
        case 'neq':
          return query.neq(field, filter.value);
        case 'lt':
          return query.lt(field, filter.value);
        case 'lte':
          return query.lte(field, filter.value);
        case 'gt':
          return query.gt(field, filter.value);
        case 'gte':
          return query.gte(field, filter.value);
        default:
          return assert_never(filter.operator);
      }
    case 'list': {
      const values = [...filter.values];
      return filter.negated ?
          query.not(field, 'in', `(${values.map(encode_filter_value).join(',')})`)
        : query.in(field, values);
    }
    case 'pattern': {
      const pattern = `${filter.prefixWildcard ? '%' : ''}${filter.value}${filter.suffixWildcard ? '%' : ''}`;
      return filter.negated ? query.not(field, 'ilike', pattern) : query.ilike(field, pattern);
    }
    case 'range':
      return filter.negated ?
          query.or(`${field}.lt.${encode_filter_value(filter.min)},${field}.gt.${encode_filter_value(filter.max)}`)
        : query.gte(field, filter.min).lte(field, filter.max);
    case 'null':
      return filter.negated ? query.not(field, 'is', null) : query.is(field, null);
  }
}
