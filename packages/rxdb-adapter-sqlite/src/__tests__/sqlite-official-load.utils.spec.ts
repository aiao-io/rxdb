import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  failuresRemaining: 0,
  invalidResult: false,
  initCalls: 0,
  initOptions: [] as Record<string, unknown>[],
  spawnOpfsProxyWorker: false,
  workerUrls: [] as Array<string | URL>
}));

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: vi.fn().mockImplementation(async (options: Record<string, unknown>) => {
    mockState.initCalls += 1;
    mockState.initOptions.push(options);
    await new Promise(resolve => setTimeout(resolve, 0));

    if (mockState.spawnOpfsProxyWorker) {
      new Worker('https://sqlite.example/assets/sqlite3-opfs-async-proxy.js');
    }
    if (mockState.failuresRemaining > 0) {
      mockState.failuresRemaining -= 1;
      throw new Error('sqlite init failed');
    }
    if (mockState.invalidResult) return { oo1: {} };

    return {
      config: {},
      oo1: { DB: class {}, OpfsDb: class {} },
      capi: { sqlite3_update_hook: vi.fn() },
      version: {
        libVersion: '3.51.2',
        libVersionNumber: 3051002,
        sourceId: 'mock',
        downloadVersion: 1
      }
    };
  })
}));

const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');

function restoreWorker(): void {
  if (originalWorkerDescriptor) {
    Object.defineProperty(globalThis, 'Worker', originalWorkerDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, 'Worker');
}

function installWorkerStub(): typeof Worker {
  class WorkerStub {
    constructor(scriptUrl: string | URL) {
      mockState.workerUrls.push(scriptUrl);
    }
  }

  const worker = WorkerStub as unknown as typeof Worker;
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: worker
  });
  return worker;
}

describe('sqliteLoad', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.failuresRemaining = 0;
    mockState.invalidResult = false;
    mockState.initCalls = 0;
    mockState.initOptions.length = 0;
    mockState.spawnOpfsProxyWorker = false;
    mockState.workerUrls.length = 0;
    restoreWorker();

    const { resetSqliteLoadCache } = await import('../sqlite-official-load.utils.js');
    resetSqliteLoadCache();
  });

  afterEach(() => {
    restoreWorker();
  });

  it('并发调用应该只初始化一次', async () => {
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const [first, second] = await Promise.all([sqliteLoad(), sqliteLoad()]);

    expect(mockState.initCalls).toBe(1);
    expect(first).toBe(second);
  });

  it('顺序调用应该命中缓存', async () => {
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const first = await sqliteLoad();
    const second = await sqliteLoad();

    expect(mockState.initCalls).toBe(1);
    expect(first).toBe(second);
  });

  it('初始化失败后应该允许重试', async () => {
    mockState.failuresRemaining = 1;
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    await expect(sqliteLoad()).rejects.toThrow('sqlite init failed');
    await expect(sqliteLoad()).resolves.toBeDefined();

    expect(mockState.initCalls).toBe(2);
  });

  it('拒绝缺少 oo1/capi/version 契约的上游模块', async () => {
    mockState.invalidResult = true;
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    await expect(sqliteLoad()).rejects.toThrow(/invalid oo1 module/i);
  });

  it('应该把资源定位和输出函数传给 sqlite 模块', async () => {
    const locateFile = (name: string) => `/assets/${name}`;
    const print = (message: string) => message;
    const printErr = (message: string) => message;
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    await sqliteLoad({ locateFile, print, printErr });

    expect(mockState.initOptions).toEqual([{ locateFile, print, printErr }]);
  });

  it('应该在初始化期间重写 OPFS Worker URL，并在结束后恢复 Worker', async () => {
    const worker = installWorkerStub();
    mockState.spawnOpfsProxyWorker = true;
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const module = await sqliteLoad({
      opfs: true,
      opfsProxyPath: 'https://cdn.example/sqlite-opfs-worker.js'
    });

    expect(mockState.workerUrls).toEqual(['https://cdn.example/sqlite-opfs-worker.js']);
    expect(globalThis.Worker).toBe(worker);
    expect(module.config?.warn).toBeTypeOf('function');
  });

  it('初始化失败后也应该恢复 Worker', async () => {
    const worker = installWorkerStub();
    mockState.spawnOpfsProxyWorker = true;
    mockState.failuresRemaining = 1;
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    await expect(
      sqliteLoad({
        opfs: true,
        opfsProxyPath: 'https://cdn.example/sqlite-opfs-worker.js'
      })
    ).rejects.toThrow('sqlite init failed');

    expect(mockState.workerUrls).toEqual(['https://cdn.example/sqlite-opfs-worker.js']);
    expect(globalThis.Worker).toBe(worker);
  });

  it('缓存不支持自定义 OPFS Worker 时应该重新初始化一次', async () => {
    installWorkerStub();
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const first = await sqliteLoad();
    mockState.spawnOpfsProxyWorker = true;
    const second = await sqliteLoad({
      opfs: true,
      opfsProxyPath: 'https://cdn.example/sqlite-opfs-worker.js'
    });
    const third = await sqliteLoad({
      opfs: true,
      opfsProxyPath: 'https://cdn.example/sqlite-opfs-worker.js'
    });

    expect(mockState.initCalls).toBe(2);
    expect(first).not.toBe(second);
    expect(second).toBe(third);
  });
  // SQLI-001：缓存键只记「是否用过 OPFS proxy patch」，不比较 wasmPath / opfsProxyPath /
  // locateFile —— 第一次用 /a/sqlite.wasm 初始化后，第二个 client 明确传 /b/sqlite.wasm
  // 也会**静默拿到第一个模块**。WASM 模块是进程级单例，不兼容配置必须 fail-fast。
  it('不同 wasmPath 必须重新加载，而不是静默复用首个模块', async () => {
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const first = await sqliteLoad({ wasmPath: '/a/sqlite.wasm' });
    const second = await sqliteLoad({ wasmPath: '/b/sqlite.wasm' });

    expect(mockState.initCalls).toBe(2);
    expect(first).not.toBe(second);
  });

  it('不同 opfsProxyPath 必须重新加载', async () => {
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const first = await sqliteLoad({ opfs: true, opfsProxyPath: '/proxy-a.js' });
    const second = await sqliteLoad({ opfs: true, opfsProxyPath: '/proxy-b.js' });

    expect(mockState.initCalls).toBe(2);
    expect(first).not.toBe(second);
  });

  it('新增 locateFile 必须重新加载', async () => {
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const first = await sqliteLoad();
    const second = await sqliteLoad({ locateFile: (name: string) => `/assets/${name}` });

    expect(mockState.initCalls).toBe(2);
    expect(first).not.toBe(second);
  });

  // 反向守卫：完全相同的配置仍然必须命中缓存，否则 fail-fast 会退化成「永不复用」
  it('相同配置仍然命中缓存', async () => {
    const { sqliteLoad } = await import('../sqlite-official-load.utils.js');

    const first = await sqliteLoad({ wasmPath: '/a/sqlite.wasm' });
    const second = await sqliteLoad({ wasmPath: '/a/sqlite.wasm' });

    expect(mockState.initCalls).toBe(1);
    expect(first).toBe(second);
  });
});
