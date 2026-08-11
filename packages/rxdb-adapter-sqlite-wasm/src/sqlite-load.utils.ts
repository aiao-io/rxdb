/**
 * @fileoverview SQLite 加载工具模块
 *
 * 基于 @subframe7536/sqlite-wasm 的存储预设加载底层 SQLite 实例，
 * 返回 `SQLiteAPI` 与 `db` 指针供 {@link SqliteClient} 直接使用。
 *
 * @module sqlite-load.utils
 */

import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { initSQLiteCore, type InitSQLiteOptions, type SQLiteDBCore } from '@subframe7536/sqlite-wasm';
import { LoadModuleOptions, SupportVFS } from './sqlite.interface.js';

interface VFSConfig {
  /** VFS 预设名称 */
  name: SupportVFS;
  /** 是否允许在普通 JS 上下文（非 Worker）中运行 */
  jsContext: boolean;
  /** 是否支持 Web Worker */
  worker: boolean;
  /** 是否支持 SharedWorker */
  sharedWorker: boolean;
  /** 是否支持多连接 */
  multipleConnections: boolean;
}

type SqliteRuntimeContext = 'main thread' | 'worker' | 'sharedWorker';

/**
 * 各 VFS 预设的运行环境能力表。
 *
 * @remarks
 * SWM-004：这张表同时是**公开导出**和 {@link checkVFSConfig} 的判定依据。
 * 早先它是可变数组，消费者把 opfs 的 `jsContext` 改成 `true` 即可绕过
 * 「OPFS 必须运行在 Worker 里」这道环境守卫，splice 掉条目则能制造 `vfs not found`。
 * 因此整表连同每个条目一律冻结：ESM 恒为严格模式，篡改会直接抛 `TypeError`。
 */
const VFS_CONFIGS: ReadonlyArray<VFSConfig> = [
  {
    name: 'memory',
    jsContext: true,
    worker: true,
    sharedWorker: true,
    multipleConnections: false
  },
  {
    name: 'idb',
    jsContext: true,
    worker: true,
    sharedWorker: true,
    multipleConnections: true
  },
  {
    name: 'idb-memory',
    jsContext: true,
    worker: true,
    sharedWorker: true,
    multipleConnections: true
  },
  {
    name: 'opfs',
    jsContext: false,
    worker: true,
    sharedWorker: false,
    multipleConnections: true
  },
  {
    name: 'fs-handle',
    jsContext: true,
    worker: true,
    sharedWorker: false,
    multipleConnections: true
  }
];

export const SQLITE_WASM_VFS_LIST: ReadonlyArray<Readonly<VFSConfig>> = Object.freeze(
  VFS_CONFIGS.map(config => Object.freeze(config))
);

const isGlobalScope = (constructorName: 'WorkerGlobalScope' | 'SharedWorkerGlobalScope'): boolean => {
  const constructor = Reflect.get(globalThis, constructorName);
  return typeof constructor === 'function' && globalThis instanceof constructor;
};

const detectRuntimeContext = (): SqliteRuntimeContext => {
  if (isGlobalScope('SharedWorkerGlobalScope')) return 'sharedWorker';
  if (isGlobalScope('WorkerGlobalScope')) return 'worker';
  return 'main thread';
};

/**
 * 验证 VFS 配置是否有效
 */
export const checkVFSConfig = (options: LoadModuleOptions) => {
  const vfs = options.vfs ?? 'idb';
  const vfsConfig = SQLITE_WASM_VFS_LIST.find(v => v.name === vfs);
  const { worker, sharedWorker } = options;
  if (!vfsConfig) throw new RxDBAdapterSqliteError(`vfs ${vfs} not found`);

  const runtime = detectRuntimeContext();
  if (worker && sharedWorker) {
    throw new RxDBAdapterSqliteError('worker and sharedWorker transports are mutually exclusive');
  }
  if (worker && runtime !== 'worker') {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} requested worker transport, but actual environment is ${runtime}`);
  }
  if (sharedWorker && runtime !== 'sharedWorker') {
    throw new RxDBAdapterSqliteError(
      `vfs ${vfs} requested sharedWorker transport, but actual environment is ${runtime}`
    );
  }

  if (runtime === 'worker') {
    if (!vfsConfig.worker) throw new RxDBAdapterSqliteError(`vfs ${vfs} not support worker`);
  } else if (runtime === 'sharedWorker') {
    if (!vfsConfig.sharedWorker) throw new RxDBAdapterSqliteError(`vfs ${vfs} not support sharedWorker`);
  } else if (!vfsConfig.jsContext) {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} only support worker; actual environment is main thread`);
  }

  return vfsConfig;
};

/**
 * 根据 VFS 预设和选项生成 @subframe7536/sqlite-wasm 的 storage 初始化 options
 */
const buildStorageOptions = async (dbName: string, options: LoadModuleOptions): Promise<InitSQLiteOptions> => {
  const vfs = options.vfs ?? 'idb';
  const fileName = `${dbName}.sqlite`;
  const base = {
    url: options.wasmUrl,
    readonly: options.readonly
  };

  // 通过单一动态 import 聚合加载所有 VFS 预设，规避 Angular 22 / esbuild
  // code-splitting 对共享基类拆分出「幽灵」chunk 的上游缺陷。详见 vfs-storage-loaders。
  const { vfsStorageLoaders } = await import('./vfs-storage-loaders.js');

  switch (vfs) {
    case 'memory': {
      return vfsStorageLoaders.useMemoryStorage(base);
    }
    case 'idb': {
      return vfsStorageLoaders.useIdbStorage(fileName, {
        ...base,
        lockPolicy: options.idbLockPolicy,
        lockTimeout: options.idbLockTimeout
      });
    }
    case 'idb-memory': {
      return vfsStorageLoaders.useIdbMemoryStorage(fileName, base);
    }
    case 'opfs': {
      return vfsStorageLoaders.useOpfsStorage(fileName, base);
    }
    case 'fs-handle': {
      if (!options.fsRoot) {
        throw new RxDBAdapterSqliteError(`vfs ${vfs} requires options.fsRoot`);
      }
      return vfsStorageLoaders.useFsHandleStorage(fileName, options.fsRoot, base);
    }
    default: {
      const _exhaustive: never = vfs;
      throw new RxDBAdapterSqliteError(`unsupported vfs: ${String(_exhaustive)}`);
    }
  }
};

/**
 * 加载并初始化 @subframe7536/sqlite-wasm
 *
 * @returns 返回 `SQLiteDBCore`，包含 `sqlite`、`pointer`（db）、`vfs` 等字段
 */
export const sqliteLoad = async (dbName: string, options: LoadModuleOptions): Promise<SQLiteDBCore> => {
  checkVFSConfig(options);
  const storage = await buildStorageOptions(dbName, options);
  return initSQLiteCore(storage);
};
