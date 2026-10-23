/**
 * PostgreSQL 全文搜索 DDL 工具集（PGlite 适配器）
 *
 * 提供为 RxDB collection 自动生成 `tsvector` 物化列、GIN 索引与同步 trigger 的纯函数。
 * API 形状对齐 `@aiao/rxdb-adapter-sqlite-core/fts5`，便于上层在两套存储后端之间切换。
 * 表在哪个 schema 由 {@link getSchemaName} 回答：可写检出位的影子表在 `<命名空间>$<后缀>` 里，
 * 全文索引要按它定位（US-314 B2.5）。
 *
 * @packageDocumentation
 */

export { getSchemaName } from '../table-name-resolver.js';
export { buildFtsTriggersSql } from './build-fts-triggers.js';
export { buildCreateFtsTableSql } from './create-fts-table.js';
export { DEFAULT_FTS_ARRAY_KIND, DEFAULT_FTS_REGCONFIG, FTS_COLUMN } from './types.js';
export type { FtsArrayKind, FtsField, FtsOptions } from './types.js';
