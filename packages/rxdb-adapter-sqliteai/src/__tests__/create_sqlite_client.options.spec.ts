import { releaseComlinkProxy } from '@aiao/rxdb-adapter-sqlite-core';
import { expose } from 'comlink';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteaiLoadOptions, SqliteaiOptions } from '../sqliteai.interface.js';

const mockState = vi.hoisted(() => ({
  directInit: vi.fn()
}));

vi.mock('../SqliteaiClient.js', () => ({
  SqliteaiClient: class {
    readonly init = mockState.directInit;
  }
}));

/**
 * 起一条真实的 MessageChannel 当 Comlink 传输层，并记录远端收到的 init 参数与代理释放。
 *
 * @remarks
 * 与 `rxdb-adapter-sqlite` 的同名 spec 一致，不桩掉 `wrapWithComlinkEndpoint` / `releaseComlinkProxy`：
 * 要守的是「每次连接租一条子端口、释放后归还、同一个 Worker 能再连」，只有真实传输层能区分它和
 * 「释放根代理后 Worker 永久失联」这两种语义，断言假函数被调用区分不了。
 */
const createComlinkBackend = (init: (dbName: string, options: SqliteaiLoadOptions) => Promise<void>) => {
  const channel = new MessageChannel();
  const released = { value: false };
  expose({ init, version: async () => '3.53.0' }, channel.port2);
  channel.port2.addEventListener('message', event => {
    if ((event as MessageEvent<{ type?: string }>).data?.type === 'RELEASE') released.value = true;
  });
  // MessagePort 是合法的 Comlink 端点，但选项类型声明的是 Worker
  return { workerInstance: channel.port1 as unknown as Worker, released };
};

describe('createSqliteClient options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('worker 模式只把 load options 交给远端 init，本地 client 不参与', async () => {
    const init = vi.fn<(dbName: string, options: SqliteaiLoadOptions) => Promise<void>>(() => Promise.resolve());
    const { workerInstance } = createComlinkBackend(init);
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
    const client = await createSqliteClient('options-db', options);

    expect(mockState.directInit).not.toHaveBeenCalled();
    expect(init).toHaveBeenCalledWith('options-db', {
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
    await expect(client.version()).resolves.toBe('3.53.0');
  });

  it('worker 模式下函数型选项应该显式抛错，而不是留到 Comlink 抛 DataCloneError', async () => {
    // 原先这里断言 locateFile / print / printErr 会被原样交给远端 init —— 那是把缺陷
    // 写进了测试：函数无法结构化克隆，postMessage 必抛 DataCloneError。
    const init = vi.fn(() => Promise.resolve());
    const { workerInstance } = createComlinkBackend(init);
    const options: SqliteaiOptions = {
      wasmPath: '/assets/sqlite3.wasm',
      locateFile: (name: string) => `/assets/${name}`,
      printErr: (message: string) => message,
      worker: true,
      workerInstance
    };

    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('worker-db', options)).rejects.toThrow('locateFile, printErr');
    expect(init).not.toHaveBeenCalled();
  });

  // 每次连接租用 Worker 的一条子端口：init 失败后没还回去，同一个 Worker 上的下一次连接会被拒，
  // worker 侧那个 init 失败的客户端也一直可达、永不回收。三个适配器在这条清理契约上必须一致。
  it('init 失败时归还子端口，并把原始错误原样抛出', async () => {
    let attempts = 0;
    const failure = new Error('init failed');
    const { workerInstance } = createComlinkBackend(() =>
      ++attempts === 1 ? Promise.reject(failure) : Promise.resolve()
    );

    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('fail-db', { worker: true, workerInstance })).rejects.toThrow('init failed');
    const retried = await createSqliteClient('fail-db', { worker: true, workerInstance });
    await expect(retried.version()).resolves.toBe('3.53.0');
    expect(mockState.directInit).not.toHaveBeenCalled();
  });

  it('init 成功时不释放代理，子端口一直被这条连接占着', async () => {
    const { workerInstance, released } = createComlinkBackend(() => Promise.resolve());

    const { createSqliteClient } = await import('../create_sqlite_client.js');
    const client = await createSqliteClient('ok-db', { worker: true, workerInstance });

    // 释放过的代理再调用会抛 'Proxy has been released and is not useable'，
    // 所以这行既证明端口还开着，也证明没被误释放。
    await expect(client.version()).resolves.toBe('3.53.0');
    expect(released.value).toBe(false);
    await expect(createSqliteClient('ok-db', { worker: true, workerInstance })).rejects.toThrow(
      'Worker transport already has an active SQLite client'
    );
  });

  // 恢复先开一条连接写库、关掉，再由 connect 开第二条：根代理一释放，Worker 侧 `expose()`
  // 就永久摘掉监听，同一个 Worker 上的第二条连接永远等不到回复。
  it('释放上一条连接后，同一个调用方持有的 Worker 可以再连', async () => {
    const { workerInstance, released } = createComlinkBackend(() => Promise.resolve());

    const { createSqliteClient } = await import('../create_sqlite_client.js');
    const first = await createSqliteClient('reconnect-db', { worker: true, workerInstance });
    expect(releaseComlinkProxy(first)).toBe(true);

    const second = await createSqliteClient('reconnect-db', { worker: true, workerInstance });
    await expect(second.version()).resolves.toBe('3.53.0');
    expect(released.value).toBe(false);
  });
});
