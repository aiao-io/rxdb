import { describe, expect, it, vi } from 'vitest';
import { buildWaSqliteOptions, type WaSqliteWorkerFactories } from './wa-sqlite-options';

const makeFactories = (): WaSqliteWorkerFactories & {
  createWorker: ReturnType<typeof vi.fn>;
  createSharedWorker: ReturnType<typeof vi.fn>;
} => ({
  createWorker: vi.fn(() => ({ name: 'worker' }) as unknown as Worker),
  createSharedWorker: vi.fn(() => ({ port: {} }) as unknown as SharedWorker)
});

describe('buildWaSqliteOptions', () => {
  it('OPFS 可用时走 OPFSCoopSyncVFS + 专用 Worker + 同步 wasm', () => {
    const factories = makeFactories();

    const options = buildWaSqliteOptions({ opfs: true, sharedWorker: true }, factories);

    expect(options.vfs).toBe('OPFSCoopSyncVFS');
    expect(options.worker).toBe(true);
    expect(options.workerOwnership).toBe('client');
    expect(options.async).toBe(false);
    expect(options.wasmPath).toBe('/wa-sqlite/wa-sqlite.wasm');
    expect(factories.createWorker).toHaveBeenCalledTimes(1);
    expect(factories.createSharedWorker).not.toHaveBeenCalled();
  });

  it('无 OPFS 但有 SharedWorker 时走 IDBBatchAtomicVFS + SharedWorker', () => {
    const factories = makeFactories();

    const options = buildWaSqliteOptions({ opfs: false, sharedWorker: true }, factories);

    expect(options.vfs).toBe('IDBBatchAtomicVFS');
    expect(options.sharedWorker).toBe(true);
    expect(options.workerOwnership).toBe('client');
    expect(options.wasmPath).toBe('/wa-sqlite/wa-sqlite-async.wasm');
    expect(factories.createSharedWorker).toHaveBeenCalledTimes(1);
    expect(factories.createWorker).not.toHaveBeenCalled();
  });

  /**
   * OPFS 与 SharedWorker 在 Safari &lt; 16.4 等环境里**同时缺失**。
   * 少写这条分支的话 else 会无条件 `new SharedWorker(...)` → `ReferenceError`
   * → app initializer reject → bootstrap 失败 → 整页白屏。
   */
  it('OPFS 与 SharedWorker 都不可用时必须降级到专用 Worker，且绝不触碰 SharedWorker', () => {
    const factories = makeFactories();

    const options = buildWaSqliteOptions({ opfs: false, sharedWorker: false }, factories);

    expect(options.vfs).toBe('IDBBatchAtomicVFS');
    expect(options.worker).toBe(true);
    expect(options.workerOwnership).toBe('client');
    expect(options.sharedWorker).toBeUndefined();
    expect(options.wasmPath).toBe('/wa-sqlite/wa-sqlite-async.wasm');
    expect(factories.createWorker).toHaveBeenCalledTimes(1);
    expect(factories.createSharedWorker).not.toHaveBeenCalled();
  });
});
