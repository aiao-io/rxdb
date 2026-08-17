/**
 * 桌面 host 契约：Electron 与 Tauri 两条路径共用的线协议、renderer 客户端、
 * 存储配置联合与错误类型。
 *
 * @remarks
 * 本入口**不进主入口**。wa-sqlite / sqlite / sqlite-wasm / pglite / miniprogram 五个下游包
 * 吃的是 `@aiao/rxdb-adapter-sqlite-core` 主入口，协议层对它们是净负重——一行都用不上，
 * 却要跟着进 bundle。
 *
 * 反过来，把它留在某个运行时包里也不行：协议是**两端共有的契约**，宿主实现（Electron 的
 * `node:sqlite`、Tauri 的 `rusqlite`）各写各的，但请求形状、错误码与版本号必须只有一份。
 * 放进任一运行时包，另一端就得反向依赖它，或者照着抄第二份——`protocol.rs` 已经是照抄的
 * 那一份了，靠 `conformance/protocol-handshake.spec.ts` 把两侧常量绑住。
 *
 * 本入口里的符号刻意**不含任何运行时特有的东西**：没有 `node:` 内建、没有 Tauri `invoke`，
 * 因此浏览器 renderer 与 Node 主进程都能安全加载。适配器注册名（`ADAPTER_NAME`）也不在这里——
 * 那是每个运行时包各自的身份。
 *
 * @module @aiao/rxdb-adapter-sqlite-core/desktop-host
 */

export { DEFAULT_DATABASE_SUFFIX, type DesktopOptions } from './desktop/desktop-options.interface.js';

export {
  RxDBAdapterDesktopError,
  isRxDBAdapterDesktopErrorCode,
  type RxDBAdapterDesktopErrorCode
} from './desktop/desktop-error.js';

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
} from './desktop/desktop-storage.js';

export {
  DESKTOP_HOST_MAX_BINDINGS,
  DESKTOP_HOST_MAX_BLOB_BYTES,
  DESKTOP_HOST_MAX_FILE_CHUNK_BYTES,
  DESKTOP_HOST_MAX_PATH_LENGTH,
  DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES,
  DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION,
  DESKTOP_HOST_MAX_QUEUED_LOCKS_PER_NAME,
  DESKTOP_HOST_MAX_SQL_LENGTH,
  DESKTOP_HOST_PROTOCOL_VERSION,
  assertDesktopHostResponse,
  isDesktopHostFileRequestKind,
  parseDesktopHostChangeEvent,
  parseDesktopHostFileRequest,
  parseDesktopHostHandshakeResult,
  parseDesktopHostOpenResult,
  parseDesktopHostRequest,
  type DesktopHostChangeEventMessage,
  type DesktopHostCloseRequest,
  type DesktopHostExecuteRequest,
  type DesktopHostFileCloseRequest,
  type DesktopHostFileEntry,
  type DesktopHostFileLockAcquireRequest,
  type DesktopHostFileLockMode,
  type DesktopHostFileLockReleaseRequest,
  type DesktopHostFileMoveRequest,
  type DesktopHostFileOpenRequest,
  type DesktopHostFilePathRequest,
  type DesktopHostFileReadRequest,
  type DesktopHostFileReadResult,
  type DesktopHostFileRequest,
  type DesktopHostFileResponse,
  type DesktopHostFileStat,
  type DesktopHostFileWriteBeginRequest,
  type DesktopHostFileWriteChunkRequest,
  type DesktopHostFileWriteFinishRequest,
  type DesktopHostHandshakeRequest,
  type DesktopHostHandshakeResult,
  type DesktopHostOpenRequest,
  type DesktopHostOpenResult,
  type DesktopHostRequest,
  type DesktopHostResponse,
  type DesktopHostVersionRequest
} from './desktop/desktop-host-protocol.js';

export {
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopSqliteClientOptions
} from './desktop/desktop-sqlite-client.js';
