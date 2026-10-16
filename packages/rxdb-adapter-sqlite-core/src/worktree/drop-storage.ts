/**
 * @fileoverview SQLite 系 `dropStorage()` 共用的删存储工具（只读检出位回收快照库，US-313）。
 *
 * @remarks
 * 各后端只决定「这个库落在哪」（IndexedDB 库名、OPFS 文件名），删的动作在这里写一次：
 * 被别的连接挡住要报错而不是一直等，OPFS 的同步访问句柄在 Worker 退出后还会占一会儿，要按退避重试。
 */

import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

/** 退避时长（毫秒），与 OPFS 打开重试同一组：句柄通常在百毫秒内放开。 */
const OPFS_REMOVE_RETRY_DELAYS_MS: readonly number[] = [50, 100, 200, 400, 800, 1600];

/** 删 IndexedDB 库时被别的连接挡住多久就放弃。 */
const IDB_BLOCKED_GRACE_MS = 3000;

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 删一个 IndexedDB 库；库不存在时什么都不做。
 *
 * @param name - IndexedDB 库名
 * @throws {@link RxDBAdapterSqliteError} 库被别的连接挡住超过宽限期；或删除本身失败
 */
export const deleteIndexedDatabase = (name: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(new RxDBAdapterSqliteError(`IndexedDB database "${name}" could not be deleted`, { cause: request.error }));
    };
    request.onblocked = () => {
      timer = setTimeout(
        () => reject(new RxDBAdapterSqliteError(`IndexedDB database "${name}" is still open elsewhere`)),
        IDB_BLOCKED_GRACE_MS
      );
    };
  });

const isDomError = (error: unknown, ...names: readonly string[]): boolean =>
  error instanceof DOMException && names.includes(error.name);

/**
 * 删 OPFS 根目录下的一组文件；不存在的跳过。
 *
 * @param names - 文件名（库文件与它的日志旁文件）
 * @throws {@link RxDBAdapterSqliteError} 重试用尽仍被占用；原错误挂在 `cause` 上
 *
 * @remarks
 * 断开之后同步访问句柄要等 VFS 关文件、或持有它的 Worker 退出才放开，这中间 `removeEntry` 报
 * `NoModificationAllowedError`（Chromium 在部分版本报 `InvalidModificationError`），按退避重试。
 */
export const removeOpfsFiles = async (names: readonly string[]): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  for (const name of names) {
    for (let attempt = 0; ; attempt++) {
      try {
        await root.removeEntry(name);
        break;
      } catch (error) {
        if (isDomError(error, 'NotFoundError')) break;
        const busy = isDomError(error, 'NoModificationAllowedError', 'InvalidModificationError');
        if (!busy) throw error;
        if (attempt >= OPFS_REMOVE_RETRY_DELAYS_MS.length) {
          throw new RxDBAdapterSqliteError(`OPFS file "${name}" is still held by another context`, { cause: error });
        }
        await wait(OPFS_REMOVE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }
};
