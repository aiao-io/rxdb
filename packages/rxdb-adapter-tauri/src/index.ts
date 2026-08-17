/**
 * `@aiao/rxdb-adapter-tauri` 的入口。
 *
 * @remarks
 * 本包**只有一侧**：WebView。Electron 那边分 `.` 与 `./host` 两个入口，是因为特权侧的
 * `node:sqlite` 宿主也是 TypeScript 写的，必须挡在单独的入口后面，免得被打进 renderer bundle。
 * Tauri 的特权侧是 Rust——它随应用二进制走，不经 npm 分发，也就没有第二个入口可分。
 * 相应地，本包内不该出现任何 `node:` 内建（`tsconfig.lib.json` 的 `types: []` 钉住了这一点）。
 *
 * 协议、renderer client、存储联合与错误类型的**实现**在
 * `@aiao/rxdb-adapter-sqlite-core/desktop-host`（US-207 E1），两个桌面运行时共用一份，
 * 与 Rust 侧的 `protocol.rs` 由 `conformance/protocol-handshake.spec.ts` 绑住。
 * 本入口原样转出它们：下游按名字 import，实现搬到哪个包不该让用户改行。
 *
 * @module @aiao/rxdb-adapter-tauri
 */

export { ADAPTER_NAME as TAURI_ADAPTER_NAME } from './tauri-adapter.interface.js';
export { RxDBAdapterTauri } from './RxDBAdapterTauri.js';
export type { TauriOptions } from './tauri-options.interface.js';

export { decodeDesktopJsonPayload, encodeDesktopJsonPayload } from './desktop-json-codec.js';

export {
  TAURI_DESKTOP_CHANGE_EVENT,
  TAURI_DESKTOP_REQUEST_COMMAND,
  createTauriHostTransport,
  type TauriHostTransportOptions
} from './tauri-host-transport.js';

export {
  DEFAULT_DATABASE_SUFFIX as DESKTOP_DEFAULT_DATABASE_SUFFIX,
  type DesktopOptions
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

export {
  RxDBAdapterDesktopError,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

export {
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopSqliteClientOptions
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

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
  assertDesktopHostResponse,
  parseDesktopHostChangeEvent,
  parseDesktopHostHandshakeResult,
  parseDesktopHostOpenResult,
  type DesktopHostChangeEventMessage,
  type DesktopHostCloseRequest,
  type DesktopHostExecuteRequest,
  type DesktopHostFileEntry,
  type DesktopHostFileLockMode,
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
