import {
  assertLoadOptionsTransferable,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  releaseComlinkProxy,
  RxDBAdapterSqliteError,
  type SqliteBlankDatabase,
  type SqliteClientLike,
  validateSqliteNumericOption,
  wrapWithComlinkEndpoint
} from '@aiao/rxdb-adapter-sqlite-core';
import { checkVFSConfig } from './sqlite-load.utils.js';
import type { LoadModuleOptions, WaSqliteOptions } from './sqlite.interface.js';
import { assertWaSqliteDatabaseName, WaSqliteClient } from './SqliteClient.js';

/** 本包客户端必然实现的方法收窄成必选，否则 Comlink 的 `Remote<T>` 会把可选方法映射坏。 */
interface WaSqliteClientLike extends SqliteClientLike {
  init(dbName: string, options: LoadModuleOptions, owner?: string): Promise<void>;
  beginTransactionSql(): string | Promise<string>;
  beginSystemMigrationTransactionSql(): string | Promise<string>;
  setChangeEventsMuted(muted: boolean): void | Promise<void>;
  describeBlankDatabase(): Promise<SqliteBlankDatabase>;
  release(owner: string): Promise<void>;
  rollbackOrphanTransaction(): Promise<boolean>;
}

function validateTransport(options: WaSqliteOptions): void {
  const hasWorker = options.worker === true;
  const hasWorkerInstance = options.workerInstance !== undefined;
  if (hasWorker !== hasWorkerInstance) {
    throw new RxDBAdapterSqliteError('`worker` and `workerInstance` must be provided together');
  }

  const hasSharedWorker = options.sharedWorker === true;
  const hasSharedWorkerInstance = options.sharedWorkerInstance !== undefined;
  if (hasSharedWorker !== hasSharedWorkerInstance) {
    throw new RxDBAdapterSqliteError('`sharedWorker` and `sharedWorkerInstance` must be provided together');
  }

  if (hasWorker && hasSharedWorker) {
    throw new RxDBAdapterSqliteError('Worker and SharedWorker transports are mutually exclusive');
  }
}

/**
 * 创建并初始化 wa-sqlite 客户端。
 *
 * @param dbName - 库名
 * @param options - 适配器配置
 * @param owner - 持有者键：SharedWorker 上共用一个客户端时，断开凭它只交还自己那一份（`release`）
 * @returns 主线程客户端或 Worker / SharedWorker 上那个客户端的远端代理
 */
async function createSqliteClient(dbName: string, options: WaSqliteOptions, owner?: string): Promise<SqliteClientLike> {
  assertWaSqliteDatabaseName(dbName);
  validateTransport(options);
  validateSqliteNumericOption('cacheSizeKb', options.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);
  validateSqliteNumericOption('batchTimeout', options.batchTimeout, DEFAULT_BATCH_TIMEOUT, { allowZero: true });

  const loadModuleOptions: LoadModuleOptions = {
    vfs: options.vfs,
    async: options.async,
    worker: options.worker,
    sharedWorker: options.sharedWorker,
    wasmPath: options.wasmPath,
    locateFile: options.locateFile,
    cacheSizeKb: options.cacheSizeKb,
    batchTimeout: options.batchTimeout
  };
  checkVFSConfig(loadModuleOptions);
  assertLoadOptionsTransferable(loadModuleOptions, options);

  const sqliteClient = await wrapWithComlinkEndpoint<WaSqliteClientLike>(new WaSqliteClient(), {
    worker: options.worker,
    workerInstance: options.workerInstance,
    sharedWorker: options.sharedWorker,
    sharedWorkerInstance: options.sharedWorkerInstance,
    workerOwnership: options.workerOwnership
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
