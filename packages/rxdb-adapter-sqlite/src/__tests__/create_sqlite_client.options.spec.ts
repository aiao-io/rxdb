import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteOptions } from '../sqlite-official.interface.js';

const mockState = vi.hoisted(() => ({
  directInit: vi.fn()
}));

vi.mock('../SqliteOfficialClient.js', () => ({
  SqliteClient: class {
    readonly init = mockState.directInit;
  }
}));

describe('createSqliteClient options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该只把 load options 传给本地 client init', async () => {
    mockState.directInit.mockResolvedValue(undefined);
    const locateFile = (name: string) => `/assets/${name}`;
    const print = (message: string) => message;
    const printErr = (message: string) => message;
    const options: SqliteOptions = {
      opfs: true,
      wasmPath: '/assets/sqlite3.wasm',
      opfsProxyPath: '/assets/sqlite3-opfs-async-proxy.js',
      locateFile,
      print,
      printErr,
      cacheSizeKb: 2048,
      batchTimeout: 7,
      opfsFallback: 'throw'
    };

    const { createSqliteClient } = await import('../create_sqlite_client.js');
    const result = await createSqliteClient('options-db', options);

    expect(mockState.directInit).toHaveBeenCalledWith('options-db', {
      opfs: true,
      wasmPath: '/assets/sqlite3.wasm',
      opfsProxyPath: '/assets/sqlite3-opfs-async-proxy.js',
      locateFile,
      print,
      printErr,
      cacheSizeKb: 2048,
      batchTimeout: 7,
      opfsFallback: 'throw'
    });
    // 未配置 worker 时返回的必须是本地 client 本身（不是 Comlink 代理）。
    // 断言实例身份而不是 `result.init`：返回类型现在是公开的 SqliteClientLike，
    // 上面没有 `init` —— 为了取它而把返回值断言回实现类，正是 SQLC-040 要去掉的谎报。
    const { SqliteClient } = await import('../SqliteOfficialClient.js');
    expect(result).toBeInstanceOf(SqliteClient);
  });

  it('worker 模式下函数型选项应该显式抛错，而不是留到 Comlink 抛 DataCloneError', async () => {
    mockState.directInit.mockResolvedValue(undefined);
    const options: SqliteOptions = {
      wasmPath: '/assets/sqlite3.wasm',
      locateFile: (name: string) => `/assets/${name}`,
      worker: true,
      workerInstance: {} as Worker
    };

    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('worker-db', options)).rejects.toThrow('locateFile');
  });
});
