import { expose } from 'comlink';
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

/**
 * 起一条真实的 MessageChannel 当 Comlink 传输层，并记录代理释放。
 *
 * @remarks
 * 这里不用 `vi.mock('@aiao/rxdb-adapter-sqlite-core')` 去桩掉 `wrapWithComlink` /
 * `releaseComlinkProxy`：本包在 vitest 里**根本 mock 不动**这个模块。
 * `@vitest/mocker` 的 `resolveMockPath` 用 `path.startsWith(config.root)` 判断模块是否
 * 在项目根内，而 root 不带尾斜杠 —— 本包根目录 `packages/rxdb-adapter-sqlite` 恰好是
 * 兄弟包目录 `packages/rxdb-adapter-sqlite-core` 的字符串前缀，于是 core 的路径被切成
 * `-core/dist/index.js` 这种废 key，注册的 mock 永远匹配不上浏览器实际加载的 URL。
 * 失败形态是**静默的**：mock 工厂不报错，测试照跑，只是拿到真实实现
 * （`rxdb-adapter-sqliteai` 因为目录名不构成前缀，同样的写法却生效）。
 *
 * 所以改成走真实 Comlink：断言远端观察到的 RELEASE 报文，比断言一个假函数被调用更接近
 * 真正要守的东西 —— 端口有没有被还回去。
 */
const createComlinkBackend = (init: () => Promise<void>) => {
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

  // 代理在 worker / sharedWorker 模式下持有一个 MessageChannel。init 失败后不释放，
  // 断线重连循环里端口只增不减，worker 侧那个 init 失败的客户端也一直可达、永不回收。
  // 三个适配器（sqlite / sqlite-wasm / sqliteai）在这条清理契约上必须一致。
  it('init 失败时释放 Comlink 代理，并把原始错误原样抛出', async () => {
    const { workerInstance, released } = createComlinkBackend(() => Promise.reject(new Error('init failed')));

    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('fail-db', { worker: true, workerInstance })).rejects.toThrow('init failed');
    await vi.waitFor(() => expect(released.value).toBe(true));
    expect(mockState.directInit).not.toHaveBeenCalled();
  });

  it('init 成功时不释放代理，返回的远端客户端仍然可用', async () => {
    const { workerInstance, released } = createComlinkBackend(() => Promise.resolve());

    const { createSqliteClient } = await import('../create_sqlite_client.js');
    const client = await createSqliteClient('ok-db', { worker: true, workerInstance });

    // 释放过的代理再调用会抛 'Proxy has been released and is not useable'，
    // 所以这行既证明端口还开着，也证明没被误释放。
    await expect(client.version()).resolves.toBe('3.53.0');
    expect(released.value).toBe(false);
  });
});
