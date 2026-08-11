import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { connectWithOpfsFallback } from '../src/app/connect-wa-sqlite-adapter';

class TestAdapter {
  readonly connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  readonly disconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

describe('connectWithOpfsFallback', () => {
  it('uses OPFS only after its adapter connects successfully', async () => {
    const opfs = new TestAdapter();
    const createFallback = vi.fn(() => new TestAdapter());

    await expect(connectWithOpfsFallback(true, () => opfs, createFallback, vi.fn())).resolves.toBe(opfs);
    expect(opfs.connect).toHaveBeenCalledOnce();
    expect(createFallback).not.toHaveBeenCalled();
  });

  it('disconnects a failed OPFS adapter and connects the IDB fallback', async () => {
    const error = new Error('OPFS VFS failed');
    const opfs = new TestAdapter();
    const fallback = new TestAdapter();
    const reportFailure = vi.fn();
    opfs.connect.mockRejectedValueOnce(error);

    await expect(
      connectWithOpfsFallback(
        true,
        () => opfs,
        () => fallback,
        reportFailure
      )
    ).resolves.toBe(fallback);
    expect(opfs.disconnect).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledWith(error);
    expect(fallback.connect).toHaveBeenCalledOnce();
  });

  // ELEC-02：`catch` 里 `await adapter.disconnect()` 一旦 reject，
  // `reportOpfsFailure(error)` 与后续 `createFallbackAdapter()` 都不会执行 ——
  // **原始连接错误被 disconnect 的错误顶掉、IDB 降级整个跳过**，
  // 而 worker 的 terminate 写在 failure 回调里，该路径下 worker 一并泄漏。
  // 原有用例的 disconnect 全是 mockResolvedValue，只覆盖了成功线。
  it('OPFS 清理失败时仍必须降级，且不得吞掉原始连接错误', async () => {
    const connectError = new Error('OPFS VFS failed');
    const disconnectError = new Error('OPFS disconnect failed');
    const opfs = new TestAdapter();
    const fallback = new TestAdapter();
    const reportFailure = vi.fn();
    opfs.connect.mockRejectedValueOnce(connectError);
    opfs.disconnect.mockRejectedValueOnce(disconnectError);

    await expect(
      connectWithOpfsFallback(
        true,
        () => opfs,
        () => fallback,
        reportFailure
      )
    ).resolves.toBe(fallback);

    // 原始连接错误必须送达（worker terminate 就挂在这个回调里）
    expect(reportFailure).toHaveBeenCalledOnce();
    const reported = reportFailure.mock.calls[0][0];
    expect(reported).toBe(connectError);
    expect(fallback.connect).toHaveBeenCalledOnce();
  });

  it('exposes an IDB connection failure instead of returning a half-connected adapter', async () => {
    const error = new Error('IDB VFS failed');
    const fallback = new TestAdapter();
    fallback.connect.mockRejectedValueOnce(error);

    await expect(
      connectWithOpfsFallback(
        false,
        () => new TestAdapter(),
        () => fallback,
        vi.fn()
      )
    ).rejects.toThrow('IDB VFS failed');
  });
  it('starts a local adapter smoke connection during renderer setup', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/app/setup_rxdb_wa-sqlite.ts'), 'utf8');
    // ELEC-11 起改走 connectLocalAdapter —— 它把失败上报成状态，而不是只 console.error。
    expect(source).toContain("void connectLocalAdapter(rxdb, 'wa-sqlite'");
    // 裸的 .connect() 会绕过状态上报，退回到「失败静默」。
    expect(source).not.toContain("rxdb.connect('wa-sqlite')");
  });

  it('tears the singleton down when the injector is destroyed', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/app/setup_rxdb_wa-sqlite.ts'), 'utf8');
    expect(source).toContain('inject(DestroyRef).onDestroy');
    expect(source).toContain('shutdownDatabase(instance');
    // 拆卸必须清掉模块级单例，否则下一次 bootstrap 会拿到已 disconnect 的实例。
    expect(source).toContain('rxdb = undefined');
  });
});
