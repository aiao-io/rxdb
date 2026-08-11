import type { EntityType, IEntity, IRxDBAdapterOptions, RepositoryBase } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

/** 任意符合 RxDB 基础实体契约的构造器。 */
type AnyEntityType = EntityType & (new (...args: never[]) => IEntity);

/** 支持的虚拟文件系统类型。 */
export type SupportVFS =
  | 'MemoryVFS'
  | 'MemoryAsyncVFS'
  | 'IDBBatchAtomicVFS'
  | 'IDBMirrorVFS'
  | 'AccessHandlePoolVFS'
  | 'OPFSAdaptiveVFS'
  | 'OPFSAnyContextVFS'
  | 'OPFSCoopSyncVFS'
  | 'OPFSWriteAheadVFS';

interface SqliteOptionsBase extends IRxDBAdapterOptions {
  vfs?: SupportVFS;
  /**
   * 加载哪个 wasm 构建：`true` = asyncify（`wa-sqlite-async.wasm`），`false` = 同步（`wa-sqlite.wasm`）。
   *
   * @remarks
   * 不指定时由所选 VFS 声明的能力决定。**同时支持两种模式的 VFS（如 `OPFSCoopSyncVFS`）
   * 适配器无从猜测**，若 `wasmPath` 指向同步产物就必须显式传 `false`——
   * asyncify glue 与非 asyncify wasm 的 import/export 不兼容，混搭会在实例化阶段失败。
   */
  async?: boolean;
  /**
   * wasm 产物的完整 URL。
   *
   * @remarks
   * 必须与 {@link SqliteOptionsBase.async} 解析出的构建匹配。文件名明确指向对面那个构建时
   * 会在加载前抛错；data URI / blob / 带哈希的自定义文件名不受命名约定限制。
   * 需要自行接管解析请改用 {@link SqliteOptionsBase.locateFile}。
   */
  wasmPath?: string;
  /** 使用 dedicated Worker；必须与 {@link SqliteOptionsBase.workerInstance} 同时提供。 */
  worker?: boolean;
  /**
   * 外部创建的 dedicated Worker。
   *
   * @remarks 适配器只使用该实例，不接管 `terminate()` 所有权。
   */
  workerInstance?: Worker;
  /** 使用 SharedWorker；必须与 {@link SqliteOptionsBase.sharedWorkerInstance} 同时提供，且不能与 worker 同时启用。 */
  sharedWorker?: boolean;
  /**
   * 外部创建的 SharedWorker。
   *
   * @remarks 适配器只使用其 port，不接管 SharedWorker 的生命周期。
   */
  sharedWorkerInstance?: SharedWorker;
  /**
   * Worker transport 的生命周期所有者。
   *
   * `caller`（默认）保留线程供后续连接复用；`client` 会在客户端代理释放或初始化失败时终止 dedicated Worker，
   * 并释放 SharedWorker 的根端口。
   */
  workerOwnership?: 'caller' | 'client';
  /** 自定义 wasm 文件定位；函数引用也是重复初始化 identity 的一部分。 */
  locateFile?: (name: string) => string;
  /** @see https://www.sqlite.org/pragma.html#pragma_cache_size @default 51200 */
  cacheSizeKb?: number;
  /** @default 16（BALANCED）@see BATCH_TIMEOUT（从包根导出） */
  batchTimeout?: number;
}

/** SQLite 仓库构造函数类型。 */
export type WaSqliteRepositoryConstructor<T extends RepositoryBase<AnyEntityType>> = new (
  adapter: RxDBAdapterSqliteBase,
  EntityType: EntityType
) => T;

/** wa-sqlite 适配器配置。 */
export interface WaSqliteOptions extends SqliteOptionsBase {
  repositories?: Record<string, WaSqliteRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
}

/** wa-sqlite 模块加载与客户端初始化所需配置。 */
export type LoadModuleOptions = Pick<
  SqliteOptionsBase,
  'vfs' | 'async' | 'worker' | 'sharedWorker' | 'wasmPath' | 'locateFile' | 'cacheSizeKb' | 'batchTimeout'
>;

/** 适配器名称。 */
export const ADAPTER_NAME = 'wa-sqlite' as const;
