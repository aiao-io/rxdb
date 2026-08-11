import { releaseComlinkProxy, type SqliteClientLike, wrapWithComlinkEndpoint } from '@aiao/rxdb-adapter-sqlite-core';
import { LoadModuleOptions, SqliteOptions } from './sqlite.interface.js';
import { SqliteClient } from './SqliteClient.js';

/**
 * 创建 SQLite 客户端
 *
 * VFS 配置的校验在 `sqliteLoad` 内部完成，避免重复检查。
 * `worker: true` / `sharedWorker: true` 缺少对应实例时 fail-fast；只传实例则直接推断 transport，
 * 避免静默回退主线程造成线程隔离 / OPFS 运行环境的假象。
 */
interface SqliteWasmClientLike extends SqliteClientLike {
  init(dbName: string, options: LoadModuleOptions): Promise<void>;
  /**
   * 本包的 {@link SqliteClient} 必然实现这两个方法，因此在这里收窄成必选。
   *
   * @remarks
   * 不能沿用 `SqliteClientLike` 的可选声明：Comlink 的 `Remote<T>` 分不清
   * 「可选方法」与「可选数据属性」，会把 `foo?(): string` 映射成
   * `Remote<() => string> | Promise<undefined> | undefined`，
   * 于是 `Remote<SqliteWasmClientLike>` 反而不再满足 `SqliteClientLike`。
   * 声明成必选后映射结果是纯粹的可调用代理，远端与本地共用一套类型。
   */
  beginTransactionSql(): string | Promise<string>;
  beginSystemMigrationTransactionSql(): string | Promise<string>;
}

async function createSqliteClient(dbName: string, options: SqliteOptions): Promise<SqliteClientLike> {
  const {
    vfs,
    wasmUrl,
    readonly,
    fsRoot,
    idbLockPolicy,
    idbLockTimeout,
    worker,
    workerInstance,
    sharedWorkerInstance,
    sharedWorker,
    workerOwnership,
    cacheSizeKb,
    batchTimeout
  } = options;

  const loadModuleOptions: LoadModuleOptions = {
    vfs,
    wasmUrl,
    readonly,
    fsRoot,
    idbLockPolicy,
    idbLockTimeout,
    worker,
    sharedWorker,
    cacheSizeKb,
    batchTimeout
  };

  const sqliteClient = await wrapWithComlinkEndpoint<SqliteWasmClientLike>(new SqliteClient(), {
    worker,
    workerInstance,
    sharedWorker,
    sharedWorkerInstance,
    workerOwnership
  });
  try {
    await sqliteClient.init(dbName, loadModuleOptions);
    return sqliteClient;
  } catch (error) {
    releaseComlinkProxy(sqliteClient);
    throw error;
  }
}

export { createSqliteClient };
