const SINGLE_RESULT_PREFIX = /^(select|explain)\b/i;
const RETURNING_CLAUSE = /\breturning\b/i;

/**
 * 去除末尾分号与空白，便于后续判断是否为单语句。
 *
 * @remarks
 * 末尾分号用线性扫描剥掉而不是 `replace(/;+\s*$/u, '')`：后者在分号串后面还有内容时
 * （`'a' + ';'.repeat(30000) + 'b'`），每个起点都要吃完整串再逐个回退，整体 O(n²)（CS-004）。
 * 语义不变 —— `trim()` 之后 `\s*$` 只能匹配空串，正则实际只剥「末尾连续的分号」，
 * 被空格隔开的分号（`'select 1; ;'`）两种写法都保留。
 *
 * @param sql - 原始 SQL 字符串
 * @returns 不含尾部分号、空白的 SQL
 */
export function normalizeSingleStatementSql(sql: string): string {
  const trimmedSql = sql.trim();
  let end = trimmedSql.length;
  while (end > 0 && trimmedSql[end - 1] === ';') {
    end--;
  }
  return trimmedSql.slice(0, end).trimEnd();
}

/**
 * 判断是否应当走 prepared statement 路径（而非批量 exec）。
 *
 * 满足全部条件才返回 true：
 * - 是单条语句（normalize 后不含 `;`）
 * - 是 SELECT/EXPLAIN，或 DML 含 RETURNING 子句（需要返回结果集）
 *
 * 多语句 / 纯 DML 走 exec 路径，避免 prepare 的额外开销。
 */
export function shouldUsePreparedStatementPath(sql: string): boolean {
  const normalizedSql = normalizeSingleStatementSql(sql);
  if (!normalizedSql || normalizedSql.includes(';')) return false;
  return SINGLE_RESULT_PREFIX.test(normalizedSql) || RETURNING_CLAUSE.test(normalizedSql);
}

/**
 * 判断语句是否为纯读（SELECT / EXPLAIN）。
 *
 * @remarks
 * SQLite 的 `db.changes()` 只在 INSERT/UPDATE/DELETE 之后有意义；对 SELECT 调用它拿到的是
 * **上一条写语句**遗留的计数。把这个数当成 SELECT 的 `rowsAffected` 返回，调用方会读到一个
 * 与本次查询毫无关系的数字（SQLC-030）。带 `RETURNING` 的 DML 不算纯读——它确实改了行。
 */
export function isReadOnlyStatement(sql: string): boolean {
  const normalizedSql = normalizeSingleStatementSql(sql);
  return SINGLE_RESULT_PREFIX.test(normalizedSql) && !RETURNING_CLAUSE.test(normalizedSql);
}
