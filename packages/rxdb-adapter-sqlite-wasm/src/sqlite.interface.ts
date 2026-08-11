import type { EntityType, IEntity, IRxDBAdapterOptions, RepositoryBase } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

type RepositoryEntityType = EntityType<object, IEntity>;

/**
 * 支持的 @subframe7536/sqlite-wasm 存储预设
 *
 * - `memory`: `MemoryVFS` + wa-sqlite.wasm，纯内存
 * - `idb`: `IDBBatchAtomicVFS` + wa-sqlite-async.wasm，IndexedDB 持久化
 * - `idb-memory`: `IDBMirrorVFS` + wa-sqlite-async.wasm，内存 + IndexedDB 镜像
 * - `opfs`: `OPFSCoopSyncVFS` + wa-sqlite.wasm，OPFS（必须 Worker）
 * - `fs-handle`: `OPFSAnyContextVFS` + wa-sqlite-async.wasm，FileSystemDirectoryHandle
 */
export type SupportVFS = 'memory' | 'idb' | 'idb-memory' | 'opfs' | 'fs-handle';

interface SqliteOptionsBase extends IRxDBAdapterOptions {
  /**
   * 存储预设。默认 `idb`
   */
  vfs?: SupportVFS;

  /**
   * wasm 文件 URL。不传则由 @subframe7536/sqlite-wasm 使用其内置默认路径
   */
  wasmUrl?: string;

  /**
   * 只读打开（`SQLITE_OPEN_READONLY`）
   */
  readonly?: boolean;

  /**
   * `fs-handle` 专用：根目录句柄
   */
  fsRoot?: FileSystemDirectoryHandle;

  /**
   * `idb` 专用：锁策略
   * @default 'shared+hint'
   */
  idbLockPolicy?: 'exclusive' | 'shared' | 'shared+hint';

  /**
   * `idb` 专用：锁超时（毫秒）
   * @default Infinity
   */
  idbLockTimeout?: number;

  worker?: boolean;
  workerInstance?: Worker;
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;

  /**
   * Worker transport 的生命周期所有者。
   *
   * `caller`（默认）允许同一 Worker 在断开后复用，调用方最终负责 `terminate()`；
   * `client` 会在客户端代理释放或初始化失败时终止 Worker。
   */
  workerOwnership?: 'caller' | 'client';

  /** @see https://www.sqlite.org/pragma.html#pragma_cache_size @default 51200 */
  cacheSizeKb?: number;

  /** @default 16（BALANCED）@see BATCH_TIMEOUT */
  batchTimeout?: number;
}

/**
 * SQLite 仓库构造函数类型
 */
export type SqliteRepositoryConstructor<
  T extends RepositoryBase<RepositoryEntityType> = RepositoryBase<RepositoryEntityType>
> = new (adapter: RxDBAdapterSqliteBase, EntityType: EntityType) => T;

/**
 * SQLite 适配器配置接口
 */
export interface SqliteOptions extends SqliteOptionsBase {
  repositories?: Record<string, SqliteRepositoryConstructor>;
}

/**
 * 加载模块选项类型
 */
export type LoadModuleOptions = Pick<
  SqliteOptionsBase,
  | 'vfs'
  | 'wasmUrl'
  | 'readonly'
  | 'fsRoot'
  | 'idbLockPolicy'
  | 'idbLockTimeout'
  | 'worker'
  | 'sharedWorker'
  | 'cacheSizeKb'
  | 'batchTimeout'
>;

/**
 * 适配器名称常量
 */
export const ADAPTER_NAME = 'sqlite-wasm' as const;
