/**
 * @fileoverview `@aiao/rxdb-adapter-wa-sqlite` 包入口。
 *
 * 浏览器侧 wa-sqlite（nicolo-ribaudo/wa-sqlite）适配器；同时承担 sqlite-wasm
 * 适配器的**基线实现** —— 两者继承同一 `RxDBAdapterSqliteBase`，通过不同的
 * `createSqliteClient` / VFS 加载逻辑派生。
 *
 * 入口分层：
 * - core 共享类型与函数（从 `@aiao/rxdb-adapter-sqlite-core` 再导出）
 * - wa-sqlite 适配器主体 `RxDBAdapterWaSqlite`（同时以 `RxDBAdapterSqlite` 别名导出，便于 sqlite-wasm / wa-sqlite 共享代码路径）
 * - 客户端 `WaSqliteClient`，负责 SQLite 连接、变更拦截与批量派发
 * - 加载工具 `waSqliteLoad`：按 VFS 选型懒加载 `wa-sqlite`/wasm 产物
 *
 * @module @aiao/rxdb-adapter-wa-sqlite
 */

// 从 core 重新导出共享类型和函数。
export {
  ROWID,
  RxDBAdapterSqliteError,
  SqliteRepository,
  buildRuleGroup,
  get_table_name as sqliteGetTableName,
  get_table_name_by_metadata as sqliteGetTableNameByMetadata
} from '@aiao/rxdb-adapter-sqlite-core';
export type { GenerateSqlResult, RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

// wa-sqlite 专用导出。
export { RxDBAdapterWaSqlite as RxDBAdapterSqlite, RxDBAdapterWaSqlite } from './RxDBAdapterSqlite.js';
export { WA_SQLITE_VFS_LIST, waSqliteLoad as sqliteLoad, waSqliteLoad } from './sqlite-load.utils.js';
export type { LoadedSqlite, WaSqliteVfsConfig, WaSqliteVfsFactory } from './sqlite-load.utils.js';
export type {
  LoadModuleOptions,
  WaSqliteOptions as SqliteOptions,
  WaSqliteRepositoryConstructor as SqliteRepositoryConstructor,
  SupportVFS,
  WaSqliteOptions,
  WaSqliteRepositoryConstructor
} from './sqlite.interface.js';
export {
  BATCH_TIMEOUT,
  WaSqliteClient as SqliteClient,
  WA_SQLITE_MAX_DATABASE_NAME_BYTES,
  WaSqliteClient,
  assertWaSqliteDatabaseName
} from './SqliteClient.js';
export type { ResolvedWaSqliteClientOptions, WaSqliteClientRuntime } from './SqliteClient.js';
