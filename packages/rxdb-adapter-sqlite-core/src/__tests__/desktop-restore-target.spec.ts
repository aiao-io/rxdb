/**
 * `connectDesktopRestoreTarget`：恢复与清理前让一条桌面连接独占库文件（US-217 AC#12 / AC#21）。
 *
 * @remarks
 * 真 host 上的撞锁、握手失败与通道断开由桌面包的备份套件验证；这里只覆盖错误码的换算与失败时的连接回收。
 */
import { RxDBBackupError } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop/desktop-error.js';
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../desktop/desktop-host-protocol.js';
import { connectDesktopRestoreTarget } from '../desktop/desktop-restore-target.js';
import type { SqliteClientLike } from '../sqlite-core.types.js';

const STORAGE_KEY = 'sqlite-electron:file:app.sqlite3';

/** 只记录执行过的语句与断开次数的连接；`failure` 让取锁脚本以它失败。 */
const fakeClient = (failure?: unknown, disconnectFailure?: unknown) => {
  const executed: string[] = [];
  const disconnect = vi.fn(async () => {
    if (disconnectFailure !== undefined) throw disconnectFailure;
  });
  const client = {
    execute: async (sql: string) => {
      executed.push(sql);
      if (failure !== undefined) throw failure;
      return { sql, rowsAffected: 0, elapsed: 0, results: [] };
    },
    disconnect
  } as unknown as SqliteClientLike;
  return { client, executed, disconnect };
};

const rejectionOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error
  );

describe('connectDesktopRestoreTarget', () => {
  it('takes the exclusive file lock without waiting before handing the connection out', async () => {
    const { client, executed, disconnect } = fakeClient();
    const target = await connectDesktopRestoreTarget(async () => client, STORAGE_KEY);
    expect(executed).toEqual(['PRAGMA busy_timeout = 0; PRAGMA locking_mode = EXCLUSIVE; BEGIN IMMEDIATE; COMMIT;']);
    expect(disconnect).not.toHaveBeenCalled();
    // 交出去的连接就是这一条：语句与断开都落在它上面
    await target.execute('SELECT 1');
    await target.disconnect();
    expect(executed.at(-1)).toBe('SELECT 1');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports target_busy and closes the connection when another connection has the file open', async () => {
    const busy = new RxDBAdapterDesktopError('database_busy', 'database is locked');
    const { client, disconnect } = fakeClient(busy);
    const error = await rejectionOf(connectDesktopRestoreTarget(async () => client, STORAGE_KEY));
    expect(error).toBeInstanceOf(RxDBBackupError);
    expect(error).toMatchObject({
      code: 'target_busy',
      details: { field: 'storage', actual: STORAGE_KEY },
      cause: busy
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps the lock failure when closing the useless connection fails as well', async () => {
    const busy = new RxDBAdapterDesktopError('database_busy', 'database is locked');
    const { client } = fakeClient(busy, new Error('close failed'));
    const error = await rejectionOf(connectDesktopRestoreTarget(async () => client, STORAGE_KEY));
    expect(error).toMatchObject({ code: 'target_busy', cause: busy });
  });

  it('reports a host that speaks another protocol as unsupported_combination before any statement', async () => {
    const skew = new RxDBAdapterDesktopError('protocol_violation', 'host speaks protocol 1');
    const error = await rejectionOf(connectDesktopRestoreTarget(() => Promise.reject(skew), STORAGE_KEY));
    expect(error).toBeInstanceOf(RxDBBackupError);
    expect(error).toMatchObject({
      code: 'unsupported_combination',
      details: { field: 'protocolVersion', expected: DESKTOP_HOST_PROTOCOL_VERSION },
      cause: skew
    });
  });

  it('passes other failures through for the restore to classify', async () => {
    const offline = new Error('host went away');
    await expect(connectDesktopRestoreTarget(() => Promise.reject(offline), STORAGE_KEY)).rejects.toBe(offline);

    const failed = new RxDBAdapterDesktopError('statement_failed', 'disk I/O error');
    const { client, disconnect } = fakeClient(failed);
    await expect(connectDesktopRestoreTarget(async () => client, STORAGE_KEY)).rejects.toBe(failed);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  /** 取锁那一条照常成功，之后的语句按 `failures` 依次失败。 */
  const failingAfterLock = (...failures: unknown[]): SqliteClientLike => {
    const { client } = fakeClient();
    const inner = client.execute.bind(client);
    const script: unknown[] = [undefined, ...failures];
    client.execute = async (sql, bindings) => {
      const failure = script.shift();
      return failure === undefined ? inner(sql, bindings) : Promise.reject(failure);
    };
    return client;
  };

  // 恢复途中通道断了：不是归档坏了，也不是目标忙，是 I/O 失败（AC#21）。不换的话，恢复流程会把
  // 执行归档语句时的失败一律当成 corrupt_archive，让用户去怀疑一份完好的归档。
  it.each(['host_unavailable', 'session_closed', 'protocol_violation', 'host_internal_error'] as const)(
    'reports a %s channel failure during the restore as io_error',
    async code => {
      const lost = new RxDBAdapterDesktopError(code, 'desktop host channel closed');
      const target = await connectDesktopRestoreTarget(async () => failingAfterLock(lost), STORAGE_KEY);
      const error = await rejectionOf(target.execute('INSERT INTO t VALUES (1)'));
      expect(error).toBeInstanceOf(RxDBBackupError);
      expect(error).toMatchObject({ code: 'io_error', cause: lost });
    }
  );

  it('keeps host SQL errors and non-desktop errors for the restore to classify', async () => {
    const failed = new RxDBAdapterDesktopError('statement_failed', 'near "INSRT": syntax error');
    const other = new Error('something else');
    const target = await connectDesktopRestoreTarget(async () => failingAfterLock(failed, other), STORAGE_KEY);
    await expect(target.execute('INSRT INTO t VALUES (1)')).rejects.toBe(failed);
    await expect(target.execute('INSERT INTO t VALUES (2)')).rejects.toBe(other);
  });
});
