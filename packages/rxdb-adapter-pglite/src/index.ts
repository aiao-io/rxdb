/**
 * `@aiao/rxdb-adapter-pglite` — RxDB 适配器（PGlite / WebAssembly PostgreSQL 后端）。
 *
 * 公开三层 API：
 * - 适配器与客户端：{@link RxDBAdapterPGlite}, {@link PGliteClient}
 * - 数据访问：通过 {@link RxDBAdapterPGlite} 获取的 Repository
 * - SQL 生成（纯函数）：`create_tables_sql`, `generate_trigger_sql`,
 *   `notify_function_sql`，以及 PG 原生 FTS 模块（`fts/`）
 *
 * 测试工具单独从 `@aiao/rxdb-adapter-pglite/testing` 子路径导入，避免污染运行时包。
 *
 * @packageDocumentation
 */

export * from './fts/index.js';
export * from './pglite.interface.js';
export * from './pglite.utils.js';
export { RxdbAdapterPGliteError } from './pglite.utils.js';
export * from './PGliteClient.js';
export * from './RxDBAdapterPGlite.js';
export * from './sql_dialect.js';
export { create_tables_sql, create_tables_statements } from './table/create_tables_sql.js';
export * from './table/notify_function_sql.js';
export { remove_all_triggers_sql, remove_trigger_sql } from './table/remove_trigger_sql.js';
export { generate_trigger_sql } from './table/trigger_sql.js';
