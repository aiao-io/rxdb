import { assertLoadOptionsTransferable, wrapWithComlink, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { SqliteaiOptions, type SqliteaiLoadOptions } from './sqliteai.interface.js';
import { SqliteaiClient } from './SqliteaiClient.js';

/**
 * 创建 SqliteAI 客户端实例并完成初始化。
 *
 * 如果 `options` 中指定了 worker / sharedWorker，会通过 `wrapWithComlink` 把客户端代理到 worker；
 * 否则在主线程直接 new。
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

  const client = wrapWithComlink(new SqliteaiClient(), options);
  await client.init(dbName, loadOptions);
  return client;
}
