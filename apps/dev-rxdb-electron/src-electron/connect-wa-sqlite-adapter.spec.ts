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
  // ELEC-11 起连接必须走 connectLocalAdapter —— 它把失败上报成状态，而不是只 console.error。
  // US-207 E8 起这一步的归属从建库模块挪到了 LocalDatabaseService：两个后端共用一条
  // 连接路径，谁被选中就连谁。留在建库模块里则要各写一份，两份迟早不一致。
  it('connects the selected local adapter through the reporting helper', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/app/services/local-database.service.ts'), 'utf8');
    expect(source).toContain('await connectLocalAdapter(database, this.#backend.adapter');
    // 裸的 .connect() 会绕过状态上报，退回到「失败静默」。
    expect(source).not.toMatch(/\.connect\(/);
  });

  // 拆卸归 provideRxDB：source 是工厂，工厂产出的实例由它在注入器销毁时 disconnectAll()。
  // 建库模块或服务再补一刀就是两次断开 —— 第二次落在已经关掉的连接上。
  it.each([
    '../src/app/setup_rxdb_wa-sqlite.ts',
    '../src/app/setup_rxdb_desktop.ts',
    '../src/app/services/local-database.service.ts'
  ])('%s leaves teardown to provideRxDB', file => {
    const source = readFileSync(resolve(import.meta.dirname, file), 'utf8');
    expect(source).not.toContain('shutdownDatabase');
    expect(source).not.toContain('DestroyRef');
  });

  // 建库 Promise 只能有一份：provideRxDB 的工厂与 LocalDatabaseService.start() 是两个
  // 并发跑的 app initializer（Angular 用 Promise.all），各建各的就成了两个实例 ——
  // 页面读到的状态属于其中一个，数据却写进另一个。
  it('memoises the database handle so both initializers share one instance', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/app/setup_rxdb.ts'), 'utf8');
    expect(source).toMatch(/database \?\?= resolveLocalBackend\(globalThis\)\.create\(\)/);
    expect(readFileSync(resolve(import.meta.dirname, '../src/app/app.config.ts'), 'utf8')).toContain('localDatabase()');
  });
});
