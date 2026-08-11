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
