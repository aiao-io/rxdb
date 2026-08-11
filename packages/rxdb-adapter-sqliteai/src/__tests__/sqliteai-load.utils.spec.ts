import type { Oo1Static } from '@aiao/rxdb-adapter-sqlite-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResult, mockState } = vi.hoisted(() => {
  class MockDB {
    exec() {
      return this;
    }
    close() {
      return undefined;
    }
    changes() {
      return 0;
    }
    createFunction() {
      return this;
    }
  }

  class MockOpfsDb extends MockDB {}

  return {
    mockResult: {
      oo1: {
        DB: MockDB,
        OpfsDb: MockOpfsDb
      },
      capi: {
        sqlite3_update_hook: vi.fn().mockReturnValue(0)
      },
      config: {
        warn: vi.fn(),
        error: vi.fn()
      },
      version: {
        libVersion: '3.50.4',
        libVersionNumber: 3050004,
        sourceId: 'mock',
        downloadVersion: 1
      }
    } satisfies Oo1Static,
    mockState: {
      initCalls: 0,
      invalidResult: false,
      spawnOpfsProxyWorker: false,
      opfsProxyWorkerUrl: 'http://localhost/@fs/deps/sqlite3-opfs-async-proxy.js?worker_file&type=classic',
      createdWorkerUrls: [] as string[]
    }
  };
});

vi.mock('@sqliteai/sqlite-wasm', () => ({
  default: vi.fn().mockImplementation(async () => {
    mockState.initCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 0));
    if (mockState.invalidResult) return { oo1: {} };
    if (mockState.spawnOpfsProxyWorker && typeof Worker !== 'undefined') {
      new Worker(mockState.opfsProxyWorkerUrl);
    }
    return mockResult;
  })
}));

describe('sqliteaiLoad', () => {
  beforeEach(async () => {
    const { resetSqliteaiLoadCache } = await import('../sqliteai-load.utils.js');
    resetSqliteaiLoadCache();
    vi.clearAllMocks();
    mockState.initCalls = 0;
    mockState.invalidResult = false;
    mockState.spawnOpfsProxyWorker = false;
    mockState.opfsProxyWorkerUrl = 'http://localhost/@fs/deps/sqlite3-opfs-async-proxy.js?worker_file&type=classic';
    mockState.createdWorkerUrls.length = 0;
  });

  it('应该加载并返回 sqlite3 模块', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');
    const sqlite3 = await sqliteaiLoad();

    expect(sqlite3).toBeDefined();
    expect(sqlite3.oo1).toBeDefined();
    expect(sqlite3.oo1.DB).toBeDefined();
    expect(sqlite3.capi).toBeDefined();
    expect(sqlite3.version.libVersion).toBe('3.50.4');
  });

  it('拒绝缺少 oo1/capi/version 契约的上游模块', async () => {
    mockState.invalidResult = true;
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    await expect(sqliteaiLoad()).rejects.toThrow(/invalid oo1 module/i);
  });

  it('并发首次调用应该只初始化一次', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    const [first, second] = await Promise.all([sqliteaiLoad(), sqliteaiLoad()]);

    expect(mockState.initCalls).toBe(1);
    expect(first).toBe(second);
  });

  it('应该缓存已加载的模块 — 多次调用返回相同引用', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');
    const sqlite3a = await sqliteaiLoad();
    const sqlite3b = await sqliteaiLoad();

    expect(sqlite3a).toBe(sqlite3b);
  });

  it('缓存模块未应用 OPFS proxy patch 时应该只重载一次', async () => {
    const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    const workerConstructor = vi.fn(function (this: Record<string, unknown>, scriptUrl: string | URL) {
      mockState.createdWorkerUrls.push(String(scriptUrl));
      this.scriptUrl = String(scriptUrl);
    });
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: workerConstructor
    });

    try {
      const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');
      await sqliteaiLoad();
      mockState.spawnOpfsProxyWorker = true;

      const options = {
        opfs: true,
        opfsProxyPath: '/sqliteai/sqlite3-opfs-async-proxy.js'
      };
      await sqliteaiLoad(options);
      await sqliteaiLoad(options);

      expect(mockState.initCalls).toBe(2);
      expect(mockState.createdWorkerUrls).toEqual([
        'http://localhost/sqliteai/sqlite3-opfs-async-proxy.js?worker_file=&type=classic'
      ]);
    } finally {
      if (originalWorkerDescriptor) {
        Object.defineProperty(globalThis, 'Worker', originalWorkerDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'Worker');
      }
    }
  });

  it('应该默认忽略已知无害的 sqlite 警告日志', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    const sqlite3 = await sqliteaiLoad();
    sqlite3.config?.warn(
      'Ignoring inability to install OPFS sqlite3_vfs:',
      'The OPFS sqlite3_vfs cannot run in the main thread because it requires Atomics.wait().'
    );
    sqlite3.config?.warn('unexpected sqlite warning');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('unexpected sqlite warning');
    warnSpy.mockRestore();
  });

  it('应该将 OPFS proxy worker 重写到显式静态资源路径', async () => {
    const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    const workerConstructor = vi.fn(function (this: Record<string, unknown>, scriptUrl: string | URL) {
      mockState.createdWorkerUrls.push(String(scriptUrl));
      this.scriptUrl = String(scriptUrl);
    });
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: workerConstructor
    });
    mockState.spawnOpfsProxyWorker = true;

    try {
      const { sqliteaiLoad, resetSqliteaiLoadCache } = await import('../sqliteai-load.utils.js');
      resetSqliteaiLoadCache();
      await sqliteaiLoad({
        opfs: true,
        opfsProxyPath: '/sqliteai/sqlite3-opfs-async-proxy.js'
      });

      expect(mockState.createdWorkerUrls).toEqual([
        'http://localhost/sqliteai/sqlite3-opfs-async-proxy.js?worker_file=&type=classic'
      ]);
      expect(globalThis.Worker).toBe(workerConstructor);
    } finally {
      if (originalWorkerDescriptor) {
        Object.defineProperty(globalThis, 'Worker', originalWorkerDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'Worker');
      }
    }
  });

  it('应该将带 hash 的 OPFS proxy worker 重写到显式静态资源路径', async () => {
    const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    const workerConstructor = vi.fn(function (this: Record<string, unknown>, scriptUrl: string | URL) {
      mockState.createdWorkerUrls.push(String(scriptUrl));
      this.scriptUrl = String(scriptUrl);
    });
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      writable: true,
      value: workerConstructor
    });
    mockState.spawnOpfsProxyWorker = true;
    mockState.opfsProxyWorkerUrl = 'http://localhost/assets/sqlite3-opfs-async-proxy-8f3d1a.js';

    try {
      const { sqliteaiLoad, resetSqliteaiLoadCache } = await import('../sqliteai-load.utils.js');
      resetSqliteaiLoadCache();
      await sqliteaiLoad({
        opfs: true,
        opfsProxyPath: '/sqliteai/sqlite3-opfs-async-proxy.js'
      });

      expect(mockState.createdWorkerUrls).toEqual(['http://localhost/sqliteai/sqlite3-opfs-async-proxy.js']);
      expect(globalThis.Worker).toBe(workerConstructor);
    } finally {
      if (originalWorkerDescriptor) {
        Object.defineProperty(globalThis, 'Worker', originalWorkerDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'Worker');
      }
    }
  });
  // SQLAI-001：缓存键只记「是否用过 OPFS proxy patch」，不比较 wasmPath / opfsProxyPath /
  // locateFile —— 第一次用 /a/sqlite.wasm 初始化后，第二个 client 明确传 /b/sqlite.wasm
  // 也会**静默拿到第一个模块**。WASM 模块是进程级单例，不兼容配置必须 fail-fast。
  it('不同 wasmPath 必须重新加载，而不是静默复用首个模块', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    const first = await sqliteaiLoad({ wasmPath: '/a/sqlite.wasm' });
    const second = await sqliteaiLoad({ wasmPath: '/b/sqlite.wasm' });

    // 本包的 mock 恒返回同一个 mockResult，身份断言表达不出「是否重载」，
    // 因此只断言初始化次数（sqlite 官方适配器的 mock 每次返回新对象，那边额外断言了身份）
    expect(mockState.initCalls).toBe(2);
    void first;
    void second;
  });

  it('不同 opfsProxyPath 必须重新加载', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    const first = await sqliteaiLoad({ opfs: true, opfsProxyPath: '/proxy-a.js' });
    const second = await sqliteaiLoad({ opfs: true, opfsProxyPath: '/proxy-b.js' });

    // 本包的 mock 恒返回同一个 mockResult，身份断言表达不出「是否重载」，
    // 因此只断言初始化次数（sqlite 官方适配器的 mock 每次返回新对象，那边额外断言了身份）
    expect(mockState.initCalls).toBe(2);
    void first;
    void second;
  });

  it('新增 locateFile 必须重新加载', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    const first = await sqliteaiLoad();
    const second = await sqliteaiLoad({ locateFile: (name: string) => `/assets/${name}` });

    // 本包的 mock 恒返回同一个 mockResult，身份断言表达不出「是否重载」，
    // 因此只断言初始化次数（sqlite 官方适配器的 mock 每次返回新对象，那边额外断言了身份）
    expect(mockState.initCalls).toBe(2);
    void first;
    void second;
  });

  // 反向守卫：完全相同的配置仍然必须命中缓存，否则 fail-fast 会退化成「永不复用」
  it('相同配置仍然命中缓存', async () => {
    const { sqliteaiLoad } = await import('../sqliteai-load.utils.js');

    const first = await sqliteaiLoad({ wasmPath: '/a/sqlite.wasm' });
    const second = await sqliteaiLoad({ wasmPath: '/a/sqlite.wasm' });

    expect(mockState.initCalls).toBe(1);
    expect(first).toBe(second);
  });
});
