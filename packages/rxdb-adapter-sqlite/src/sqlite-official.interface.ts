import type { EntityType, IEntity, IRxDBAdapterOptions, RepositoryBase } from '@aiao/rxdb';
import type { OpfsFallback, RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

/** 任意实体构造器：`never[]` 参数使所有构造器都可赋值，避免 `any`。 */
type AnyEntityType = EntityType & (new (...args: never[]) => IEntity);

/** 官方 sqlite-wasm 适配器不含 repository 注册表的基础选项。 */
interface SqliteOfficialOptionsBase extends IRxDBAdapterOptions {
  /** 是否使用 OPFS 持久化数据库。 */
  opfs?: boolean;
  /** sqlite WASM 文件的显式 URL。 */
  wasmPath?: string;
  /** OPFS proxy worker 文件的显式 URL。 */
  opfsProxyPath?: string;
  /** 自定义 Emscripten 资源定位函数；不能传给 worker。 */
  locateFile?: (name: string) => string;
  /** sqlite 标准输出处理函数；不能传给 worker。 */
  print?: (msg: string) => void;
  /** sqlite 标准错误处理函数；不能传给 worker。 */
  printErr?: (msg: string) => void;
  /** @see https://www.sqlite.org/pragma.html#pragma_cache_size @default 51200 */
  cacheSizeKb?: number;
  /** @default 16（BALANCED）@see BATCH_TIMEOUT */
  batchTimeout?: number;
  /** OPFS 数据库打开失败时的行为。@default 'throw' @see Oo1ClientBase */
  opfsFallback?: OpfsFallback;
  /** 是否在专用 worker 中运行客户端。 */
  worker?: boolean;
  /** 由调用方创建并持有的专用 worker；适配器断开时不会代替调用方终止它。 */
  workerInstance?: Worker;
  /** 是否在 shared worker 中运行客户端。 */
  sharedWorker?: boolean;
  /** 由调用方创建并持有的 shared worker。 */
  sharedWorkerInstance?: SharedWorker;
}

/** 自定义 Repository 类的构造器签名。 */
export type SqliteRepositoryConstructor<T extends RepositoryBase<AnyEntityType>> = new (
  adapter: RxDBAdapterSqliteBase,
  EntityType: EntityType
) => T;

/** 官方 sqlite-wasm 适配器的完整选项。 */
export interface SqliteOptions extends SqliteOfficialOptionsBase {
  /** 按实体名覆盖默认 Repository / TreeRepository 的构造器。 */
  repositories?: Record<string, SqliteRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
}

/** `sqliteLoad` 接受的运行时选项，不包含 worker 与 repository 配置。 */
export type SqliteLoadOptions = Pick<
  SqliteOfficialOptionsBase,
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

export const ADAPTER_NAME = 'sqlite' as const;
