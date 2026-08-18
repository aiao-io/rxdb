/**
 * `@aiao/rxdb-adapter-electron` 的**特权侧**入口。
 *
 * @remarks
 * 本入口引用 `node:sqlite`，只能在有 Node 运行时的地方加载——Electron 主进程，
 * 或它自己拥有的 `worker_threads` worker。**不要**把它打进 renderer bundle：
 * 那等于把文件系统能力还给了渲染进程，AC#3 的隔离随之作废。
 *
 * renderer 侧请用 `@aiao/rxdb-adapter-electron`。
 *
 * @module @aiao/rxdb-adapter-electron/host
 */

export {
  createElectronSqliteHost,
  type ElectronSqliteHost,
  type ElectronSqliteHostOptions
} from './electron-sqlite-host.js';

export { createElectronFileHost, type ElectronFileHost, type ElectronFileHostOptions } from './electron-file-host.js';

export { NodeSqliteEngine, type NodeSqliteEngineOptions } from './node-sqlite-engine.js';

// 协议、存储联合与错误类型已下沉到 `@aiao/rxdb-adapter-sqlite-core/desktop-host`（US-207 E1）。
// 本入口继续原样转出它们：宿主作者只装一个包就该拿全写 host 需要的东西，
// 让他们再去引一个共享层包等于把拆包的成本转嫁出去。
export { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

export {
  assertDesktopSqliteStorage,
  assertValidDesktopDatabaseName,
  isDesktopPgliteDirectoryStorage,
  isDesktopSqliteFileStorage,
  type DesktopPgliteDirectoryStorage,
  type DesktopSqliteFileStorage,
  type DesktopStorage
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

export {
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  DESKTOP_HOST_MAX_FILE_CHUNK_BYTES,
  DESKTOP_HOST_MAX_SQL_LENGTH,
  DESKTOP_HOST_PROTOCOL_VERSION,
  isDesktopHostFileRequestKind,
  parseDesktopHostFileRequest,
  parseDesktopHostRequest,
  type DesktopHostChangeEventMessage,
  type DesktopHostCloseRequest,
  type DesktopHostExecuteRequest,
  type DesktopHostFileEntry,
  type DesktopHostFileReadResult,
  type DesktopHostFileRequest,
  type DesktopHostFileResponse,
  type DesktopHostFileStat,
  type DesktopHostHandshakeRequest,
  type DesktopHostHandshakeResult,
  type DesktopHostOpenRequest,
  type DesktopHostOpenResult,
  type DesktopHostRequest,
  type DesktopHostResponse,
  type DesktopHostVersionRequest
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
