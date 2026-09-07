import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteaiOptions } from '../sqliteai.interface.js';

const mockState = vi.hoisted(() => ({
  directInit: vi.fn(),
  wrappedInit: vi.fn(),
  wrapWithComlink: vi.fn(),
  releaseComlinkProxy: vi.fn()
}));

vi.mock('@aiao/rxdb-adapter-sqlite-core', async importOriginal => {
  const original = await importOriginal<typeof import('@aiao/rxdb-adapter-sqlite-core')>();
  return {
    ...original,
    wrapWithComlink: mockState.wrapWithComlink,
    releaseComlinkProxy: mockState.releaseComlinkProxy
  };
});

vi.mock('../SqliteaiClient.js', () => ({
  SqliteaiClient: class {
    readonly init = mockState.directInit;
  }
}));

describe('createSqliteClient options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该把 transport options 原样交给 Comlink，并只把 load options 传给远端 init', async () => {
    const wrappedClient = { init: mockState.wrappedInit };
    mockState.wrapWithComlink.mockReturnValue(wrappedClient);
    mockState.wrappedInit.mockResolvedValue(undefined);

    const workerInstance = Object.create(null) as Worker;
    const options: SqliteaiOptions = {
      opfs: true,
      wasmPath: '/assets/sqlite3.wasm',
      opfsProxyPath: '/assets/sqlite3-opfs-async-proxy.js',
      cacheSizeKb: 2048,
      batchTimeout: 7,
      opfsFallback: 'throw',
      worker: true,
      workerInstance
    };

    const { createSqliteClient } = await import('../create_sqlite_client.js');
    const result = await createSqliteClient('options-db', options);

    expect(mockState.wrapWithComlink).toHaveBeenCalledOnce();
    expect(mockState.wrapWithComlink).toHaveBeenCalledWith(expect.anything(), options);
    expect(mockState.directInit).not.toHaveBeenCalled();
    expect(mockState.wrappedInit).toHaveBeenCalledWith('options-db', {
      opfs: true,
      wasmPath: '/assets/sqlite3.wasm',
      opfsProxyPath: '/assets/sqlite3-opfs-async-proxy.js',
      locateFile: undefined,
      print: undefined,
      printErr: undefined,
      cacheSizeKb: 2048,
      batchTimeout: 7,
      opfsFallback: 'throw'
    });
    expect(result).toBe(wrappedClient);
  });

  it('worker 模式下函数型选项应该显式抛错，而不是留到 Comlink 抛 DataCloneError', async () => {
    // 原先这里断言 locateFile / print / printErr 会被原样交给远端 init —— 那是把缺陷
    // 写进了测试：函数无法结构化克隆，postMessage 必抛 DataCloneError。
    mockState.wrapWithComlink.mockReturnValue({ init: mockState.wrappedInit });
    const options: SqliteaiOptions = {
      wasmPath: '/assets/sqlite3.wasm',
      locateFile: (name: string) => `/assets/${name}`,
      printErr: (message: string) => message,
      worker: true,
      workerInstance: Object.create(null) as Worker
    };

    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('worker-db', options)).rejects.toThrow('locateFile, printErr');
    expect(mockState.wrappedInit).not.toHaveBeenCalled();
  });

  // 代理在 worker / sharedWorker 模式下持有一个 MessageChannel。init 失败后不释放，
  // 断线重连循环里端口只增不减，worker 侧那个 init 失败的客户端也一直可达、永不回收。
  it('init 失败时释放 Comlink 代理，并把原始错误原样抛出', async () => {
    const wrappedClient = { init: mockState.wrappedInit };
    mockState.wrapWithComlink.mockReturnValue(wrappedClient);
    const failure = new Error('init failed');
    mockState.wrappedInit.mockRejectedValue(failure);

    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(
      createSqliteClient('fail-db', { worker: true, workerInstance: Object.create(null) as Worker })
    ).rejects.toBe(failure);
    expect(mockState.releaseComlinkProxy).toHaveBeenCalledWith(wrappedClient);
  });

  it('init 成功时不释放代理', async () => {
    const wrappedClient = { init: mockState.wrappedInit };
    mockState.wrapWithComlink.mockReturnValue(wrappedClient);
    mockState.wrappedInit.mockResolvedValue(undefined);

    const { createSqliteClient } = await import('../create_sqlite_client.js');
    await createSqliteClient('ok-db', { worker: true, workerInstance: Object.create(null) as Worker });

    expect(mockState.releaseComlinkProxy).not.toHaveBeenCalled();
  });
});
