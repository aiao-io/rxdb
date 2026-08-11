import {
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  validateSqliteNumericOption
} from '@aiao/rxdb-adapter-sqlite-core';
import {
  WaSqliteClientBase,
  type ResolvedWaSqliteClientOptions,
  type WaSqliteClientRuntime
} from '@aiao/rxdb-adapter-wa-sqlite/client';
import { Factory, SQLITE_OK } from 'wa-sqlite';
import { loadWaSqliteMiniProgramModule } from './loader.js';
import type { WaSqliteMiniProgramOptions } from './mini-program.interface.js';
import { DEFAULT_WASM_PATH } from './mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities } from './runtime-capabilities.js';
import { finalizeWaSqliteOpenStatements } from './statement-cleanup.js';
import { hardenWaSqliteSynchronousCallbacks } from './synchronous-callbacks.js';
import { createWechatFileVFS } from './wechat-file-vfs.js';

function resolveClientOptions(dbName: string, options: WaSqliteMiniProgramOptions): ResolvedWaSqliteClientOptions {
  assertMiniProgramRuntimeCapabilities(options);
  const cacheSizeKb = validateSqliteNumericOption('cacheSizeKb', options.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);
  return {
    batchTimeout: DEFAULT_BATCH_TIMEOUT,
    cacheSizeKb,
    identity: {
      cacheSizeKb,
      databaseRoot: options.databaseRoot,
      dbName,
      moduleFactory: options.moduleFactory,
      wasmPath: options.wasmPath ?? DEFAULT_WASM_PATH,
      wasmRuntime: options.wasmRuntime,
      wechat: options.wechat
    }
  };
}

const MINI_PROGRAM_RUNTIME: WaSqliteClientRuntime<WaSqliteMiniProgramOptions> = {
  clientName: 'rxdb-adapter-miniprogram',
  resolve: resolveClientOptions,
  initializationSql: cacheSizeKb => `
    PRAGMA journal_mode = DELETE;
    PRAGMA temp_store = memory;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -${cacheSizeKb};
  `,
  async load(dbName, options) {
    const module = hardenWaSqliteSynchronousCallbacks(await loadWaSqliteMiniProgramModule(options));
    const sqlite3 = hardenWaSqliteSynchronousCallbacks(Factory(module));
    const vfsHandle = createWechatFileVFS(module, {
      databaseName: `${dbName}.sqlite`,
      root: options.databaseRoot,
      wechat: options.wechat
    });
    try {
      const result = sqlite3.vfs_register(vfsHandle.vfs, true);
      if (result !== SQLITE_OK) throw new Error(`wa-sqlite 微信 VFS 注册失败: ${result}`);
    } catch (error) {
      try {
        await vfsHandle.vfs.close();
      } catch (cleanupError) {
        console.error('[rxdb-adapter-miniprogram] VFS 注册失败后的清理步骤出错：', cleanupError);
      }
      throw error;
    }
    return {
      sqlite3,
      vfs: vfsHandle.vfs,
      finalizeOpenStatements: database => finalizeWaSqliteOpenStatements(module, sqlite3, database)
    };
  }
};

/** 微信小程序专用 wa-sqlite 客户端。 */
export class WaSqliteMiniProgramClient extends WaSqliteClientBase<WaSqliteMiniProgramOptions> {
  constructor() {
    super(MINI_PROGRAM_RUNTIME);
  }
}

/** 创建并初始化微信小程序专用 wa-sqlite 客户端。 */
export async function createWaSqliteMiniProgramClient(
  dbName: string,
  options: WaSqliteMiniProgramOptions
): Promise<WaSqliteMiniProgramClient> {
  const client = new WaSqliteMiniProgramClient();
  await client.init(dbName, options);
  return client;
}
