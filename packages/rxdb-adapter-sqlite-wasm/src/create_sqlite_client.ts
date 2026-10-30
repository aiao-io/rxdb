import {
  releaseComlinkProxy,
  type SqliteBlankDatabase,
  type SqliteClientLike,
  wrapWithComlinkEndpoint
} from '@aiao/rxdb-adapter-sqlite-core';
import { LoadModuleOptions, SqliteOptions } from './sqlite.interface.js';
import { SqliteClient } from './SqliteClient.js';
import { resolveSqliteWasmTransport } from './transport.js';

/**
 * 创建 SQLite 客户端
 *
 * VFS 配置的校验在 `sqliteLoad` 内部完成，避免重复检查。
 * `worker: true` / `sharedWorker: true` 缺少对应实例时 fail-fast；只传实例则直接推断 transport，
 * 避免静默回退主线程造成线程隔离 / OPFS 运行环境的假象。
 */
interface SqliteWasmClientLike extends SqliteClientLike {
  init(dbName: string, options: LoadModuleOptions, owner?: string): Promise<void>;
  release(owner: string): Promise<void>;
  rollbackOrphanTransaction(): Promise<boolean>;
  /**
   * 本包的 {@link SqliteClient} 必然实现下面这几个方法，因此在这里收窄成必选。
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
  setChangeEventsMuted(muted: boolean): void | Promise<void>;
  describeBlankDatabase(): Promise<SqliteBlankDatabase>;
}

/**
 * 创建并初始化 sqlite-wasm 客户端。
 *
 * @param dbName - 库名
 * @param options - 适配器配置
 * @param owner - 持有者键：SharedWorker 上共用一个客户端时，断开凭它只交还自己那一份（`release`）
 * @returns 主线程客户端或 Worker / SharedWorker 上那个客户端的远端代理
 */
async function createSqliteClient(dbName: string, options: SqliteOptions, owner?: string): Promise<SqliteClientLike> {
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

  // 远端按加载选项核对自己真的跑在对应的 Worker 里，交过去的必须是推断后的 transport，与适配器的锁判据同一份
  const transport = resolveSqliteWasmTransport(options);
  const loadModuleOptions: LoadModuleOptions = {
    vfs,
    wasmUrl,
    readonly,
    fsRoot,
    idbLockPolicy,
    idbLockTimeout,
    worker: transport.worker,
    sharedWorker: transport.sharedWorker,
    cacheSizeKb,
    batchTimeout
  };

  // 组合是否合法按调用方原样给的选项判（validateComlinkTransportOptions），不拿推断结果去校验
  const sqliteClient = await wrapWithComlinkEndpoint<SqliteWasmClientLike>(new SqliteClient(), {
    worker,
    workerInstance,
    sharedWorker,
    sharedWorkerInstance,
    workerOwnership
  });
  try {
    await sqliteClient.init(dbName, loadModuleOptions, owner);
    return sqliteClient;
  } catch (error) {
    releaseComlinkProxy(sqliteClient);
    throw error;
  }
}

export { createSqliteClient };
