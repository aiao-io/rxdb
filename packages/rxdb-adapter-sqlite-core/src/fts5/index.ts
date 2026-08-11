/**
 * SQLite FTS5 DDL 工具集
 *
 * 提供为 RxDB collection 自动生成 FTS5 虚拟表与同步 trigger 的纯函数，被
 * `@aiao/rxdb-plugin-search` 在挂载阶段调用。
 *
 * @packageDocumentation
 */

export { buildFtsTriggersSql } from './build-fts-triggers.js';
export type { FtsTriggerOptions } from './build-fts-triggers.js';
export { FTS_BIGRAM_SQL_FUNCTION, compileCjkToken, hasCjk, indexTextForFts } from './cjk-bigram.js';
export { buildCreateFtsTableSql } from './create-fts-table.js';
export type { FtsField } from './types.js';
