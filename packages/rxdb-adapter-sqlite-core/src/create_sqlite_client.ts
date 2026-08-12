import { createEndpoint, releaseProxy, wrap, type Remote } from 'comlink';
import type { SqliteClientLike } from './RxDBAdapterSqliteBase.js';
import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

/**
 * 创建支持 Worker 的 SQLite 客户端的选项。
 */
export interface CreateSqliteClientOptions {
  worker?: boolean;
  workerInstance?: Worker;
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;
  /**
   * Worker transport 的生命周期所有者。
   *
   * `caller` 保留线程供后续连接复用；`client` 在释放客户端代理时终止 Worker
   * （SharedWorker 则关闭其根端口）。默认 `caller`，保持既有调用方所有权。
   */
  workerOwnership?: 'caller' | 'client';
}

interface ComlinkTransportRoot {
  readonly key: object;
  readonly proxy: Remote<SqliteClientLike>;
  readonly ownership: NonNullable<CreateSqliteClientOptions['workerOwnership']>;
  readonly worker?: Worker;
  activeClients: number;
}

interface ComlinkClientEndpoint {
  readonly root: ComlinkTransportRoot;
}

const transportRoots = new WeakMap<object, ComlinkTransportRoot>();
const clientEndpoints = new WeakMap<object, ComlinkClientEndpoint>();
const releasedProxies = new WeakSet<object>();

const isReference = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/**
 * 校验 Comlink 传输选项的组合合法性：worker / workerInstance / sharedWorker 必须成对出现。
 */
export function validateComlinkTransportOptions(options: CreateSqliteClientOptions): void {
  const hasWorkerFlag = options.worker === true;
  const hasWorkerInstance = options.workerInstance !== undefined;
  const hasSharedWorkerFlag = options.sharedWorker === true;
  const hasSharedWorkerInstance = options.sharedWorkerInstance !== undefined;

  if (hasWorkerFlag && !hasWorkerInstance) {
    throw new RxDBAdapterSqliteError('`worker` and `workerInstance` must be provided together');
  }

  if (options.worker === false && hasWorkerInstance) {
    throw new RxDBAdapterSqliteError('`worker` cannot be false when `workerInstance` is provided');
  }

  if (hasSharedWorkerFlag && !hasSharedWorkerInstance) {
    throw new RxDBAdapterSqliteError('`sharedWorker` and `sharedWorkerInstance` must be provided together');
  }

  if (options.sharedWorker === false && hasSharedWorkerInstance) {
    throw new RxDBAdapterSqliteError('`sharedWorker` cannot be false when `sharedWorkerInstance` is provided');
  }

  if ((hasWorkerFlag || hasWorkerInstance) && (hasSharedWorkerFlag || hasSharedWorkerInstance)) {
    throw new RxDBAdapterSqliteError('Worker and SharedWorker transports are mutually exclusive');
  }

  if (
    options.workerOwnership !== undefined &&
    options.workerOwnership !== 'caller' &&
    options.workerOwnership !== 'client'
  ) {
    throw new RxDBAdapterSqliteError('`workerOwnership` must be either `caller` or `client`');
  }

  if (options.workerOwnership !== undefined && !hasWorkerInstance && !hasSharedWorkerInstance) {
    throw new RxDBAdapterSqliteError('`workerOwnership` requires a Worker or SharedWorker transport');
  }
}

/**
 * 断言即将跨 worker 传递的 load options 可被结构化克隆。
 *
 * Comlink 用 `postMessage` 传参，函数不在结构化克隆算法的支持范围内：把
 * `locateFile` / `print` / `printErr` 这类回调塞进 `client.init(dbName, loadOptions)`
 * 会在 worker 边界抛 `DataCloneError`，而报错栈里看不出是哪个选项造成的。
 *
 * 因此在跨线程前显式拦截并点名选项 —— 既不静默丢弃回调（会让 WASM 定位悄悄走错路径），
 * 也不降级回主线程（会伪装出线程隔离的假象）。
 *
 * @param loadOptions - 将被传给 `client.init` 的运行期选项
 * @param options - transport 配置，用于判断是否真的跨 worker
 * @throws worker / sharedWorker 模式下存在函数型选项时抛 {@link RxDBAdapterSqliteError}
 */
export function assertLoadOptionsTransferable(
  loadOptions: Readonly<Record<string, unknown>>,
  options: CreateSqliteClientOptions
): void {
  if (options.workerInstance === undefined && options.sharedWorkerInstance === undefined) return;

  const functionKeys = Object.keys(loadOptions).filter(key => typeof loadOptions[key] === 'function');
  if (functionKeys.length === 0) return;

  throw new RxDBAdapterSqliteError(
    `Cannot transfer function options to a worker: ${functionKeys.join(', ')}. ` +
      'Functions are not structured-cloneable. Use `wasmPath` (a string URL) to locate WASM assets, ' +
      'and keep `print` / `printErr` on the main thread.'
  );
}

/**
 * 提供 Worker/SharedWorker 选项时使用 Comlink 包装客户端，否则返回直接客户端。
 *
 * @remarks
 * 返回类型是联合而非裸 `T`：Comlink 给回的是 {@link Remote}，
 * 它把每个方法的返回值 Promise 化，并且**不带** `T` 的私有字段与同步返回签名。
 * 早先用 `as unknown as T` 把远端代理断言成本地客户端类型，
 * 于是 `beginTransactionSql(): string` 这类同步签名在 worker 模式下是假的
 * —— 调用方按类型不 await，拿到的是 Promise 而不是 SQL 文本。
 * 调用方应把结果当作 {@link SqliteClientLike}（其签名已按「远端会 Promise 化」放宽），
 * 而不是具体的客户端实现类。
 *
 * @param directClient - 主线程客户端实例，未配置 transport 时原样返回
 * @param options - transport 配置
 * @returns 主线程客户端或其 Comlink 远端代理
 */
export function wrapWithComlink<T extends SqliteClientLike>(
  directClient: T,
  options: CreateSqliteClientOptions
): T | Remote<T> {
  validateComlinkTransportOptions(options);

  if (options.workerInstance) {
    return wrap<T>(options.workerInstance);
  }
  if (options.sharedWorkerInstance) {
    return wrap<T>(options.sharedWorkerInstance.port);
  }
  return directClient;
}

/**
 * 为一次客户端连接创建独立的 Comlink 子端口。
 *
 * @remarks
 * 直接对 Worker 调用 `wrap()` 得到的是根代理；释放它会让 Worker 侧 `expose()`
 * 永久移除消息监听，之后同一 Worker 无法重连。这里缓存根控制代理，只通过
 * `createEndpoint` 为每次连接创建可独立释放的 MessagePort。Worker 内仍可继续使用
 * 既有的 `expose(new SqliteClient())`，无需切换公开协议。
 *
 * 同一个 Worker 暴露的是同一个客户端实例，不允许并发租用；上一连接释放后才能重连。
 *
 * @param directClient - 主线程客户端实例，未配置 transport 时原样返回
 * @param options - transport 与所有权配置
 * @returns 主线程客户端或独立子端口上的 Comlink 远端代理
 */
export async function wrapWithComlinkEndpoint<T extends SqliteClientLike>(
  directClient: T,
  options: CreateSqliteClientOptions
): Promise<T | Remote<T>> {
  validateComlinkTransportOptions(options);

  const key = options.workerInstance ?? options.sharedWorkerInstance;
  if (!key) return directClient;

  const ownership = options.workerOwnership ?? 'caller';
  let root = transportRoots.get(key);
  if (!root) {
    const proxy =
      options.workerInstance ?
        wrap<SqliteClientLike>(options.workerInstance)
      : wrap<SqliteClientLike>(options.sharedWorkerInstance!.port);
    root = {
      key,
      proxy,
      ownership,
      worker: options.workerInstance,
      activeClients: 0
    };
    transportRoots.set(key, root);
  }

  if (root.ownership !== ownership) {
    throw new RxDBAdapterSqliteError('Worker ownership cannot change while the transport is active');
  }
  if (root.activeClients !== 0) {
    throw new RxDBAdapterSqliteError('Worker transport already has an active SQLite client');
  }

  root.activeClients = 1;
  try {
    const endpoint = await root.proxy[createEndpoint]();
    const client = wrap<T>(endpoint);
    clientEndpoints.set(client, { root });
    return client;
  } catch (error) {
    root.activeClients = 0;
    if (root.ownership === 'client') disposeTransportRoot(root);
    throw error;
  }
}

const releaseProxyReference = (proxy: object): boolean => {
  if (releasedProxies.has(proxy)) return false;
  const release = (proxy as Partial<Record<typeof releaseProxy, unknown>>)[releaseProxy];
  if (typeof release !== 'function') return false;
  release.call(proxy);
  releasedProxies.add(proxy);
  return true;
};

const disposeTransportRoot = (root: ComlinkTransportRoot): void => {
  transportRoots.delete(root.key);
  releaseProxyReference(root.proxy);
  root.worker?.terminate();
};

/**
 * 释放 Comlink 代理占用的 MessagePort。
 *
 * @remarks
 * `wrap()` 出来的每个代理都持有一个 MessageChannel，回调参数还会各自再建一个。
 * 不释放则断开/重连循环里端口只增不减，Worker 侧的引用也一直活着
 * （实测 `disconnect()` 之后远端方法仍可调用）。
 * 本地客户端没有 `releaseProxy`，此时是无操作 —— 由返回值区分，不静默吞掉差异。
 *
 * @param client - {@link wrapWithComlink} / {@link wrapWithComlinkEndpoint} 的返回值，或 `undefined`
 * @returns 是否真的释放了远端代理
 */
export function releaseComlinkProxy(client: unknown): boolean {
  if (!isReference(client)) return false;
  const endpoint = clientEndpoints.get(client);
  const released = releaseProxyReference(client);
  if (!released || !endpoint) return released;

  clientEndpoints.delete(client);
  endpoint.root.activeClients = 0;
  if (endpoint.root.ownership === 'client') disposeTransportRoot(endpoint.root);
  return true;
}
