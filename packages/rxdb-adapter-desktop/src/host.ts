/**
 * `@aiao/rxdb-adapter-desktop` 的**特权侧**入口。
 *
 * @remarks
 * 本入口引用 `node:sqlite`，只能在有 Node 运行时的地方加载——Electron 主进程，
 * 或它自己拥有的 `worker_threads` worker。**不要**把它打进 renderer bundle：
 * 那等于把文件系统能力还给了渲染进程，AC#5 的隔离随之作废。
 *
 * renderer 侧请用 `@aiao/rxdb-adapter-desktop`。
 *
 * @module @aiao/rxdb-adapter-desktop/host
 */

export {
  createDesktopSqliteHost,
  type DesktopSqliteHost,
  type DesktopSqliteHostOptions
} from './desktop-sqlite-host.js';

export { NodeSqliteEngine, type NodeSqliteEngineOptions } from './node-sqlite-engine.js';

export { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from './desktop-error.js';

export {
  assertSupportedDesktopStorage,
  assertValidDesktopDatabaseName,
  isDesktopPgliteDirectoryStorage,
  isDesktopSqliteFileStorage,
  type DesktopPgliteDirectoryStorage,
  type DesktopRuntime,
  type DesktopSqliteFileStorage,
  type DesktopStorage
} from './desktop-storage.js';

export {
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  DESKTOP_HOST_MAX_SQL_LENGTH,
  DESKTOP_HOST_PROTOCOL_VERSION,
  parseDesktopHostRequest,
  type DesktopHostChangeEventMessage,
  type DesktopHostCloseRequest,
  type DesktopHostExecuteRequest,
  type DesktopHostOpenRequest,
  type DesktopHostOpenResult,
  type DesktopHostRequest,
  type DesktopHostResponse,
  type DesktopHostVersionRequest
} from './desktop-host-protocol.js';
