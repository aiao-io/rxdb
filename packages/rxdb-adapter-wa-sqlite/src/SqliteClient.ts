import {
  BATCH_TIMEOUT,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  RxDBAdapterSqliteError,
  validateSqliteNumericOption
} from '@aiao/rxdb-adapter-sqlite-core';
import { checkVFSConfig, waSqliteLoad } from './sqlite-load.utils.js';
import type { LoadModuleOptions } from './sqlite.interface.js';
import {
  WaSqliteClientBase,
  type ResolvedWaSqliteClientOptions,
  type WaSqliteClientRuntime
} from './WaSqliteClientBase.js';

export type {
  LoadedWaSqliteClientRuntime,
  ResolvedWaSqliteClientOptions,
  WaSqliteClientEvents,
  WaSqliteClientRuntime
} from './WaSqliteClientBase.js';
export { BATCH_TIMEOUT };

/** wa-sqlite 浏览器 VFS 接受的数据库名最大 UTF-8 字节数。 */
export const WA_SQLITE_MAX_DATABASE_NAME_BYTES = 49;

/** 在加载浏览器 VFS 前校验数据库名。 */
export const assertWaSqliteDatabaseName = (dbName: string): void => {
  const byteLength = new TextEncoder().encode(dbName).byteLength;
  if (byteLength <= WA_SQLITE_MAX_DATABASE_NAME_BYTES) return;
  throw new RxDBAdapterSqliteError(
    `wa-sqlite database name exceeds the VFS path limit: actual=${byteLength} bytes, ` +
      `maximum=${WA_SQLITE_MAX_DATABASE_NAME_BYTES} bytes, dbName=${JSON.stringify(dbName)}. ` +
      'The built-in VFS reserves 8 bytes for -journal and the adapter appends .sqlite.'
  );
};

function resolveBrowserOptions(dbName: string, options: LoadModuleOptions): ResolvedWaSqliteClientOptions {
  assertWaSqliteDatabaseName(dbName);
  const vfs = checkVFSConfig(options);
  const batchTimeout = validateSqliteNumericOption('batchTimeout', options.batchTimeout, DEFAULT_BATCH_TIMEOUT, {
    allowZero: true
  });
  const cacheSizeKb = validateSqliteNumericOption('cacheSizeKb', options.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);
  return {
    batchTimeout,
    cacheSizeKb,
    identity: {
      async: vfs.useAsync,
      batchTimeout,
      cacheSizeKb,
      dbName,
      locateFile: options.locateFile,
      sharedWorker: options.sharedWorker === true,
      vfs: vfs.name,
      wasmPath: options.wasmPath,
      worker: options.worker === true
    }
  };
}

const BROWSER_RUNTIME: WaSqliteClientRuntime<LoadModuleOptions> = {
  clientName: 'rxdb-adapter-wa-sqlite',
  load: (_dbName, options) => waSqliteLoad(options),
  resolve: resolveBrowserOptions
};

/** 浏览器 wa-sqlite 客户端。 */
export class WaSqliteClient extends WaSqliteClientBase<LoadModuleOptions> {
  constructor() {
    super(BROWSER_RUNTIME);
  }
}
