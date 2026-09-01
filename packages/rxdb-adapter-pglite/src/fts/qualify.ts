import { pgDialect } from '../sql_dialect.js';

/**
 * 拼出 FTS DDL 里的表引用：给了 schema 就限定，没给就交给 `search_path`。
 *
 * @remarks
 * 单独成模块是因为建表器与建 trigger 器**必须**拼出字面相同的引用：
 * `CREATE INDEX ... ON <ref>` 与 `CREATE TRIGGER ... ON <ref>` 指的要是同一张表。
 * 两边各写一份 `schema === undefined ? ... : ...` 迟早有一边被改漏，而症状是
 * 「索引建在 A 表、trigger 挂在 B 表」这种没有报错的错位。
 *
 * @param table - 表名（不含 schema）
 * @param schema - schema 名；省略则不限定
 * @returns 可直接插入 SQL 的转义表引用
 * @internal
 */
export const qualifyFtsTable = (table: string, schema?: string): string => {
  const escapedTable = pgDialect.escapeIdentifier(table);
  if (schema === undefined) return escapedTable;
  return `${pgDialect.escapeIdentifier(schema)}.${escapedTable}`;
};
