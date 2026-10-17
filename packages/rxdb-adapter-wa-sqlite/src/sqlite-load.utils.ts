import {
  isOpfsAccessHandleBusy,
  openOpfsWithRetry,
  releaseOpfsCoopSyncHandles,
  RxDBAdapterSqliteError
} from '@aiao/rxdb-adapter-sqlite-core';
import { Factory } from 'wa-sqlite';
import { type LoadModuleOptions, type SupportVFS } from './sqlite.interface.js';
import { VFS_MODULES } from './vfs-modules.js';
import type { SQLiteAPI, SQLiteVFS } from './wa-sqlite.interface.js';

interface ModuleFactoryConfig {
  locateFile?: (name: string) => string;
}

type WebSQLiteModuleFactory = (config?: ModuleFactoryConfig) => Promise<unknown>;

/** 上游 example VFS 模块暴露的最小工厂结构。 */
export interface WaSqliteVfsFactory {
  create(name: string, module: unknown, options?: unknown): Promise<SQLiteVFS> | SQLiteVFS;
}

/** wa-sqlite VFS 的只读能力与加载配置。 */
export interface WaSqliteVfsConfig {
  /** VFS 预设名称。 */
  readonly name: SupportVFS;
  /** 加载上游 VFS 工厂。 */
  readonly vfsModule: () => Promise<WaSqliteVfsFactory>;
  /** 传给 VFS 工厂的固定选项。 */
  readonly vfsOptions?: Readonly<{ lockPolicy?: string; lockTimeout?: number }>;
  /** 是否支持同步 wasm 构建。 */
  readonly sync: boolean;
  /** 是否支持 asyncify wasm 构建。 */
  readonly async: boolean;
  /** 是否支持 dedicated Worker。 */
  readonly worker: boolean;
  /** 是否支持 SharedWorker。 */
  readonly sharedWorker: boolean;
  /** 是否支持 Window 等普通 JavaScript 上下文。 */
  readonly jsContext: boolean;
  /** 是否支持多个连接共享同一存储。 */
  readonly multipleConnections: boolean;
}

function freezeVfsConfig(config: WaSqliteVfsConfig): WaSqliteVfsConfig {
  return Object.freeze({
    ...config,
    ...(config.vfsOptions ? { vfsOptions: Object.freeze({ ...config.vfsOptions }) } : {})
  });
}

/**
 * `shared+hint` 锁策略下 VFS 等待 Web Lock 的超时时间。
 *
 * @remarks
 * wa-sqlite `WebLocksMixin` 默认 `lockTimeout: Infinity`——锁竞争下会无限期挂起而非
 * 返回 `SQLITE_BUSY`，导致 {@link stepWithBusyRetry} 式的有限重试永远等不到重试机会。
 * 设为有限值后，超时会转为 `SQLITE_BUSY`，交由调用方的重试/失败逻辑处理。
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 5000;

const asyncWebSQLiteModuleFactory = async (): Promise<WebSQLiteModuleFactory> => {
  const module = await import('wa-sqlite/dist/wa-sqlite-async.mjs');
  return module.default as WebSQLiteModuleFactory;
};

const syncWebSQLiteModuleFactory = async (): Promise<WebSQLiteModuleFactory> => {
  const module = await import('wa-sqlite/dist/wa-sqlite.mjs');
  return module.default as WebSQLiteModuleFactory;
};

/** 未指定 VFS 时使用的持久化生产默认值。 */
export const DEFAULT_VFS: SupportVFS = 'IDBBatchAtomicVFS';

/**
 * 给 `OPFSCoopSyncVFS` 补上 `close()`：交出它登记着的库文件同步访问句柄。
 *
 * @remarks
 * 上游没有实现 `close()`，打开失败时留下的句柄要等垃圾回收才放开；同一个 Worker 里的退避重试（US-221）会撞上自己留下的句柄。
 * 打开失败与断开时客户端都会关 VFS，见 `releaseOpfsCoopSyncHandles`。
 */
const closingAccessHandles = (factory: WaSqliteVfsFactory): WaSqliteVfsFactory => ({
  create: async (name, module, options) => {
    const vfs = await factory.create(name, module, options);
    vfs.close = () => releaseOpfsCoopSyncHandles(vfs);
    return vfs;
  }
});

const VFS_CONFIGS = [
  {
    name: 'MemoryVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.MemoryVFS();
      return module.MemoryVFS;
    },
    sync: true,
    async: true,
    worker: true,
    sharedWorker: true,
    jsContext: true,
    multipleConnections: false
  },
  {
    name: 'MemoryAsyncVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.MemoryAsyncVFS();
      return module.MemoryAsyncVFS;
    },
    sync: false,
    async: true,
    worker: true,
    sharedWorker: true,
    jsContext: true,
    multipleConnections: false
  },
  {
    name: 'IDBBatchAtomicVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.IDBBatchAtomicVFS();
      return module.IDBBatchAtomicVFS;
    },
    vfsOptions: { lockPolicy: 'shared+hint', lockTimeout: DEFAULT_LOCK_TIMEOUT_MS },
    sync: false,
    async: true,
    worker: true,
    sharedWorker: true,
    jsContext: true,
    multipleConnections: true
  },
  {
    name: 'IDBMirrorVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.IDBMirrorVFS();
      return module.IDBMirrorVFS;
    },
    sync: false,
    async: true,
    worker: true,
    sharedWorker: true,
    jsContext: true,
    multipleConnections: true
  },
  {
    name: 'AccessHandlePoolVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.AccessHandlePoolVFS();
      return module.AccessHandlePoolVFS;
    },
    sync: true,
    async: true,
    worker: true,
    sharedWorker: false,
    jsContext: false,
    multipleConnections: false
  },
  {
    name: 'OPFSAdaptiveVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.OPFSAdaptiveVFS();
      return module.OPFSAdaptiveVFS;
    },
    vfsOptions: { lockPolicy: 'shared+hint', lockTimeout: DEFAULT_LOCK_TIMEOUT_MS },
    sync: false,
    async: true,
    worker: true,
    sharedWorker: false,
    jsContext: false,
    multipleConnections: true
  },
  {
    name: 'OPFSAnyContextVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.OPFSAnyContextVFS();
      return module.OPFSAnyContextVFS;
    },
    vfsOptions: { lockPolicy: 'shared+hint', lockTimeout: DEFAULT_LOCK_TIMEOUT_MS },
    sync: false,
    async: true,
    worker: true,
    sharedWorker: true,
    jsContext: true,
    multipleConnections: true
  },
  {
    name: 'OPFSCoopSyncVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.OPFSCoopSyncVFS();
      return closingAccessHandles(module.OPFSCoopSyncVFS);
    },
    sync: true,
    async: true,
    worker: true,
    sharedWorker: false,
    jsContext: false,
    multipleConnections: true
  },
  {
    name: 'OPFSWriteAheadVFS',
    vfsModule: async () => {
      const module = await VFS_MODULES.OPFSWriteAheadVFS();
      return module.OPFSWriteAheadVFS;
    },
    sync: true,
    async: false,
    worker: true,
    sharedWorker: false,
    jsContext: false,
    multipleConnections: true
  }
] satisfies readonly WaSqliteVfsConfig[];

/** wa-sqlite 支持的 VFS 及运行环境能力；数组、条目与嵌套选项均不可变。 */
export const WA_SQLITE_VFS_LIST: readonly WaSqliteVfsConfig[] = Object.freeze(VFS_CONFIGS.map(freezeVfsConfig));

/** {@link checkVFSConfig} 的返回值：VFS 条目 + **解析后**的加载模式。 */
export type ResolvedVFSConfig = WaSqliteVfsConfig & {
  /**
   * 最终决定加载哪个 wasm 构建：`true` = asyncify 构建，`false` = 同步构建。
   *
   * @remarks
   * 显式 `options.async` 优先；未指定时由 VFS 自身声明的能力决定，**不再硬编码 async**。
   * 同时支持 sync 与 async 的 VFS（如 `OPFSCoopSyncVFS`）适配器无从猜测，
   * 调用方应显式指定，否则按 VFS 的 `async` 声明取默认。
   */
  useAsync: boolean;
};

/**
 * 验证并解析 VFS 配置。
 *
 * @remarks
 * 返回值里的 `useAsync` 是**唯一真值**：`waSqliteLoad` 只消费它来选择 wasm 构建。
 * 此前校验读的是显式 `options.async`、加载读的是另一套默认（硬编码 async），
 * 两者不是同一个值——声明「不支持 async」的 VFS 在不传 `async` 时能顺利过校验，
 * 随后被塞进它自己声明为不支持的 async 构建里。
 */
export const checkVFSConfig = (options: LoadModuleOptions): ResolvedVFSConfig => {
  const vfs = options.vfs ?? DEFAULT_VFS;
  const vfsConfig = WA_SQLITE_VFS_LIST.find(candidate => candidate.name === vfs);
  if (!vfsConfig) throw new RxDBAdapterSqliteError(`vfs ${vfs} not found`);

  // 先解析出实际会被使用的模式，再拿它去校验——校验对象必须与被校验对象一致
  const useAsync = options.async ?? vfsConfig.async;
  if (useAsync && !vfsConfig.async) {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} not support async: true`);
  }
  if (!useAsync && !vfsConfig.sync) {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} not support async: false`);
  }
  if (options.worker && !vfsConfig.worker) {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} not support worker`);
  }
  if (options.sharedWorker && !vfsConfig.sharedWorker) {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} not support sharedWorker`);
  }
  if (!options.worker && !options.sharedWorker && !vfsConfig.jsContext) {
    throw new RxDBAdapterSqliteError(`vfs ${vfs} only support worker`);
  }

  return { ...vfsConfig, useAsync };
};

/** 各加载模式对应的 wasm 产物文件名。 */
const WASM_FILE_NAME = { async: 'wa-sqlite-async.wasm', sync: 'wa-sqlite.wasm' } as const;

/**
 * 组装 Emscripten module factory 配置。
 *
 * @throws {RxDBAdapterSqliteError} `wasmPath` 的文件名与解析出的加载模式不匹配时
 *
 * @remarks
 * asyncify glue 与非 asyncify wasm 的 import/export 不兼容，两者混搭在实例化阶段就会失败，
 * 而报错信息出自 Emscripten 内部、极难归因。这里在加载前先比对文件名并给出可操作的错误。
 * 传 `locateFile` 表示调用方自行接管解析，不做校验。
 */
function getModuleFactoryConfig(options: LoadModuleOptions, useAsync: boolean): ModuleFactoryConfig {
  if (options.locateFile) return { locateFile: options.locateFile };

  const wasmPath = options.wasmPath;
  if (!wasmPath) return {};

  // 只拦「明确指向对面那个构建」的已知不匹配：data URI、blob、带哈希的自定义文件名
  // 都是合法用法，不能强求命名约定。
  const expected = useAsync ? WASM_FILE_NAME.async : WASM_FILE_NAME.sync;
  const mismatched = useAsync ? WASM_FILE_NAME.sync : WASM_FILE_NAME.async;
  const actual = wasmPath.split(/[?#]/)[0].split('/').pop();
  if (actual === mismatched) {
    throw new RxDBAdapterSqliteError(
      `wasmPath "${wasmPath}" is the ${useAsync ? 'sync' : 'asyncify'} build but the resolved mode needs "${expected}" (async: ${useAsync}). ` +
        `asyncify glue and non-asyncify wasm are not interchangeable. ` +
        `Pass \`async: ${useAsync ? 'false' : 'true'}\` explicitly, point wasmPath at "${expected}", or supply \`locateFile\` to resolve it yourself.`
    );
  }
  return { locateFile: () => wasmPath };
}

/** {@link waSqliteLoad} 的返回值：已初始化的 SQLite API 及其注册的 VFS。 */
export interface LoadedSqlite {
  sqlite3: SQLiteAPI;
  /** 已通过 `sqlite3.vfs_register` 注册的 VFS 实例；调用方负责在 disconnect 时 `close()` 以释放 IndexedDB/OPFS 句柄。 */
  vfs: SQLiteVFS;
  /** VFS 的锁策略（如 `shared+hint`），供客户端决定是否需要在 BEGIN 前发送 `PRAGMA write_hint;`。 */
  lockPolicy?: string;
}

/**
 * 打开撞上 `SQLITE_CANTOPEN` 时，要不要当作「库文件的同步访问句柄还被别的上下文占着」退避重试（US-221）。
 *
 * @remarks
 * 整页刷新时上一个页面的 Worker 正在销毁，先放 Web Lock、后关同步访问句柄，新页面拿到锁去开句柄就撞上占用。
 * 逐个读过上游 VFS 源码，只有 `OPFSCoopSyncVFS` 以这个形状失败、又能在同一上下文里安全重开。键是全部 VFS：新增 VFS 时这里必须表态。
 */
const RETRY_OPEN_ON_BUSY_ACCESS_HANDLE: Readonly<Record<SupportVFS, boolean>> = {
  // 与 sqlite-wasm 的 opfs 档同一个 VFS：先拿锁、再开独占句柄，开不了就把错误打到控制台吞掉，open_v2 只剩 SQLITE_CANTOPEN
  OPFSCoopSyncVFS: true,
  // Chromium 上开的是 readwrite-unsafe 句柄，与上一个页面留下的同类句柄共存、撞不上；不支持该模式的浏览器上，
  // jOpen 失败时不放它拿的打开锁，同一上下文里再开会一直等那把锁——重试会把报错变成挂死
  OPFSAdaptiveVFS: false,
  // 只用 readwrite-unsafe 句柄（上游写明只有 Chromium 支持），与上一个页面留下的句柄共存
  OPFSWriteAheadVFS: false,
  // 不开同步访问句柄：读走 getFile()、写走 createWritable()，打开只取文件句柄
  OPFSAnyContextVFS: false,
  // 建 VFS 时就整池开句柄，撞上占用抛的是 NoModificationAllowedError 而不是 SQLITE_CANTOPEN；池里是随机文件名，
  // 没有 <库名>.sqlite 可探测；部分失败时已开的句柄不关，同一上下文里重试会撞上自己留下的句柄
  AccessHandlePoolVFS: false,
  // 不落 OPFS
  MemoryVFS: false,
  MemoryAsyncVFS: false,
  IDBBatchAtomicVFS: false,
  IDBMirrorVFS: false
};

/**
 * 打开一个库：`OPFSCoopSyncVFS` 撞上「库文件的同步访问句柄还被占着」时按退避重试，其余 VFS 只打开一次。
 *
 * @param attempt - 一次完整的打开（新建模块与 VFS → `open_v2` → 初始化 SQL）
 * @param dbName - 库名
 * @param options - 加载配置
 * @returns `attempt` 的结果
 * @throws {@link RxDBAdapterSqliteError} 重试用尽、库文件仍被别的上下文占着时；原错误挂在 `cause` 上
 */
export const openWaSqliteDatabase = <T>(
  attempt: () => Promise<T>,
  dbName: string,
  options: LoadModuleOptions
): Promise<T> => {
  if (!RETRY_OPEN_ON_BUSY_ACCESS_HANDLE[checkVFSConfig(options).name]) return attempt();
  // 与 open_v2 打开的是同一个名字，VFS 把它当 URL 路径落在 OPFS 根目录。库名带需转义的字符时落盘名不同，
  // 探针找不到文件就当没被占用，原样抛出最后一次的错误
  const fileName = `${dbName}.sqlite`;
  return openOpfsWithRetry(attempt, { fileName, isAccessHandleBusy: () => isOpfsAccessHandleBusy(fileName) });
};

/** 加载 wa-sqlite 模块并注册选定 VFS。 */
export const waSqliteLoad = async (options: LoadModuleOptions): Promise<LoadedSqlite> => {
  const vfsConfig = checkVFSConfig(options);
  // 只消费 checkVFSConfig 解析出的 useAsync，不再自行推断默认值
  const moduleFactoryLoader = vfsConfig.useAsync ? asyncWebSQLiteModuleFactory : syncWebSQLiteModuleFactory;
  const [moduleFactory, vfsFactory] = await Promise.all([moduleFactoryLoader(), vfsConfig.vfsModule()]);
  const module = await moduleFactory(getModuleFactoryConfig(options, vfsConfig.useAsync));
  const sqlite3 = Factory(module);
  const vfs = await vfsFactory.create(vfsConfig.name, module, vfsConfig.vfsOptions);
  sqlite3.vfs_register(vfs, true);
  return { sqlite3, vfs, lockPolicy: vfsConfig.vfsOptions?.lockPolicy };
};
