/**
 * PostgreSQL 标识符转义
 */

/** 常见 PG 保留字（小写）；用于决定是否强制双引号 */
const PG_RESERVED = new Set([
  'all',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'asymmetric',
  'authorization',
  'binary',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'column',
  'concurrently',
  'constraint',
  'create',
  'cross',
  'current_catalog',
  'current_date',
  'current_role',
  'current_schema',
  'current_time',
  'current_timestamp',
  'current_user',
  'default',
  'deferrable',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'false',
  'fetch',
  'for',
  'foreign',
  'freeze',
  'from',
  'full',
  'grant',
  'group',
  'having',
  'ilike',
  'in',
  'initially',
  'inner',
  'intersect',
  'into',
  'is',
  'isnull',
  'join',
  'lateral',
  'leading',
  'left',
  'like',
  'limit',
  'localtime',
  'localtimestamp',
  'natural',
  'not',
  'notnull',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'outer',
  'overlaps',
  'placing',
  'primary',
  'references',
  'returning',
  'right',
  'select',
  'session_user',
  'similar',
  'some',
  'symmetric',
  'table',
  'tablesample',
  'then',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'user',
  'using',
  'variadic',
  'verbose',
  'when',
  'where',
  'window',
  'with'
]);

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * 判断标识符是否需要双引号
 * @param name - 原始标识符
 */
export function needsQuotes(name: string): boolean {
  if (!name) return true;
  if (!SAFE_IDENT.test(name)) return true;
  return PG_RESERVED.has(name.toLowerCase());
}

/**
 * 将标识符安全嵌入 SQL（必要时双引号）
 * @param name - 原始标识符
 */
export function quoteIdent(name: string): string {
  if (!needsQuotes(name)) return name;
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * 记录已转义标识符的路径（table 或 table.column）
 * @param escaped - 收集集合
 * @param path - 路径
 * @param raw - 原始名称
 */
export function trackEscaped(escaped: Set<string>, path: string, raw: string): void {
  if (needsQuotes(raw)) escaped.add(path);
}
