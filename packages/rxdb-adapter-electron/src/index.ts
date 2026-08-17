/**
 * `@aiao/rxdb-adapter-desktop` 的 **renderer 侧**入口。
 *
 * @remarks
 * 本入口只含跨传输层说话所需的东西，**不引用 `node:sqlite`**，因此可以安全地打进
 * 浏览器上下文的 renderer bundle。特权侧（Electron 主进程或它拥有的 worker）请改用
 * `@aiao/rxdb-adapter-desktop/host`。
 *
 * 协议、renderer client、存储联合与错误类型的**实现**已下沉到
 * `@aiao/rxdb-adapter-sqlite-core/desktop-host`（US-207 E1），两个桌面运行时共用一份。
 * 本入口原样转出它们：拆包不是 API 变更，用户的 import 一行都不该动。
 *
 * @module @aiao/rxdb-adapter-desktop
 */

export { ADAPTER_NAME as DESKTOP_ADAPTER_NAME } from './desktop-adapter.interface.js';
export { RxDBAdapterDesktop } from './RxDBAdapterDesktop.js';

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
  assertSupportedDesktopStorage,
  assertValidDesktopDatabaseName,
  isDesktopPgliteDirectoryStorage,
  isDesktopSqliteFileStorage,
  type DesktopPgliteDirectoryStorage,
  type DesktopRuntime,
  type DesktopSqliteFileStorage,
  type DesktopStorage,
  type SupportedDesktopStorage
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
