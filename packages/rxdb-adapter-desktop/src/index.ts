/**
 * `@aiao/rxdb-adapter-desktop` 的 **renderer 侧**入口。
 *
 * @remarks
 * 本入口只含跨传输层说话所需的东西，**不引用 `node:sqlite`**，因此可以安全地打进
 * 浏览器上下文的 renderer bundle。特权侧（Electron 主进程或它拥有的 worker）请改用
 * `@aiao/rxdb-adapter-desktop/host`。
 *
 * @module @aiao/rxdb-adapter-desktop
 */

export {
  ADAPTER_NAME as DESKTOP_ADAPTER_NAME,
  DEFAULT_DATABASE_SUFFIX as DESKTOP_DEFAULT_DATABASE_SUFFIX,
  type DesktopOptions
} from './desktop-adapter.interface.js';
export { RxDBAdapterDesktop } from './RxDBAdapterDesktop.js';

export { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from './desktop-error.js';

export { decodeDesktopJsonPayload, encodeDesktopJsonPayload } from './desktop-json-codec.js';

export {
  TAURI_DESKTOP_CHANGE_EVENT,
  TAURI_DESKTOP_REQUEST_COMMAND,
  createTauriHostTransport,
  type TauriHostTransportOptions
} from './tauri-host-transport.js';

export {
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopSqliteClientOptions
} from './desktop-sqlite-client.js';

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
} from './desktop-storage.js';

export {
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  DESKTOP_HOST_MAX_SQL_LENGTH,
  DESKTOP_HOST_PROTOCOL_VERSION,
  assertDesktopHostResponse,
  parseDesktopHostChangeEvent,
  parseDesktopHostOpenResult,
  type DesktopHostChangeEventMessage,
  type DesktopHostCloseRequest,
  type DesktopHostExecuteRequest,
  type DesktopHostOpenRequest,
  type DesktopHostOpenResult,
  type DesktopHostRequest,
  type DesktopHostResponse,
  type DesktopHostVersionRequest
} from './desktop-host-protocol.js';
