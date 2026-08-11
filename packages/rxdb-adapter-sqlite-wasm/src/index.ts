/**
 * @fileoverview `@aiao/rxdb-adapter-sqlite-wasm` 包入口。
 *
 * 浏览器侧 @subframe7536/sqlite-wasm 适配器。结构与 `rxdb-adapter-wa-sqlite` 一一对应，
 * 只是底层 SQLite 实现换成 sqlite-wasm + 派生 VFS 加载逻辑。
 *
 * 入口分层：
 * - core 共享类型与函数（从 `@aiao/rxdb-adapter-sqlite-core` 再导出）
 * - 适配器主体 `RxDBAdapterSqlite`
 * - 客户端 `SqliteClient`，负责 SQLite 连接、变更拦截与批量派发
 * - 加载工具 `sqliteLoad`：按 VFS 选型懒加载 sqlite-wasm 产物
 *
 * @module @aiao/rxdb-adapter-sqlite-wasm
 */

// 从 core 重新导出共享类型和函数。
export {
  ROWID,
  RxDBAdapterSqliteError,
  SqliteRepository,
  buildRuleGroup,
  releaseComlinkProxy,
  get_table_name as sqliteGetTableName,
  get_table_name_by_metadata as sqliteGetTableNameByMetadata
} from '@aiao/rxdb-adapter-sqlite-core';
export type { GenerateSqlResult, RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

// sqlite-wasm（@subframe7536/sqlite-wasm）专用导出。
export { createSqliteClient } from './create_sqlite_client.js';
export { RxDBAdapterSqlite } from './RxDBAdapterSqlite.js';
export { SQLITE_WASM_VFS_LIST, sqliteLoad } from './sqlite-load.utils.js';
export type { SqliteOptions, SupportVFS } from './sqlite.interface.js';
export { SqliteClient } from './SqliteClient.js';
