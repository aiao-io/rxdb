import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it, vi } from 'vitest';
import { openOpfsWithRetry, OPFS_OPEN_RETRY_DELAYS_MS } from '../opfs-open-retry.js';

/**
 * @fileoverview US-221：OPFS 库打开时等「同步访问句柄仍被占用」退去的退避逻辑。
 *
 * @remarks
 * 真实 Worker 里的复现在 `opfs-reload-race.spec.ts`；这里注入等待与探针，把重试的判定钉死。
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
