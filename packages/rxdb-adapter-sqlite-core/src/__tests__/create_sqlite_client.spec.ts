import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

const releaseProxy = Symbol('Comlink.releaseProxy');
const createEndpoint = Symbol('Comlink.endpoint');
const wrapMock = vi.fn<(value: unknown) => unknown>(value => ({ wrapped: value }));

vi.mock('comlink', () => ({
  wrap: (value: unknown) => wrapMock(value),
  createEndpoint,
  releaseProxy
}));

describe('wrapWithComlink', () => {
  beforeEach(() => {
    wrapMock.mockClear();
  });

  function createClient(): SqliteClientLike {
    return {
      execute: vi.fn(),
      disconnect: vi.fn(),
      version: vi.fn(),
      addEventListener: vi.fn()
    };
  }

  it('没有 transport 配置时应该返回原始 client', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');
    const client = createClient();

    expect(wrapWithComlink(client, {})).toBe(client);
    expect(wrapMock).not.toHaveBeenCalled();
  });

  it('worker 缺少 workerInstance 时应该抛错', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');

    expect(() => wrapWithComlink(createClient(), { worker: true })).toThrow(RxDBAdapterSqliteError);
    expect(() => wrapWithComlink(createClient(), { worker: true })).toThrow('worker');
  });

  it('sharedWorker 缺少 sharedWorkerInstance 时应该抛错', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');

    expect(() => wrapWithComlink(createClient(), { sharedWorker: true })).toThrow(RxDBAdapterSqliteError);
    expect(() => wrapWithComlink(createClient(), { sharedWorker: true })).toThrow('sharedWorker');
  });

  it('同时传 worker 和 sharedWorker 时应该抛错', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');

    expect(() =>
      wrapWithComlink(createClient(), {
        worker: true,
        workerInstance: {} as Worker,
        sharedWorker: true,
        sharedWorkerInstance: { port: {} } as SharedWorker
      })
    ).toThrow(RxDBAdapterSqliteError);
  });

  it('没有 transport 时不得声明 client 所有权', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');

    expect(() => wrapWithComlink(createClient(), { workerOwnership: 'client' })).toThrow(
      '`workerOwnership` requires a Worker or SharedWorker transport'
    );
  });

  it('worker 配置完整时应该走 comlink 包装', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');
    const client = createClient();
    const worker = {} as Worker;

    const wrapped = wrapWithComlink(client, { worker: true, workerInstance: worker });

    expect(wrapped).toEqual({ wrapped: worker });
    expect(wrapMock).toHaveBeenCalledWith(worker);
  });

  it('只传 workerInstance 时应该推断 Worker transport', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');
    const client = createClient();
    const worker = {} as Worker;

    const wrapped = wrapWithComlink(client, { workerInstance: worker });

    expect(wrapped).toEqual({ wrapped: worker });
    expect(wrapMock).toHaveBeenCalledWith(worker);
  });

  it('sharedWorker 配置完整时应该使用 port 包装', async () => {
    const { wrapWithComlink } = await import('../create_sqlite_client.js');
    const client = createClient();
    const port = {} as MessagePort;

    const wrapped = wrapWithComlink(client, {
      sharedWorker: true,
      sharedWorkerInstance: { port } as SharedWorker
    });

    expect(wrapped).toEqual({ wrapped: port });
    expect(wrapMock).toHaveBeenCalledWith(port);
  });
});

// SQLC-041：Comlink 根代理没有任何释放入口，`wrapWithComlink` 把 `Remote<T>` 断言成 `T`
// 之后调用方拿不到 `releaseProxy`，每次重连都新建 MessageChannel 却从不回收。
describe('releaseComlinkProxy', () => {
  it('对 Comlink 代理应该调用 releaseProxy 并返回 true', async () => {
    const { releaseComlinkProxy } = await import('../create_sqlite_client.js');
    const release = vi.fn();
    const proxy = { [releaseProxy]: release };

    expect(releaseComlinkProxy(proxy)).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    expect(releaseComlinkProxy(proxy)).toBe(false);
  });

  it('对本地客户端应该是无操作并返回 false', async () => {
    const { releaseComlinkProxy } = await import('../create_sqlite_client.js');

    expect(releaseComlinkProxy({ execute: vi.fn() })).toBe(false);
  });

  it('对 undefined / null 应该安全返回 false', async () => {
    const { releaseComlinkProxy } = await import('../create_sqlite_client.js');

    expect(releaseComlinkProxy(undefined)).toBe(false);
    expect(releaseComlinkProxy(null)).toBe(false);
  });

  it('Comlink 的函数代理同样应该被释放', async () => {
    const { releaseComlinkProxy } = await import('../create_sqlite_client.js');
    const release = vi.fn();
    const proxy = Object.assign(() => undefined, { [releaseProxy]: release });

    expect(releaseComlinkProxy(proxy)).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('wrapWithComlinkEndpoint', () => {
  const createEndpointClient = (): SqliteClientLike => ({
    execute: vi.fn(),
    disconnect: vi.fn(),
    version: vi.fn(),
    addEventListener: vi.fn()
  });

  it('为 caller-owned Worker 复用控制代理，并为每个客户端创建独立端口', async () => {
    const { releaseComlinkProxy, wrapWithComlinkEndpoint } = await import('../create_sqlite_client.js');
    const worker = {} as Worker;
    const firstPort = {} as MessagePort;
    const secondPort = {} as MessagePort;
    const createClientEndpoint = vi.fn().mockResolvedValueOnce(firstPort).mockResolvedValueOnce(secondPort);
    const root = { [createEndpoint]: createClientEndpoint };
    const firstClient = { [releaseProxy]: vi.fn(), client: 1 };
    const secondClient = { [releaseProxy]: vi.fn(), client: 2 };
    wrapMock.mockImplementation(value => {
      if (value === worker) return root;
      if (value === firstPort) return firstClient;
      if (value === secondPort) return secondClient;
      return { wrapped: value };
    });

    const first = await wrapWithComlinkEndpoint(createEndpointClient(), { worker: true, workerInstance: worker });
    expect(releaseComlinkProxy(first)).toBe(true);
    const second = await wrapWithComlinkEndpoint(createEndpointClient(), { worker: true, workerInstance: worker });

    expect(first).toBe(firstClient);
    expect(second).toBe(secondClient);
    expect(wrapMock).toHaveBeenCalledWith(worker);
    expect(wrapMock.mock.calls.filter(([value]) => value === worker)).toHaveLength(1);
    expect(createClientEndpoint).toHaveBeenCalledTimes(2);
  });

  it('client-owned Worker 在客户端释放时终止', async () => {
    const { releaseComlinkProxy, wrapWithComlinkEndpoint } = await import('../create_sqlite_client.js');
    const terminate = vi.fn();
    const worker = { terminate } as unknown as Worker;
    const port = {} as MessagePort;
    const client = { [releaseProxy]: vi.fn() };
    wrapMock.mockImplementation(value => {
      if (value === worker) return { [createEndpoint]: vi.fn().mockResolvedValue(port) };
      if (value === port) return client;
      return { wrapped: value };
    });

    const wrapped = await wrapWithComlinkEndpoint(createEndpointClient(), {
      worker: true,
      workerInstance: worker,
      workerOwnership: 'client'
    });

    expect(releaseComlinkProxy(wrapped)).toBe(true);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('client-owned SharedWorker 在客户端释放时关闭根代理', async () => {
    const { releaseComlinkProxy, wrapWithComlinkEndpoint } = await import('../create_sqlite_client.js');
    const rootRelease = vi.fn();
    const childRelease = vi.fn();
    const port = {} as MessagePort;
    const childPort = {} as MessagePort;
    const sharedWorker = { port } as SharedWorker;
    const root = {
      [createEndpoint]: vi.fn().mockResolvedValue(childPort),
      [releaseProxy]: rootRelease
    };
    const client = { [releaseProxy]: childRelease };
    wrapMock.mockImplementation(value => {
      if (value === port) return root;
      if (value === childPort) return client;
      return { wrapped: value };
    });

    const wrapped = await wrapWithComlinkEndpoint(createEndpointClient(), {
      sharedWorkerInstance: sharedWorker,
      workerOwnership: 'client'
    });

    expect(releaseComlinkProxy(wrapped)).toBe(true);
    expect(childRelease).toHaveBeenCalledOnce();
    expect(rootRelease).toHaveBeenCalledOnce();
  });
});

describe('assertLoadOptionsTransferable', () => {
  const locateFile = (name: string) => `/assets/${name}`;

  it('主线程模式下允许函数型选项', async () => {
    const { assertLoadOptionsTransferable } = await import('../create_sqlite_client.js');

    expect(() => assertLoadOptionsTransferable({ locateFile, wasmPath: '/a.wasm' }, {})).not.toThrow();
  });

  it('worker 模式下遇到函数型选项应该抛出可读错误', async () => {
    const { assertLoadOptionsTransferable } = await import('../create_sqlite_client.js');
    const options = { worker: true, workerInstance: {} as Worker };

    expect(() => assertLoadOptionsTransferable({ locateFile }, options)).toThrow(RxDBAdapterSqliteError);
    expect(() => assertLoadOptionsTransferable({ locateFile }, options)).toThrow('locateFile');
    // 必须指出替代方案，否则调用方只能靠猜
    expect(() => assertLoadOptionsTransferable({ locateFile }, options)).toThrow('wasmPath');
  });

  it('仅提供 workerInstance 时同样按跨线程校验', async () => {
    const { assertLoadOptionsTransferable } = await import('../create_sqlite_client.js');

    expect(() => assertLoadOptionsTransferable({ locateFile }, { workerInstance: {} as Worker })).toThrow('locateFile');
  });

  it('sharedWorker 模式同样拦截，并列出全部函数型选项', async () => {
    const { assertLoadOptionsTransferable } = await import('../create_sqlite_client.js');
    const options = { sharedWorker: true, sharedWorkerInstance: { port: {} } as SharedWorker };
    const loadOptions = {
      locateFile,
      print: (message: string) => message,
      printErr: (message: string) => message,
      wasmPath: '/a.wasm'
    };

    expect(() => assertLoadOptionsTransferable(loadOptions, options)).toThrow('locateFile, print, printErr');
  });

  it('worker 模式下全是可克隆值时不抛错', async () => {
    const { assertLoadOptionsTransferable } = await import('../create_sqlite_client.js');
    const options = { worker: true, workerInstance: {} as Worker };

    expect(() =>
      assertLoadOptionsTransferable({ wasmPath: '/a.wasm', opfs: true, cacheSizeKb: 2048 }, options)
    ).not.toThrow();
  });

  it('值为 undefined 的函数型选项不算未传', async () => {
    const { assertLoadOptionsTransferable } = await import('../create_sqlite_client.js');
    const options = { worker: true, workerInstance: {} as Worker };

    expect(() => assertLoadOptionsTransferable({ locateFile: undefined, print: undefined }, options)).not.toThrow();
  });
});
