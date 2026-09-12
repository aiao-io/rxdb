import type { DevToolsForcedVfs } from './devtools-runtime-config';

/**
 * wa-sqlite 可用的 VFS 后端。
 *
 * - `OPFSCoopSyncVFS` —— OPFS 同步访问，首选；
 * - `IDBBatchAtomicVFS` —— OPFS 不可用时经 SharedWorker 走 IndexedDB；
 * - `unavailable` —— 两者都没有，本地库开不起来。
 */
export type WaSqliteBackend = 'OPFSCoopSyncVFS' | 'IDBBatchAtomicVFS' | 'unavailable';

/**
 * 按运行时能力挑选 wa-sqlite 后端。
 *
 * @param opfsAvailable - OPFS 是否可用（见 `checkOPFSAvailable`）
 * @param sharedWorkerAvailable - 当前环境是否有 `SharedWorker`
 * @returns 选中的后端；两项能力都缺时返回 `'unavailable'`
 *
 * @remarks
 * 纯函数，不碰全局对象 —— 能力探测与后端决策拆开，决策才能被直接测到。
 */
export function selectWaSqliteBackend(opfsAvailable: boolean, sharedWorkerAvailable: boolean): WaSqliteBackend {
  if (opfsAvailable) return 'OPFSCoopSyncVFS';
  return sharedWorkerAvailable ? 'IDBBatchAtomicVFS' : 'unavailable';
}

/**
 * 把 VFS 强制档映射成后端决策（US-905 AC#6 三态实测）。
 *
 * @param forced - 注入的强制档（`DEV_RXDB_DEVTOOLS_FORCE_VFS`）
 * @returns 对应后端；`unavailable` 直接透传，让建库诚实失败
 *
 * @remarks
 * 纯映射不探测：强制档的意义就是**不看**运行时能力 —— 强制 opfs 要在没有真 OPFS 的
 * WebView 上照样把 OPFSCoopSyncVFS 的名字宣告出去，探测会把它悄悄改成另一个后端，
 * 实测就成了「测了等于没测」。
 */
export function resolveForcedBackend(forced: DevToolsForcedVfs): WaSqliteBackend {
  if (forced === 'opfs') return 'OPFSCoopSyncVFS';
  if (forced === 'idb') return 'IDBBatchAtomicVFS';
  return 'unavailable';
}

/**
 * 一次后端判定：有强制档时直接映射，没有时按运行时能力挑选。
 *
 * @param forced - 注入的强制档；`undefined` 走探测
 * @param opfsAvailable - OPFS 探测（`checkOPFSAvailable`），**只在未强制时被调用**
 * @param sharedWorkerAvailable - 当前环境是否有 `SharedWorker`
 * @returns 本次运行的后端决策
 *
 * @remarks
 * 与 {@link selectWaSqliteBackend} / {@link resolveForcedBackend} 同样纯：探测函数作为
 * 参数注入，决策本身可以被行为级测到 —— 强制档下探测函数根本不被调用。
 */
export function resolveWaSqliteBackend(
  forced: DevToolsForcedVfs | undefined,
  opfsAvailable: () => Promise<boolean>,
  sharedWorkerAvailable: boolean
): Promise<WaSqliteBackend> {
  if (forced !== undefined) return Promise.resolve(resolveForcedBackend(forced));
  return opfsAvailable().then(opfs => selectWaSqliteBackend(opfs, sharedWorkerAvailable));
}
