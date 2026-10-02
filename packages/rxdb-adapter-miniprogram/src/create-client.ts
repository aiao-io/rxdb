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
import { resolveMiniProgramHost } from './host.js';
import { loadWaSqliteMiniProgramModule, resolveMiniProgramWasmPath } from './loader.js';
import type { WaSqliteMiniProgramAdapterOptions } from './mini-program.interface.js';
import { assertMiniProgramHostCapabilities } from './runtime-capabilities.js';
import { finalizeWaSqliteOpenStatements } from './statement-cleanup.js';
import { hardenWaSqliteSynchronousCallbacks } from './synchronous-callbacks.js';
import { attachVfsErrorCauses } from './vfs-error-cause.js';
import { createMiniProgramFileVFS, describeFileLayout } from './wechat-file-vfs.js';

function resolveClientOptions(
  dbName: string,
  options: WaSqliteMiniProgramAdapterOptions
): ResolvedWaSqliteClientOptions {
  const host = resolveMiniProgramHost(options);
  assertMiniProgramHostCapabilities(host, options);
  const cacheSizeKb = validateSqliteNumericOption('cacheSizeKb', options.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);
  return {
    batchTimeout: DEFAULT_BATCH_TIMEOUT,
    cacheSizeKb,
    identity: {
      cacheSizeKb,
      databaseRoot: options.databaseRoot,
      dbName,
      moduleFactory: options.moduleFactory,
      wasmPath: resolveMiniProgramWasmPath(options, host),
      wasmRuntime: options.wasmRuntime,
      wechat: options.wechat,
      // 宿主按平台与用户目录比较：文档示范的写法每次 init 都现构造 host，引用比较会误报冲突
      platform: host.platform,
      userDataPath: host.userDataPath,
      // 同理按值比较：布局不同的两个 init 指向不兼容的文件
      fileLayout: describeFileLayout(host.fileLayout)
    }
  };
}

const MINI_PROGRAM_RUNTIME: WaSqliteClientRuntime<WaSqliteMiniProgramAdapterOptions> = {
  clientName: 'rxdb-adapter-miniprogram',
  resolve: resolveClientOptions,
  initializationSql: cacheSizeKb => `
    PRAGMA journal_mode = DELETE;
    PRAGMA temp_store = memory;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -${cacheSizeKb};
  `,
  async load(dbName, options) {
    const host = resolveMiniProgramHost(options);
    const module = hardenWaSqliteSynchronousCallbacks(
      await loadWaSqliteMiniProgramModule(options, host)
    );
    const vfsHandle = createMiniProgramFileVFS(module, {
      databaseName: `${dbName}.sqlite`,
      root: options.databaseRoot,
      host
    });
    const sqlite3 = attachVfsErrorCauses(hardenWaSqliteSynchronousCallbacks(Factory(module)), vfsHandle);
    try {
      const result = sqlite3.vfs_register(vfsHandle.vfs, true);
      if (result !== SQLITE_OK) throw new Error(`wa-sqlite ${host.shortName} VFS 注册失败: ${result}`);
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

/** 小程序专用 wa-sqlite 客户端（宿主由 `wechat` 或 `host` 注入）。 */
export class WaSqliteMiniProgramClient extends WaSqliteClientBase<WaSqliteMiniProgramAdapterOptions> {
  constructor() {
    super(MINI_PROGRAM_RUNTIME);
  }
}

/** 创建并初始化小程序专用 wa-sqlite 客户端。 */
export async function createWaSqliteMiniProgramClient(
  dbName: string,
  options: WaSqliteMiniProgramAdapterOptions
): Promise<WaSqliteMiniProgramClient> {
  const client = new WaSqliteMiniProgramClient();
  await client.init(dbName, options);
  return client;
}
