import { SQLiteChangeType, type SqliteResult, type UpdateHookCallback } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteAPI } from '../sqlite-api.type.js';

const mocks = vi.hoisted(() => ({
  executeHelper: vi.fn(),
  sqliteLoad: vi.fn()
}));

vi.mock('../execute_helper.js', () => ({ executeHelper: mocks.executeHelper }));
vi.mock('../sqlite-load.utils.js', async importOriginal => {
  const original = await importOriginal<typeof import('../sqlite-load.utils.js')>();
  return { ...original, sqliteLoad: mocks.sqliteLoad };
});

import { SqliteClient } from '../SqliteClient.js';

function harness() {
  const updateHookCallbacks: UpdateHookCallback[] = [];
  let resolveClose!: () => void;
  let rejectClose!: (reason: unknown) => void;
  const closeGate = new Promise<void>((resolve, reject) => {
    resolveClose = resolve;
    rejectClose = reject;
  });
  const close = vi.fn(() => closeGate);
  const sqlite = {
    close,
    create_function: vi.fn(),
    update_hook: vi.fn((_db: number, cb: UpdateHookCallback) => {
      updateHookCallbacks.push(cb);
    })
  } as unknown as SQLiteAPI;
  return { close, sqlite, updateHookCallbacks, resolveClose, rejectClose };
}

describe('AUDIT repro', () => {
  beforeEach(() => {
    const result: SqliteResult = { elapsed: 0, results: [], rowsAffected: 0, sql: '' };
    mocks.executeHelper.mockResolvedValue(result);
  });
  afterEach(() => {
    vi.useRealTimers();
    mocks.executeHelper.mockReset();
    mocks.sqliteLoad.mockReset();
  });

  // SWM-001：原用例名就是缺陷本身（「第二个调用在连接尚未关闭时就 resolve」），
  // 断言 `secondDone === true && firstDone === false` 把坏契约绿化了。
  // `disconnect()` 一旦 resolve 就等于向调用方宣告「连接已关闭」——
  // 并发调用必须共享同一个完成/失败结果，不能抢先成功。
  it('R1: 并发 disconnect 共享同一完成结果，不得在连接关闭前抢先 resolve', async () => {
    const h = harness();
    mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 99, sqlite: h.sqlite });
    const client = new SqliteClient();
    await client.init('db', { vfs: 'memory' });

    let firstDone = false;
    let secondDone = false;
    const first = client.disconnect().then(() => {
      firstDone = true;
    });
    const second = client.disconnect().then(() => {
      secondDone = true;
    });

    // close 还挂在 gate 上：两个调用都不许结束
    await Promise.resolve();
    expect(secondDone).toBe(false);
    expect(firstDone).toBe(false);
    expect(h.close).toHaveBeenCalledTimes(1);

    h.resolveClose();
    await Promise.all([first, second]);
    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    // 仍然只关一次
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('R1: close 失败时并发 disconnect 一起拿到同一个错误', async () => {
    const h = harness();
    mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 99, sqlite: h.sqlite });
    const client = new SqliteClient();
    await client.init('db', { vfs: 'memory' });

    const failure = new Error('close failed');
    const first = client.disconnect();
    const second = client.disconnect();
    h.rejectClose(failure);

    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
  });

  it('R2: 监听器抛错 —— pending 事件照常出队，不重复派发', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness();
    mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 1, sqlite: h.sqlite });
    const client = new SqliteClient();
    await client.init('db', { vfs: 'memory', batchTimeout: 1 });

    const seen: bigint[][] = [];
    let throwOnce = true;
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => {
      seen.push([...event.rowIds]);
      if (throwOnce) {
        throwOnce = false;
        throw new Error('listener boom');
      }
    });

    const hook = h.updateHookCallbacks[0];
    if (!hook) throw new Error('no hook');

    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 1n);
    // 监听器抛错不再从 setTimeout 回调逃逸
    await vi.advanceTimersByTimeAsync(2);
    expect(seen).toEqual([[1n]]);
    expect(consoleError).toHaveBeenCalledTimes(1);

    // 新事件到来 -> 重新调度 -> 只派发新事件，1n 已随上一批出队
    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 2n);
    await vi.advanceTimersByTimeAsync(2);

    expect(seen).toEqual([[1n], [2n]]);
    consoleError.mockRestore();
  });
});
