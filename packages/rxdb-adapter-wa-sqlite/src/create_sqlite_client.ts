import {
  assertLoadOptionsTransferable,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  releaseComlinkProxy,
  RxDBAdapterSqliteError,
  type SqliteClientLike,
  validateSqliteNumericOption,
  wrapWithComlinkEndpoint
} from '@aiao/rxdb-adapter-sqlite-core';
import { checkVFSConfig } from './sqlite-load.utils.js';
import type { LoadModuleOptions, WaSqliteOptions } from './sqlite.interface.js';
import { assertWaSqliteDatabaseName, WaSqliteClient } from './SqliteClient.js';

interface WaSqliteClientLike extends SqliteClientLike {
  init(dbName: string, options: LoadModuleOptions): Promise<void>;
  beginTransactionSql(): string | Promise<string>;
  beginSystemMigrationTransactionSql(): string | Promise<string>;
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

/** 创建并初始化 wa-sqlite 客户端。 */
async function createSqliteClient(dbName: string, options: WaSqliteOptions): Promise<SqliteClientLike> {
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
    await sqliteClient.init(dbName, loadModuleOptions);
    return sqliteClient;
  } catch (error) {
    releaseComlinkProxy(sqliteClient);
    throw error;
  }
}

export { createSqliteClient };
