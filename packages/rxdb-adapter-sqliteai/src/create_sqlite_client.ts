import {
  assertLoadOptionsTransferable,
  releaseComlinkProxy,
  wrapWithComlinkEndpoint,
  type SqliteClientLike
} from '@aiao/rxdb-adapter-sqlite-core';
import { SqliteaiOptions, type SqliteaiLoadOptions } from './sqliteai.interface.js';
import { SqliteaiClient } from './SqliteaiClient.js';

/**
 * 创建 SqliteAI 客户端实例并完成初始化。
 *
 * 如果 `options` 中指定了 worker / sharedWorker，会通过 `wrapWithComlinkEndpoint` 为这次连接租用
 * worker 的一条独立子端口；否则在主线程直接 new。释放后同一个 worker 可以再连：恢复先用一条连接写库，
 * 之后的 `connect()` 再开一条。
 *
 * 返回类型是 {@link SqliteClientLike} 而非具体的 `SqliteaiClient`：worker 模式下拿到的是
 * Comlink 远端代理，它把每个方法都 Promise 化，断言成实现类会让 `beginTransactionSql(): string`
 * 这类同步签名在跨线程模式下变成谎报（SQLC-040）。
 *
 * @param dbName - 数据库名（用于持久化文件名归一化）
 * @param options - SqliteAI 适配器选项（含 OPFS / worker / 缓存大小等）
 * @returns 已 `init` 完成、可直接执行 SQL 的客户端（主线程实例或其远端代理）
 * @throws worker / sharedWorker 模式下传入 `locateFile` / `print` / `printErr` 等函数型选项时抛错
 */
export async function createSqliteClient(dbName: string, options: SqliteaiOptions): Promise<SqliteClientLike> {
  const loadOptions: SqliteaiLoadOptions = {
    opfs: options.opfs,
    wasmPath: options.wasmPath,
    opfsProxyPath: options.opfsProxyPath,
    locateFile: options.locateFile,
    print: options.print,
    printErr: options.printErr,
    cacheSizeKb: options.cacheSizeKb,
    batchTimeout: options.batchTimeout,
    opfsFallback: options.opfsFallback
  };

  assertLoadOptionsTransferable(loadOptions, options);

  const client = await wrapWithComlinkEndpoint(new SqliteaiClient(), options);
  try {
    await client.init(dbName, loadOptions);
    return client;
  } catch (error) {
    // 同 rxdb-adapter-sqlite / rxdb-adapter-sqlite-wasm：init 失败要释放 Comlink 代理，
    // 否则 worker 模式下每次失败的重连都会多留一个 MessagePort 和一个 worker 侧客户端。
    releaseComlinkProxy(client);
    throw error;
  }
}
