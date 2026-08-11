import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteaiOptions } from '../sqliteai.interface.js';

const mockState = vi.hoisted(() => ({
  directInit: vi.fn(),
  wrappedInit: vi.fn(),
  wrapWithComlink: vi.fn()
}));

vi.mock('@aiao/rxdb-adapter-sqlite-core', async importOriginal => {
  const original = await importOriginal<typeof import('@aiao/rxdb-adapter-sqlite-core')>();
  return { ...original, wrapWithComlink: mockState.wrapWithComlink };
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
});
