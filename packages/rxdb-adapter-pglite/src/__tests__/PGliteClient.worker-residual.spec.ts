import { afterEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => {
  const close = vi.fn(async () => undefined);
  const syncToFs = vi.fn(async () => undefined);
  const unsubscribe = vi.fn(async () => undefined);
  const listen = vi.fn(async () => unsubscribe);
  const workerTerminate = vi.fn();
  const createRuntime = () => ({
    waitReady: Promise.resolve(),
    close,
    syncToFs,
    listen,
    sql: vi.fn(),
    exec: vi.fn(),
    query: vi.fn(async () => ({ rows: [{ version: 'PostgreSQL' }], fields: [], affectedRows: 0 })),
    describeQuery: vi.fn(),
    transaction: vi.fn(),
    runExclusive: vi.fn(),
    live: { query: vi.fn() }
  });
  const workerCreate = vi.fn(async () => createRuntime());
  return { close, createRuntime, listen, syncToFs, unsubscribe, workerCreate, workerTerminate };
});

vi.mock('@electric-sql/pglite/worker', () => ({
  PGliteWorker: {
    create: runtimeMocks.workerCreate
  }
}));

import { PGliteClient } from '../PGliteClient.js';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';

/** 最小 Worker 桩：仅满足 PGliteClient 的存在性探测，不承载真实消息通道 */
const createMockWorkerClass = () =>
  class MockWorker {
    onmessage = null;
    onerror = null;
    onmessageerror = null;
    terminate = runtimeMocks.workerTerminate;
    postMessage = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    dispatchEvent = vi.fn(() => false);

    constructor(
      public url: URL | string,
      public options?: WorkerOptions
    ) {}
  };

describe('PGliteClient worker and disconnect residual', () => {
  const OriginalWorker = globalThis.Worker;

  afterEach(() => {
    globalThis.Worker = OriginalWorker;
    runtimeMocks.close.mockReset().mockResolvedValue(undefined);
    runtimeMocks.listen.mockReset().mockImplementation(async () => runtimeMocks.unsubscribe);
    runtimeMocks.syncToFs.mockReset().mockResolvedValue(undefined);
    runtimeMocks.unsubscribe.mockReset().mockResolvedValue(undefined);
    runtimeMocks.workerCreate.mockReset().mockImplementation(async () => runtimeMocks.createRuntime());
    runtimeMocks.workerTerminate.mockReset();
  });

  it('creates OPFS runtime via PGliteWorker when Worker is available', async () => {
    globalThis.Worker = createMockWorkerClass();

    const client = new PGliteClient();
    await client.init(`opfs-${Date.now()}`, { dataDir: `opfs-ahp://test-${Date.now()}/` });
    expect(runtimeMocks.workerCreate).toHaveBeenCalled();
    await client.disconnect();
    expect(runtimeMocks.syncToFs).toHaveBeenCalled();
  });

  it('throws when OPFS mode has no Worker support', async () => {
    delete (globalThis as { Worker?: typeof Worker }).Worker;
    const client = new PGliteClient();
    await expect(client.init(`opfs-no-worker-${Date.now()}`, { dataDir: 'opfs-ahp://x/' })).rejects.toThrow(
      /Web Worker/
    );
  });

  it('disconnect reports durability failure after releasing listeners and runtime', async () => {
    globalThis.Worker = createMockWorkerClass();

    const cause = new Error('sync boom');
    runtimeMocks.syncToFs.mockRejectedValueOnce(cause);
    const client = new PGliteClient();
    await client.init(`opfs-sync-fail-${Date.now()}`, { dataDir: `opfs-ahp://sync-${Date.now()}/` });

    await expect(client.disconnect()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(RxdbAdapterPGliteError);
      expect((error as RxdbAdapterPGliteError).code).toBe('DURABILITY_LOST');
      expect((error as Error).cause).toBe(cause);
      return true;
    });
    expect(runtimeMocks.unsubscribe).toHaveBeenCalledTimes(3);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);
  });

  it('forceClose releases resources without attempting a durability flush', async () => {
    globalThis.Worker = createMockWorkerClass();

    const client = new PGliteClient();
    await client.init(`opfs-force-close-${Date.now()}`, { dataDir: `opfs-ahp://force-${Date.now()}/` });
    await client.forceClose();

    expect(runtimeMocks.syncToFs).not.toHaveBeenCalled();
    expect(runtimeMocks.unsubscribe).toHaveBeenCalledTimes(3);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe failure does not prevent runtime and worker release', async () => {
    globalThis.Worker = createMockWorkerClass();

    runtimeMocks.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe boom'));
    const client = new PGliteClient();
    await client.init('opfs-unsubscribe-fail', { dataDir: 'opfs-ahp://unsubscribe-fail/' });

    await expect(client.disconnect()).resolves.toBeUndefined();
    expect(runtimeMocks.unsubscribe).toHaveBeenCalledTimes(3);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);
  });

  it('close failure still clears ownership and permits an idempotent force close', async () => {
    globalThis.Worker = createMockWorkerClass();

    const cause = new Error('close boom');
    runtimeMocks.close.mockRejectedValueOnce(cause);
    const client = new PGliteClient();
    await client.init('opfs-close-fail', { dataDir: 'opfs-ahp://close-fail/' });

    await expect(client.forceClose()).rejects.toBe(cause);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);
    await expect(client.forceClose()).resolves.toBeUndefined();
  });

  it('repeated init closes the previous runtime and listeners before replacing it', async () => {
    globalThis.Worker = createMockWorkerClass();

    const client = new PGliteClient();
    await client.init('opfs-repeat-first', { dataDir: 'opfs-ahp://repeat-first/' });
    await client.init('opfs-repeat-second', { dataDir: 'opfs-ahp://repeat-second/' });

    expect(runtimeMocks.unsubscribe).toHaveBeenCalledTimes(3);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.workerCreate).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);

    await client.disconnect();
    expect(runtimeMocks.unsubscribe).toHaveBeenCalledTimes(6);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(2);
  });

  it('repeated init removes the client from its previous storage peer set', async () => {
    globalThis.Worker = createMockWorkerClass();

    const client = new PGliteClient();
    const peer = new PGliteClient();
    await client.init('opfs-storage-owner', { dataDir: 'opfs-ahp://storage-shared/' });
    await peer.init('opfs-storage-peer', { dataDir: 'opfs-ahp://storage-shared/' });
    expect(client.hasStoragePeer()).toBe(true);
    expect(peer.hasStoragePeer()).toBe(true);

    await client.init('opfs-storage-new', { dataDir: 'opfs-ahp://storage-new/' });
    expect(client.hasStoragePeer()).toBe(false);
    expect(peer.hasStoragePeer()).toBe(false);

    await Promise.all([client.forceClose(), peer.forceClose()]);
  });

  it('concurrent init calls share one runtime', async () => {
    globalThis.Worker = createMockWorkerClass();

    const client = new PGliteClient();
    await Promise.all([
      client.init('opfs-concurrent', { dataDir: 'opfs-ahp://concurrent/' }),
      client.init('opfs-concurrent', { dataDir: 'opfs-ahp://concurrent/' })
    ]);

    expect(runtimeMocks.workerCreate).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.listen).toHaveBeenCalledTimes(3);
    await client.disconnect();
  });

  it('init failure releases partial listeners and runtime', async () => {
    globalThis.Worker = createMockWorkerClass();

    const cause = new Error('listen boom');
    runtimeMocks.listen.mockResolvedValueOnce(runtimeMocks.unsubscribe).mockRejectedValueOnce(cause);
    const client = new PGliteClient();

    await expect(client.init('opfs-listen-fail', { dataDir: 'opfs-ahp://listen-fail/' })).rejects.toBe(cause);
    expect(runtimeMocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);
  });

  it('worker creation failure terminates the half-created worker', async () => {
    globalThis.Worker = createMockWorkerClass();

    const cause = new Error('worker create boom');
    runtimeMocks.workerCreate.mockRejectedValueOnce(cause);
    const client = new PGliteClient();

    await expect(client.init('opfs-worker-fail', { dataDir: 'opfs-ahp://worker-fail/' })).rejects.toBe(cause);
    expect(runtimeMocks.workerTerminate).toHaveBeenCalledTimes(1);
  });

  it('disconnect requested during init closes the created runtime', async () => {
    globalThis.Worker = createMockWorkerClass();

    let resolveRuntime!: (runtime: ReturnType<typeof runtimeMocks.createRuntime>) => void;
    runtimeMocks.workerCreate.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRuntime = resolve;
        })
    );
    const client = new PGliteClient();
    const initPromise = client.init('opfs-init-disconnect', { dataDir: 'opfs-ahp://init-disconnect/' });
    await vi.waitFor(() => expect(runtimeMocks.workerCreate).toHaveBeenCalledTimes(1));
    const operations = Promise.all([initPromise, client.disconnect()]);
    resolveRuntime(runtimeMocks.createRuntime());

    await expect(operations).resolves.toEqual([undefined, undefined]);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
  });

  it('concurrent init calls queued after disconnect share the replacement runtime', async () => {
    globalThis.Worker = createMockWorkerClass();

    let resolveRuntime!: (runtime: ReturnType<typeof runtimeMocks.createRuntime>) => void;
    runtimeMocks.workerCreate.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRuntime = resolve;
        })
    );
    const client = new PGliteClient();
    const initialInit = client.init('opfs-queued-first', { dataDir: 'opfs-ahp://queued-first/' });
    await vi.waitFor(() => expect(runtimeMocks.workerCreate).toHaveBeenCalledTimes(1));
    const disconnect = client.disconnect();
    const replacementInit = client.init('opfs-queued-replacement', { dataDir: 'opfs-ahp://queued-replacement/' });
    const duplicateInit = client.init('opfs-queued-replacement', { dataDir: 'opfs-ahp://queued-replacement/' });
    resolveRuntime(runtimeMocks.createRuntime());

    await Promise.all([initialInit, disconnect, replacementInit, duplicateInit]);
    expect(runtimeMocks.workerCreate).toHaveBeenCalledTimes(2);
    expect(runtimeMocks.close).toHaveBeenCalledTimes(1);
    await client.forceClose();
  });

  it('disconnect clears pending timer after notify, empty notify is ignored', async () => {
    const client = new PGliteClient();
    await client.init(`pglite-timer-${Date.now()}`, { store: 'memory' });

    await client.exec(`NOTIFY rxdb_change_notify, '{"operation":"INSERT","ids":["1"]}';`);
    // 立即断开连接，使定时器清理分支能够执行
    await client.disconnect();

    const client2 = new PGliteClient();
    await client2.init(`pglite-empty-payload-${Date.now()}`, { store: 'memory' });
    await client2.exec(`NOTIFY rxdb_change_notify, '   ';`);
    await new Promise(r => setTimeout(r, 30));
    await client2.disconnect();
  });

  it('liveQuery forwards null params when omitted', async () => {
    const client = new PGliteClient();
    await client.init(`pglite-live-${Date.now()}`, { store: 'memory' });
    const handle = await client.liveQuery('SELECT 1 AS n');
    expect(handle).toBeTruthy();
    if (handle && typeof (handle as { unsubscribe?: () => Promise<void> }).unsubscribe === 'function') {
      await (handle as { unsubscribe: () => Promise<void> }).unsubscribe();
    }
    await client.disconnect();
  });

  it('flushPendingNotifications drains timer and pending events', async () => {
    const client = new PGliteClient();
    await client.init(`pglite-flush-${Date.now()}`, { store: 'memory' });

    // 先启动 flush（等待 batchTimeout=16ms），再在等待期间注入 NOTIFY，
    // 这样 flush 检查时 pending events 与 sendTimer 仍然存在。
    const flushPromise = client.flushPendingNotifications();
    await new Promise(resolve => setTimeout(resolve, 5));
    await client.exec(`NOTIFY rxdb_change_notify, '{"operation":"INSERT","ids":["flush-1"]}';`);
    const flushed = await flushPromise;
    expect(flushed).toBe(true);

    const empty = await client.flushPendingNotifications();
    expect(empty).toBe(false);
    await client.disconnect();
  });
});
