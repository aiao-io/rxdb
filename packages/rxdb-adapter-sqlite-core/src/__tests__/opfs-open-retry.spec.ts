import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isOpfsAccessHandleBusy,
  openOpfsWithRetry,
  OPFS_OPEN_RETRY_DELAYS_MS,
  releaseOpfsCoopSyncHandles
} from '../opfs-open-retry.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

/**
 * @fileoverview US-221：OPFS 库打开时等「同步访问句柄仍被占用」退去的退避逻辑。
 *
 * @remarks
 * 真实 Worker 里的复现在两个适配器各自的 `opfs-reload-race.spec.ts`（sqlite-wasm 的 `opfs` 档、wa-sqlite 的
 * `OPFSCoopSyncVFS`）；这里注入等待与探针，把重试的判定钉死。
 */

/** `open_v2` 打开失败时抛的形状：`SQLiteError` 带 `code`（`SQLITE_CANTOPEN` 为 14）。 */
const cantOpen = () => Object.assign(new Error('sqlite3_open_v2'), { code: 14 });

describe('openOpfsWithRetry', () => {
  it('打开失败码是 SQLITE_CANTOPEN：按退避序列等待后重试，成功即返回', async () => {
    const open = vi.fn().mockRejectedValueOnce(cantOpen()).mockRejectedValueOnce(cantOpen()).mockResolvedValue('db');
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

    await expect(
      openOpfsWithRetry(open, { fileName: 'a.sqlite', sleep, isAccessHandleBusy: () => Promise.resolve(true) })
    ).resolves.toBe('db');

    expect(open).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(OPFS_OPEN_RETRY_DELAYS_MS.slice(0, 2));
  });

  it('其它错误不重试，原样抛出', async () => {
    const failure = Object.assign(new Error('file is not a database'), { code: 26 });
    const open = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

    await expect(
      openOpfsWithRetry(open, { fileName: 'a.sqlite', sleep, isAccessHandleBusy: () => Promise.resolve(true) })
    ).rejects.toBe(failure);
    expect(open).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('重试用尽、句柄仍被占用：报占用，原错误挂在 cause 上', async () => {
    const last = cantOpen();
    const open = vi.fn().mockRejectedValue(last);

    const error = await openOpfsWithRetry(open, {
      fileName: 'held.sqlite',
      delaysMs: [1, 1],
      sleep: () => Promise.resolve(),
      isAccessHandleBusy: () => Promise.resolve(true)
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
    expect((error as Error).message).toMatch(/held\.sqlite.*held by another context/);
    expect((error as Error).cause).toBe(last);
    expect(open).toHaveBeenCalledTimes(3);
  });

  // 探针只是用来把错误说清楚的：它自己失败（比如在开不了同步访问句柄的上下文里）时，用户该看到的仍是那次打开失败，
  // 不能被一个与原因无关的探针错误顶替（RV-083 P2-13）；探针的错也不能吞掉，写进消息里
  it('重试用尽、探针自己失败：报真正那次打开失败（挂在 cause 上），探针的错写进消息，不顶替它', async () => {
    const last = cantOpen();
    const open = vi.fn().mockRejectedValue(last);
    const probeFailure = new DOMException('createSyncAccessHandle is unavailable here', 'SecurityError');

    const error = await openOpfsWithRetry(open, {
      fileName: 'a.sqlite',
      delaysMs: [1],
      sleep: () => Promise.resolve(),
      isAccessHandleBusy: () => Promise.reject(probeFailure)
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
    expect((error as RxDBAdapterSqliteError).cause).toBe(last);
    expect((error as RxDBAdapterSqliteError).message).toContain('a.sqlite');
    expect((error as RxDBAdapterSqliteError).message).toContain('createSyncAccessHandle is unavailable here');
  });

  it('重试用尽、句柄没被占用：不是这类问题，原样抛出最后一次的错误', async () => {
    const last = cantOpen();
    const open = vi.fn().mockRejectedValue(last);

    await expect(
      openOpfsWithRetry(open, {
        fileName: 'a.sqlite',
        delaysMs: [1],
        sleep: () => Promise.resolve(),
        isAccessHandleBusy: () => Promise.resolve(false)
      })
    ).rejects.toBe(last);
  });
});

/** 只要 `close()` 的假句柄。 */
const fakeHandle = () => ({ close: vi.fn() });

describe('releaseOpfsCoopSyncHandles', () => {
  it('关掉 persistentFiles 上已开的句柄；之后才赋上的句柄一赋值就关，读出来是 null', () => {
    const journal = fakeHandle();
    const files = new Map([
      ['/a.sqlite-journal', { accessHandle: journal as ReturnType<typeof fakeHandle> | null }],
      ['/a.sqlite-wal', { accessHandle: null as ReturnType<typeof fakeHandle> | null }]
    ]);

    releaseOpfsCoopSyncHandles({ persistentFiles: files });
    expect(journal.close).toHaveBeenCalledOnce();

    // 上游 `#requestAccessHandle()` 里还在开的那个句柄，失败之后才落到 `accessHandle` 上
    const late = fakeHandle();
    const wal = files.get('/a.sqlite-wal')!;
    wal.accessHandle = late;
    expect(late.close).toHaveBeenCalledOnce();
    expect(wal.accessHandle).toBeNull();
  });

  it('实例上没有 persistentFiles 登记表：上游实现变了，报错而不是默默跳过', () => {
    expect(() => releaseOpfsCoopSyncHandles({})).toThrow(RxDBAdapterSqliteError);
  });
});

describe('isOpfsAccessHandleBusy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * 把 OPFS 根目录换成只认 `getFileHandle` 的假目录；真实的占用探测在适配器的真实 Worker 用例里。
   *
   * 整个 `navigator` 换成桩，不去 spy `navigator.storage`：本文件也在 node 里跑
   * （coverage-acceptance 的 core 段），那里没有 `navigator.storage`。
   */
  const fakeRoot = (getFileHandle: (name: string) => Promise<unknown>) => {
    const lookup = vi.fn(getFileHandle);
    vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({ getFileHandle: lookup }) } });
    return lookup;
  };

  /** 库文件存在，`createSyncAccessHandle()` 的结局由用例给。 */
  const fileWithAccess = (createSyncAccessHandle: () => Promise<unknown>) => () =>
    Promise.resolve({ createSyncAccessHandle });

  it('库文件不存在：不算占用', async () => {
    const lookup = fakeRoot(() => Promise.reject(new DOMException('gone', 'NotFoundError')));

    await expect(isOpfsAccessHandleBusy('a.sqlite')).resolves.toBe(false);
    expect(lookup).toHaveBeenCalledWith('a.sqlite');
  });

  it('开得了句柄：随即关掉，不算占用', async () => {
    const access = fakeHandle();
    fakeRoot(fileWithAccess(() => Promise.resolve(access)));

    await expect(isOpfsAccessHandleBusy('a.sqlite')).resolves.toBe(false);
    expect(access.close).toHaveBeenCalledOnce();
  });

  it('开句柄撞上 NoModificationAllowedError：算占用', async () => {
    fakeRoot(fileWithAccess(() => Promise.reject(new DOMException('held', 'NoModificationAllowedError'))));

    await expect(isOpfsAccessHandleBusy('a.sqlite')).resolves.toBe(true);
  });

  it('其它错误原样抛出：查找库文件时的、开句柄时的都一样', async () => {
    const lookupFailure = new DOMException('denied', 'SecurityError');
    fakeRoot(() => Promise.reject(lookupFailure));
    await expect(isOpfsAccessHandleBusy('a.sqlite')).rejects.toBe(lookupFailure);

    const accessFailure = new DOMException('broken', 'InvalidStateError');
    fakeRoot(fileWithAccess(() => Promise.reject(accessFailure)));
    await expect(isOpfsAccessHandleBusy('a.sqlite')).rejects.toBe(accessFailure);
  });
});
