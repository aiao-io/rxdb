import { assertLoadOptionsTransferable, type SqliteClientLike, wrapWithComlink } from '@aiao/rxdb-adapter-sqlite-core';
import type { SqliteLoadOptions, SqliteOptions } from './sqlite-official.interface.js';
import { SqliteClient } from './SqliteOfficialClient.js';

/**
 * 创建并初始化官方 sqlite-wasm 客户端。
 *
 * @remarks
 * 返回类型是 {@link SqliteClientLike} 而非具体的 `SqliteClient`：
 * 配置了 worker / sharedWorker 时拿到的是 Comlink 远端代理，
 * 它的每个方法都被 Promise 化，声明成 `SqliteClient` 会让
 * `beginTransactionSql(): string` 这类同步签名在跨线程模式下变成谎报（SQLC-040）。
 *
 * @param dbName - 数据库名
 * @param options - 官方 sqlite-wasm 适配器选项
 * @returns 已 `init` 完成的客户端（主线程实例或其远端代理）
 */
export async function createSqliteClient(dbName: string, options: SqliteOptions): Promise<SqliteClientLike> {
  const loadOptions: SqliteLoadOptions = {
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

  const client = wrapWithComlink(new SqliteClient(), options);
  await client.init(dbName, loadOptions);
  return client;
}
