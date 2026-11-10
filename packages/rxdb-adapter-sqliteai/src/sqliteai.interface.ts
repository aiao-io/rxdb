import type { EntityType, IEntity, IRxDBAdapterOptions, RepositoryBase } from '@aiao/rxdb';
import type { OpfsFallback, RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

/**
 * SqliteAI 适配器的可配置项（不含自定义 repository 注册）。
 *
 * - `opfs` / `opfsProxyPath` / `opfsFallback`：OPFS 持久化相关
 * - `wasmPath` / `locateFile`：WASM 资源定位
 * - `worker` / `sharedWorker` + `*Instance`：跨线程运行
 * - `cacheSizeKb` / `batchTimeout`：性能调优
 */
interface SqliteaiOptionsBase extends IRxDBAdapterOptions {
  opfs?: boolean;
  wasmPath?: string;
  opfsProxyPath?: string;
  /**
   * 自定义 Emscripten 资源定位函数；不能传给 worker。
   *
   * @remarks
   * 函数身份参与模块缓存判定：`sqliteaiLoad` 的模块级 WASM 缓存按引用比较 `locateFile`，
   * 传同一个引用才复用已加载的模块。请传模块级的稳定引用；每次新建内联闭包（哪怕源码相同）
   * 都会被当成另一份配置，重新初始化一遍 WASM。
   */
  locateFile?: (name: string) => string;
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
  /** @see https://www.sqlite.org/pragma.html#pragma_cache_size @default 51200 */
  cacheSizeKb?: number;
  /** @default 16（BALANCED）@see BATCH_TIMEOUT */
  batchTimeout?: number;
  /** OPFS 数据库打开失败时的行为。@default 'throw' @see Oo1ClientBase */
  opfsFallback?: OpfsFallback;
  worker?: boolean;
  workerInstance?: Worker;
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;
}

/** 任意实体构造器。 */
type AnyEntityType = EntityType & (new (...args: never[]) => IEntity);

/** 自定义 Repository 类的构造器签名（用户可覆盖默认 Repository / TreeRepository）。 */
export type SqliteaiRepositoryConstructor<T extends RepositoryBase<AnyEntityType>> = new (
  adapter: RxDBAdapterSqliteBase,
  EntityType: EntityType
) => T;

/** SqliteAI 适配器完整选项（含可选的自定义 Repository 注册表）。 */
export interface SqliteaiOptions extends SqliteaiOptionsBase {
  repositories?: Record<string, SqliteaiRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
}

/** `sqliteaiLoad` 接受的运行期选项子集（剥离 worker / repository 配置）。 */
export type SqliteaiLoadOptions = Pick<
  SqliteaiOptionsBase,
  | 'opfs'
  | 'wasmPath'
  | 'opfsProxyPath'
  | 'locateFile'
  | 'print'
  | 'printErr'
  | 'cacheSizeKb'
  | 'batchTimeout'
  | 'opfsFallback'
>;

/** 在 RxDB 中注册此适配器使用的名称。 */
export const ADAPTER_NAME = 'sqliteai' as const;
