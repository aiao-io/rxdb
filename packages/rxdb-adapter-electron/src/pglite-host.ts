/**
 * `@aiao/rxdb-adapter-electron` 的 **PGlite 特权侧**入口。
 *
 * @remarks
 * 与 `@aiao/rxdb-adapter-electron/host` 分开而不是并进去，理由是依赖：那个入口只要
 * `node:sqlite`（Node 内建，装了就有），本入口却要 `@electric-sql/pglite` 这个可选 peer。
 * 合并的话，任何一个只用 SQLite 的宿主应用都会在加载 host 时撞上「找不到
 * `@electric-sql/pglite`」——而它压根没打算用 PGlite。
 *
 * 本入口只能在有 Node 运行时的地方加载（Electron 主进程，或它自己拥有的 worker）。
 * renderer 侧请用 `@aiao/rxdb-adapter-electron/pglite`。
 *
 * @module @aiao/rxdb-adapter-electron/pglite-host
 */

export {
  DESKTOP_PGLITE_WATCH_CHANNELS,
  createElectronPgliteHost,
  type ElectronPgliteHost,
  type ElectronPgliteHostOptions,
  type ElectronPgliteRuntime,
  type ElectronPgliteRuntimeResult,
  type ElectronPgliteTransaction
} from './pglite-host/electron-pglite-host.js';

// 协议与错误类型原样转出，理由与 `./host` 入口一致：宿主作者只装一个包，
// 就该拿全写一个 PGlite host 需要的全部东西。
export {
  DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS,
  DESKTOP_PGLITE_MAX_BEGIN_TIMEOUT_MS,
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  RxDBAdapterDesktopError,
  // 宿主自己拼数据目录路径时要用：协议校验管的是「请求合法」，落盘前那次校验管的是
  // 「拼进 join() 的东西不会越出数据根」。不转出来，宿主就只能自己再写一份同样的规则。
  assertValidDesktopDatabaseName,
  isDesktopPgliteRequestKind,
  parseDesktopPgliteRequest,
  type DesktopPgliteNotifyMessage,
  type DesktopPgliteQueryResult,
  type DesktopPgliteRequest,
  type DesktopPgliteResponse,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
