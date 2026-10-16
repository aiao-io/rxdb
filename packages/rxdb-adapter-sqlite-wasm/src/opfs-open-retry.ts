import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';

/**
 * @fileoverview OPFS 库打开时，等「库文件的同步访问句柄仍被占用」退去（US-221）。
 *
 * @remarks
 * OPFS VFS（wa-sqlite 的 `OPFSCoopSyncVFS`）打开库时先拿以文件命名的 Web Lock，再 `createSyncAccessHandle()`。
 * 整页刷新时上一个页面的 Worker 正在销毁：锁先释放、句柄后关闭，新页面拿到锁去开句柄就撞上 `NoModificationAllowedError`。
 * VFS 把这个错误打到控制台后吞掉，`open_v2` 只抛打开失败码 `SQLITE_CANTOPEN`，所以这里按失败码判定、退避重试；
 * 重试用尽后亲自试一次句柄，确实被占用就报占用，否则原样抛出最后一次的错误。
 */

/** 退避时长（毫秒），合计约 3 秒：刷新时上一个页面的句柄通常在百毫秒内关闭。 */
export const OPFS_OPEN_RETRY_DELAYS_MS: readonly number[] = [50, 100, 200, 400, 800, 1600];

/** sqlite 的打开失败码。 */
const SQLITE_CANTOPEN = 14;

const isCantOpen = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === SQLITE_CANTOPEN;

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** {@link openOpfsWithRetry} 的选项。 */
export interface OpfsOpenRetryOptions {
  /** 错误信息里点名的库文件 */
  readonly fileName: string;
  /** 库文件的同步访问句柄此刻是否被别的上下文占用 */
  readonly isAccessHandleBusy: () => Promise<boolean>;
  /** 退避时长序列，默认 {@link OPFS_OPEN_RETRY_DELAYS_MS} */
  readonly delaysMs?: readonly number[];
  /** 等待的实现，测试注入 */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * 打开 OPFS 库；打开失败码为 `SQLITE_CANTOPEN` 时按退避序列重试。
 *
 * @param open - 一次完整的打开（每次都新建 VFS 与连接）
 * @param options - 见 {@link OpfsOpenRetryOptions}
 * @returns `open` 的结果
 * @throws {@link RxDBAdapterSqliteError} 重试用尽、句柄仍被占用时；原错误挂在 `cause` 上
 */
export async function openOpfsWithRetry<T>(open: () => Promise<T>, options: OpfsOpenRetryOptions): Promise<T> {
  const delays = options.delaysMs ?? OPFS_OPEN_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? wait;
  for (let attempt = 0; ; attempt++) {
    try {
      return await open();
    } catch (error) {
      if (!isCantOpen(error)) throw error;
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      if (!(await options.isAccessHandleBusy())) throw error;
      const waited = delays.reduce((sum, ms) => sum + ms, 0);
      throw new RxDBAdapterSqliteError(
        `OPFS database file "${options.fileName}" is held by another context (its sync access handle was not released within ${waited}ms)`,
        { cause: error }
      );
    }
  }
}

/**
 * OPFS 根目录下的库文件此刻是否被别的上下文占着同步访问句柄。
 *
 * @param fileName - 库文件名
 * @returns 开得了句柄（随即关闭）或文件不存在时为 `false`；被占用（`NoModificationAllowedError`）时为 `true`
 *
 * @remarks
 * `createSyncAccessHandle()` 只在专用 Worker 里可用；OPFS VFS 本身也只在 Worker 里运行。
 */
export async function isOpfsAccessHandleBusy(fileName: string): Promise<boolean> {
  const root = await navigator.storage.getDirectory();
  let file: FileSystemFileHandle;
  try {
    file = await root.getFileHandle(fileName);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
  try {
    const access = await file.createSyncAccessHandle();
    access.close();
    return false;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NoModificationAllowedError') return true;
    throw error;
  }
}
