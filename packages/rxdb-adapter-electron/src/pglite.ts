/**
 * `@aiao/rxdb-adapter-electron` 的 **PGlite renderer 侧**入口。
 *
 * @remarks
 * 与默认入口分开而不是并进去，理由是依赖：默认入口只要共享层，本入口却要
 * `@aiao/rxdb-adapter-pglite` 这个可选 peer。合并的话，任何一个只用 SQLite 的应用
 * 都会在 import 适配器时撞上「找不到 `@aiao/rxdb-adapter-pglite`」——而它压根没打算用 PGlite。
 *
 * 本入口**不引用 PostgreSQL 运行时**：WASM 实例活在主进程，renderer 这边只有一层协议
 * 代理，从 `@electric-sql/pglite` 拿的只有类型和 `/template` 那个约 2 KB 的模板编译子路径，
 * 因此 bundle 里不会多出几十兆的 PostgreSQL。特权侧请用
 * `@aiao/rxdb-adapter-electron/pglite-host`。
 *
 * @module @aiao/rxdb-adapter-electron/pglite
 */

export {
  DEFAULT_DATA_DIRECTORY_SUFFIX as DESKTOP_DEFAULT_DATA_DIRECTORY_SUFFIX,
  ADAPTER_NAME as ELECTRON_PGLITE_ADAPTER_NAME,
  type ElectronPGliteOptions
} from './pglite/pglite-adapter.interface.js';

export { RxDBAdapterElectronPGlite } from './pglite/RxDBAdapterElectronPGlite.js';

export { DesktopPGliteClient, type DesktopPGliteClientOptions } from './pglite/desktop-pglite-client.js';

// 协议常量与错误类型原样转出，理由与默认入口一致：下游按名字 import，
// 实现搬到哪个共享包不该让用户改行。
export {
  DESKTOP_HOST_TRANSPORT_KEY,
  DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS,
  DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS,
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  RxDBAdapterDesktopError,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopPgliteNotifyMessage,
  type DesktopPgliteQueryResult,
  type DesktopPgliteRequest,
  type DesktopPgliteResponse,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
