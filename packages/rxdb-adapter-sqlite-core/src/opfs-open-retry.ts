/**
 * @fileoverview OPFS 库打开时，等「库文件的同步访问句柄仍被占用」退去（US-221）。
 *
 * @remarks
 * 两个浏览器适配器落到的是同一个 VFS——wa-sqlite 的 `OPFSCoopSyncVFS`：`@aiao/rxdb-adapter-sqlite-wasm` 的 `opfs` 档
 * 经 `@subframe7536/sqlite-wasm` 用它，`@aiao/rxdb-adapter-wa-sqlite` 直接配它。它打开库时先拿以文件命名的 Web Lock，
 * 再 `createSyncAccessHandle()`。整页刷新时上一个页面的 Worker 正在销毁：锁先释放、句柄后关闭，新页面拿到锁去开句柄
 * 就撞上 `NoModificationAllowedError`。VFS 把这个错误打到控制台后吞掉，`open_v2` 只抛打开失败码 `SQLITE_CANTOPEN`，
 * 所以这里按失败码判定、退避重试；重试用尽后亲自试一次句柄，确实被占用就报占用，否则原样抛出最后一次的错误。
 * 探针自己失败时判不出占用，报的仍是那次打开失败，探针的错写进消息——它只是用来把错误说清楚的，不能顶替原因。
 * 每次重试都新建 VFS；失败那一次的 VFS 要用 {@link releaseOpfsCoopSyncHandles} 交出它留下的句柄，否则重试撞上的是自己。
 */

import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

/** 退避时长（毫秒），合计约 3 秒：刷新时上一个页面的句柄通常在百毫秒内关闭。删 OPFS 文件的重试也用这一组。 */
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
  /** 退避时长序列，默认 50 毫秒起逐次翻倍的六档（合计约 3 秒） */
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
 * @throws {@link RxDBAdapterSqliteError} 重试用尽、句柄仍被占用时，或探针自己失败、判不出占用时；最后一次的打开错误挂在 `cause` 上
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
      if (!(await isBusyOrExplain(options, error))) throw error;
      const waited = delays.reduce((sum, ms) => sum + ms, 0);
      throw new RxDBAdapterSqliteError(
        `OPFS database file "${options.fileName}" is held by another context (its sync access handle was not released within ${waited}ms)`,
        { cause: error }
      );
    }
  }
}

/**
 * 重试用尽后问一次句柄是否被占。
 *
 * @param options - 带探针的选项
 * @param lastError - 最后一次打开失败的错误
 * @returns 是否被占用
 * @throws {@link RxDBAdapterSqliteError} 探针自己失败时（比如在开不了同步访问句柄的上下文里）：`cause` 是 `lastError`，
 * 探针的错写进消息
 */
async function isBusyOrExplain(options: OpfsOpenRetryOptions, lastError: unknown): Promise<boolean> {
  try {
    return await options.isAccessHandleBusy();
  } catch (probeError) {
    const reason = probeError instanceof Error ? probeError.message : String(probeError);
    throw new RxDBAdapterSqliteError(
      `OPFS database file "${options.fileName}" could not be opened (SQLITE_CANTOPEN), and checking whether another context holds its sync access handle failed: ${reason}`,
      { cause: lastError }
    );
  }
}

/** 上游 `OPFSCoopSyncVFS` 里登记一个库文件或旁文件的对象（公开字段）。 */
interface CoopSyncPersistentFile {
  accessHandle: FileSystemSyncAccessHandle | null;
}

const persistentFilesOf = (vfs: object): ReadonlyMap<string, CoopSyncPersistentFile> => {
  const files: unknown = Reflect.get(vfs, 'persistentFiles');
  if (files instanceof Map) return files;
  throw new RxDBAdapterSqliteError(
    'OPFSCoopSyncVFS has no persistentFiles map: the upstream VFS changed, its leftover sync access handles cannot be released'
  );
};

/**
 * 交出 `OPFSCoopSyncVFS` 登记着的库文件同步访问句柄，包括此后才开出来的（US-221）。
 *
 * @param vfs - 不再使用的 `OPFSCoopSyncVFS` 实例（wa-sqlite 与 `@subframe7536/sqlite-wasm` 是同一份实现）
 * @throws {@link RxDBAdapterSqliteError} 实例上没有上游的 `persistentFiles` 登记表（上游实现变了）
 *
 * @remarks
 * 上游 `#requestAccessHandle()` 用 `Promise.all` 并行开库文件与 `-journal` / `-wal` 的句柄：库文件先失败时另外两个还在开，
 * 开出来后挂在 `persistentFiles` 上没人关，上游也没有实现 `close()`。同一上下文里重开就撞上自己留下的句柄，要等垃圾回收
 * 才放开，{@link openOpfsWithRetry} 的退避窗口里等不到。这里关掉已开的，并让之后才赋上的句柄一赋值就关，
 * 所以只能用在不再使用的实例上。库文件自己的登记在打开失败时已被 VFS 换掉：刷新竞态里上一个页面的三个句柄一起放，
 * 不会出现旁文件被占、库文件却开出来的局面。
 */
export function releaseOpfsCoopSyncHandles(vfs: object): void {
  for (const file of persistentFilesOf(vfs).values()) {
    file.accessHandle?.close();
    Object.defineProperty(file, 'accessHandle', {
      get: () => null,
      set: (handle: FileSystemSyncAccessHandle | null) => handle?.close()
    });
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
