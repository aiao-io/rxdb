/**
 * @fileoverview SQLite family 的区间排他触发器（US-030 阶段 C）。
 *
 * SQLite 没有 `EXCLUDE`，每条排他落成两个触发器：插入（`_i`）与更新（`_u`），名字仍以 `ex_`
 * 起头、进漂移比对。语义与 PG 侧的 `EXCLUDE USING gist` 逐项对齐：
 * - 相等列用 `=` 比较：任一侧为 NULL 结果即未知，不算冲突（PG `WITH =` 同样如此）；
 * - 区间端点 NULL 即该侧无界；`[)` 用 `<`、`[]` 用 `<=` 判相交；
 * - 空区间与倒置区间不与任何行冲突（PG 侧以 `CASE … THEN 'empty'` 映射，见核心的
 *   `exclusionRangeExpressionPG`）；
 * - 判定按主键排除被写入行自身：UPDATE 只在自身范围内扩区间不与自身旧值比（AC#12）。
 *
 * 用 `AFTER` 而不是 `BEFORE`：`BEFORE` 触发器先于 NOT NULL / CHECK 求值，同一行同时违反
 * CHECK 与排他时，SQLite 会报排他而 PG 报 CHECK（PG 先做行约束、插索引时才查排他），两后端的
 * 错误类就分叉了。`AFTER` 时行约束已经通过，`RAISE(ABORT)` 回滚整条语句，效果与 `BEFORE` 一致。
 *
 * 违约消息 `rxdb:exclusion_violation:<约束名>:<JSON>`，JSON 是逐维的
 * `[本行起点, 本行终点, 已有行起点, 已有行终点]`（`CAST(… AS TEXT)`：bigint 不丢精度、
 * 时间列本就是 ISO 文本）。`RAISE()` 接受表达式需要 SQLite ≥ 3.47.0，即宿主版本门槛（AC#7）。
 *
 * 判定是按相等列查找同组行；SQLite 不会为此自动建索引，大表上请为相等列另行声明普通索引。
 */

import {
  EXCLUSION_VIOLATION_MESSAGE_PREFIX,
  exclusionTriggerNames,
  sqlStringLiteral,
  type CompiledExclusionConstraint,
  type CompiledExclusionRange,
  type EntityMetadata,
  type WorktreeTableSet
} from '@aiao/rxdb';
import { get_primary_key_column, quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_storage_object_name, get_table_name_by_metadata } from '../table-name-resolver.js';

/** 已有行的表别名（与 `NEW` 并列出现在判定条件里）。 */
const EXISTING = quote_sql_identifier('rxdb_existing');

const column = (row: string, name: string): string => `${row}.${quote_sql_identifier(name)}`;

/** 一维区间非空：端点任一为 NULL（无界）即非空，否则 `[)` 要求起点 < 终点、`[]` 要求起点 ≤ 终点。 */
const nonEmpty = (range: CompiledExclusionRange, row: string): string => {
  const from = column(row, range.from.column);
  const to = column(row, range.to.column);
  const less = range.bounds === '[)' ? '<' : '<=';
  return `(${from} IS NULL OR ${to} IS NULL OR ${from} ${less} ${to})`;
};

/** 两个非空区间相交：每一侧的起点都在另一侧的终点之前（NULL 端点即无界）。 */
const overlaps = (range: CompiledExclusionRange): string => {
  const less = range.bounds === '[)' ? '<' : '<=';
  const before = (fromRow: string, toRow: string): string => {
    const from = column(fromRow, range.from.column);
    const to = column(toRow, range.to.column);
    return `(${from} IS NULL OR ${to} IS NULL OR ${from} ${less} ${to})`;
  };
  return `${before(EXISTING, 'NEW')} AND ${before('NEW', EXISTING)}`;
};

/** 违约消息的 JSON 载荷：逐维 `[本行起点, 本行终点, 已有行起点, 已有行终点]`。 */
const payload = (exclusion: CompiledExclusionConstraint): string => {
  const dimensions = exclusion.ranges.map(range => {
    const endpoints = ['NEW', EXISTING].flatMap(row =>
      [range.from, range.to].map(endpoint => `CAST(${column(row, endpoint.column)} AS TEXT)`)
    );
    return `json_array(${endpoints.join(', ')})`;
  });
  return `json_array(${dimensions.join(', ')})`;
};

/**
 * 生成一条区间排他的两个触发器（插入 / 更新）。
 *
 * @param metadata - 实体元数据
 * @param exclusion - 核心编译后的区间排他（`compileExclusionConstraint`）
 * @returns 两条 `CREATE TRIGGER` 语句
 */
export const exclusion_trigger_sql = (
  metadata: EntityMetadata,
  exclusion: CompiledExclusionConstraint,
  tableSet: WorktreeTableSet
): string => {
  const tableName = quote_sql_identifier(get_table_name_by_metadata(metadata, tableSet));
  const primaryKey = get_primary_key_column(metadata);
  // 触发器是库级对象，名字按表集错开；违约消息里嵌的仍是约束的逻辑名，违约归一按它认约束
  const [insertTrigger, updateTrigger] = exclusionTriggerNames(
    get_storage_object_name(exclusion.name, metadata, tableSet)
  );
  const conditions = [
    `${column(EXISTING, primaryKey)} != ${column('NEW', primaryKey)}`,
    ...exclusion.equal.map(({ column: name }) => `${column(EXISTING, name)} = ${column('NEW', name)}`),
    ...exclusion.ranges.flatMap(range => [nonEmpty(range, 'NEW'), nonEmpty(range, EXISTING), overlaps(range)])
  ];
  const message = sqlStringLiteral(`${EXCLUSION_VIOLATION_MESSAGE_PREFIX}${exclusion.name}:`);
  const body = [
    'BEGIN',
    `  SELECT RAISE(ABORT, ${message} || ${payload(exclusion)})`,
    `  FROM ${tableName} AS ${EXISTING}`,
    `  WHERE ${conditions.join('\n    AND ')}`,
    '  LIMIT 1;',
    'END;'
  ].join('\n');
  // 更新触发器只盯排他涉及的列：没写这些列的 UPDATE 不可能造出新的重叠
  const watched = [
    ...new Set([...exclusion.equal, ...exclusion.ranges.flatMap(range => [range.from, range.to])].map(c => c.column))
  ]
    .map(quote_sql_identifier)
    .join(', ');
  return [
    `CREATE TRIGGER ${quote_sql_identifier(insertTrigger)} AFTER INSERT ON ${tableName}\n${body}`,
    `CREATE TRIGGER ${quote_sql_identifier(updateTrigger)} AFTER UPDATE OF ${watched} ON ${tableName}\n${body}`
  ].join('\n');
};
