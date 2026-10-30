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
import { assign_exists_aliases, type ExistsAliases } from './relation_embeds.js';

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
  or(filters: string, options?: { referencedTable?: string }): SupabaseQueryBuilder;
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

/** 解析主键物理列名；其余字段保持既有 Supabase 属性名契约。 */
function resolve_column_name(field: string, metadata?: EntityMetadata): string {
  if (field !== 'id' || !metadata) return field;
  return metadata.propertyMap?.get('id')?.columnName ?? field;
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

function emit_filter_ast(filter: FieldFilterAst, metadata?: EntityMetadata): string {
  const field = resolve_column_name(filter.field, metadata);
  switch (filter.kind) {
    case 'comparison':
      return `${field}.${filter.operator}.${encode_filter_value(filter.value)}`;
    case 'list':
      return `${field}.${filter.negated ? 'not.' : ''}in.(${filter.values.map(encode_filter_value).join(',')})`;
    case 'pattern': {
      const value = `${filter.prefixWildcard ? '*' : ''}${filter.value}${filter.suffixWildcard ? '*' : ''}`;
      return `${field}.${filter.negated ? 'not.' : ''}ilike.${encode_filter_value(value)}`;
    }
    case 'range': {
      const min = encode_filter_value(filter.min);
      const max = encode_filter_value(filter.max);
      const conditions = `${field}.${filter.negated ? 'lt' : 'gte'}.${min},${field}.${filter.negated ? 'gt' : 'lte'}.${max}`;
      return `${filter.negated ? 'or' : 'and'}(${conditions})`;
    }
    case 'null':
      return `${field}.${filter.negated ? 'not.' : ''}is.null`;
  }
}

function emit_rule_node<T>(rule: Rule<T> | RuleGroup<T>, metadata?: EntityMetadata): string {
  if (isRuleGroup(rule)) {
    const conditions = rule.rules.map(item => emit_rule_node(item as Rule<T> | RuleGroup<T>, metadata));
    return `${rule.combinator}(${conditions.join(',')})`;
  }

  const { field, operator, value } = rule as RuleView;
  if (field.includes('.') || operator === 'exists' || operator === 'notExists') {
    throw new Error('Relation filters inside OR groups are not supported by PostgREST');
  }
  return emit_filter_ast(normalize_field_filter(field, operator, value), metadata);
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
 *
 * @remarks
 * exists 落在哪个嵌入上（别名）由 {@link assign_exists_aliases} 按整份条件一次定下，与
 * `SupabaseRepository.buildSelectFields` 拼 select 时用的是同一份规划。
 */
export function apply_rule_group<T, TQuery>(
  query: TQuery,
  ruleGroup: RuleGroup<T>,
  metadata?: EntityMetadata,
  schemaManager?: SchemaManager
): TQuery {
  const context: CompileContext = { schemaManager, aliases: assign_exists_aliases(ruleGroup) };
  return apply_group(query as unknown as SupabaseQueryBuilder, ruleGroup, metadata, context) as unknown as TQuery;
}

/** 一次编译的上下文：解析关联实体元数据的 schemaManager，与本份条件里各条 exists 的嵌入别名 */
interface CompileContext {
  readonly schemaManager?: SchemaManager;
  readonly aliases: ExistsAliases;
}

function apply_group<T>(
  builder: SupabaseQueryBuilder,
  ruleGroup: RuleGroup<T>,
  metadata: EntityMetadata | undefined,
  context: CompileContext
): SupabaseQueryBuilder {
  if (!ruleGroup?.rules?.length) return builder;

  // 单规则与 AND 都是逐条链式调用
  if (ruleGroup.rules.length === 1 || ruleGroup.combinator === 'and') {
    return ruleGroup.rules.reduce(
      (q, rule) =>
        isRuleGroup(rule) ?
          apply_group(q, rule as unknown as RuleGroup<T>, metadata, context)
        : apply_rule(q, rule as Rule<T>, metadata, context),
      builder
    );
  }

  // OR: 构建过滤字符串
  const conditions = ruleGroup.rules.map(rule => emit_rule_node(rule as Rule<T> | RuleGroup<T>, metadata));
  return builder.or(conditions.join(','));
}

// ============================================
// 核心：规则应用
// ============================================

/** 应用单个规则 */
function apply_rule<T>(
  query: SupabaseQueryBuilder,
  rule: Rule<T>,
  metadata: EntityMetadata | undefined,
  context: CompileContext
): SupabaseQueryBuilder {
  const { field, operator, value } = rule as RuleView;

  // 点分路径 → 展开为 EXISTS（展开出来的规则不在别名表里，落在以关系名命名的嵌入上）
  if (typeof field === 'string' && field.includes('.')) {
    return apply_rule(query, expand_dot_path(field, operator, value), metadata, context);
  }

  // EXISTS / NOT EXISTS（存在 / 不存在）
  if (operator === 'exists' || operator === 'notExists') {
    return apply_exists_rule(query, rule, metadata, context);
  }

  // 普通字段
  return apply_field_filter(query, resolve_column_name(field, metadata), operator, value);
}

/** 应用 EXISTS 规则 */
function apply_exists_rule<T>(
  query: SupabaseQueryBuilder,
  rule: Rule<T>,
  metadata: EntityMetadata | undefined,
  context: CompileContext
): SupabaseQueryBuilder {
  const { field, operator, where: whereCondition } = rule as RuleView;
  const relationName = String(field);
  const embed = context.aliases.get(rule) ?? relationName;

  const relation = metadata?.relationMap?.get(relationName);
  if (!relation) {
    throw new Error(`Relation '${relationName}' not found in '${metadata?.name || 'unknown'}'`);
  }

  const subMetadata = metadata ? get_relation_metadata(relation, context.schemaManager, metadata) : undefined;
  if (!subMetadata) throw new Error(`Cannot resolve metadata for '${relationName}'`);

  // 无 WHERE：简单的 EXISTS 检查
  if (!whereCondition?.rules?.length) {
    return operator === 'exists' ? query.not(embed, 'is', null) : query.is(embed, null);
  }

  assert_not_exists_without_where(operator, relationName);

  return apply_nested_conditions(query.not(embed, 'is', null), whereCondition, subMetadata, embed, context);
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

/**
 * 在关系作用域内应用一组条件，嵌套 EXISTS 递归下钻。
 *
 * @remarks
 * 作用域内的条件都挂在同一条嵌入路径上（`<path>.<列>`）：PostgREST 把它们当作对同一条关联行的过滤，
 * 配合 `!inner` 嵌入与 `<path>=not.is.null` 才成为父行的 EXISTS。组合子因此必须照搬——AND 逐条挂，
 * OR 编成一条作用于该路径的 `<path>.or=(...)`。逐条挂就成了 AND：「标题为 A 或 B」变成
 * 「同一行标题同时是 A 和 B」，静默返回空集。
 *
 * OR 子句里只能写该关系自己的列，与顶层 OR 同一条限制：再嵌关系过滤由 {@link emit_rule_node}
 * 在发请求前显式拒绝。单条规则的 OR 组与 AND 等价，按 AND 挂。
 *
 * @param path - 嵌入路径（各段是嵌入别名），如 `posts`、`children.grandchildren`、`orders__2.items`
 */
function apply_nested_conditions<T>(
  query: SupabaseQueryBuilder,
  where: RuleGroup<T>,
  metadata: EntityMetadata,
  path: string,
  context: CompileContext
): SupabaseQueryBuilder {
  if (!where?.rules?.length) return query;

  if (where.rules.length > 1 && where.combinator !== 'and') {
    const conditions = where.rules.map(rule => emit_rule_node(rule as Rule<T> | RuleGroup<T>, metadata));
    return apply_or(query, conditions.join(','), path);
  }

  return where.rules.reduce(
    (result, rule) =>
      isRuleGroup(rule) ?
        apply_nested_conditions(result, rule as unknown as RuleGroup<T>, metadata, path, context)
      : apply_nested_rule(result, rule as Rule<T>, metadata, path, context),
    query
  );
}

/** 关系作用域内的单条规则：嵌套 EXISTS 下钻一层，其余都是该关系自己的列 */
function apply_nested_rule<T>(
  query: SupabaseQueryBuilder,
  rule: Rule<T>,
  metadata: EntityMetadata,
  path: string,
  context: CompileContext
): SupabaseQueryBuilder {
  const { field, operator, value, where: subWhere } = rule as RuleView;
  if (operator !== 'exists' && operator !== 'notExists') {
    return apply_field_filter(query, resolve_column_name(field, metadata), operator, value, path);
  }

  const subRelationName = String(field);
  const subRelation = metadata?.relationMap?.get(subRelationName);
  if (!subRelation) throw new Error(`Relation '${field}' not found in ${metadata.name}`);

  const subPath = `${path}.${context.aliases.get(rule) ?? subRelationName}`;
  if (!subWhere?.rules?.length) {
    return operator === 'exists' ? query.not(subPath, 'is', null) : query.is(subPath, null);
  }

  // 嵌套层同样没有 anti-join 可用，理由见 assert_not_exists_without_where
  assert_not_exists_without_where(operator, subRelationName);
  const subMeta = get_relation_metadata(subRelation, context.schemaManager, metadata);
  return apply_nested_conditions(query.not(subPath, 'is', null), subWhere, subMeta, subPath, context);
}

// ============================================
// 字段过滤
// ============================================

/**
 * 挂一条 or 过滤；关系作用域内经 `referencedTable` 落在该嵌入资源上（`<path>.or=(...)`）。
 *
 * @remarks
 * 作用域内不能写成顶层 `or=(<path>.<列>...)`：PostgREST 的逻辑树不认嵌入资源的列，
 * 整个请求以 `PGRST100 failed to parse logic tree` 被拒；postgrest-js 也明说不支持跨表 `.or()`。
 *
 * @param referencedTable - 关系作用域的嵌入路径；顶层查询不传
 */
function apply_or(query: SupabaseQueryBuilder, filters: string, referencedTable?: string): SupabaseQueryBuilder {
  return referencedTable ? query.or(filters, { referencedTable }) : query.or(filters);
}

/**
 * 应用字段过滤条件
 *
 * @param column - 物理列名（主键已映射）
 * @param referencedTable - 关系作用域的嵌入路径；顶层查询不传。比较类过滤写成 `<path>.<列>`，
 *   内部是 OR 的 `notBetween` 经 {@link apply_or} 落到同一个作用域
 */
function apply_field_filter(
  query: SupabaseQueryBuilder,
  column: string,
  operator: string,
  value: unknown,
  referencedTable?: string
): SupabaseQueryBuilder {
  const field = referencedTable ? `${referencedTable}.${column}` : column;
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
          apply_or(
            query,
            `${column}.lt.${encode_filter_value(filter.min)},${column}.gt.${encode_filter_value(filter.max)}`,
            referencedTable
          )
        : query.gte(field, filter.min).lte(field, filter.max);
    case 'null':
      return filter.negated ? query.not(field, 'is', null) : query.is(field, null);
  }
}
