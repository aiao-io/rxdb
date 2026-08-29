import type { WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';

/** 运行环境的存储/线程能力。 */
export interface WaSqliteCapabilities {
  /** OPFS 是否真正可用（`checkOPFSAvailable()` 的结果）。 */
  readonly opfs: boolean;
  /** 当前环境是否暴露 `SharedWorker` 构造函数。 */
  readonly sharedWorker: boolean;
}

/** Worker 工厂。抽成参数是为了让选项构造逻辑能脱离浏览器被测试。 */
export interface WaSqliteWorkerFactories {
  createWorker(): Worker;
  createSharedWorker(): SharedWorker;
}

/** 当前环境是否支持 `SharedWorker`。 */
export const isSharedWorkerSupported = (): boolean => typeof SharedWorker !== 'undefined';

/**
 * 按环境能力挑选 wa-sqlite 的连接选项。
 *
 * @param capabilities - 运行环境能力
 * @param factories - Worker 工厂；只有被选中的那条路径会真正创建实例
 * @returns 传给 `RxDBAdapterWaSqlite` 的选项
 *
 * @remarks
 * 三条路径，不是二选一。OPFS 与 SharedWorker 在 Safari &lt; 16.4 等环境里**同时缺失**，
 * 只写两条分支的话 else 必然命中 `new SharedWorker(...)` 并抛 `ReferenceError`——
 * 那会让 `provideAppInitializer` reject、bootstrap 失败，用户看到的是整页空白。
 * 第三条路径用专用 Worker 跑同一个 `IDBBatchAtomicVFS`，代价是失去跨标签页协调。
 *
 * 本 demo 里 wa-sqlite 只当**行缓存**（`SyncType.QueryCache` 的 local 端），
 * 权威数据在 4301 的后端；因此跨标签页协调的缺失在这里的影响比在 Full 同步下小得多。
 */
export function buildWaSqliteOptions(
  capabilities: WaSqliteCapabilities,
  factories: WaSqliteWorkerFactories
): WaSqliteOptions {
  if (capabilities.opfs) {
    return {
      vfs: 'OPFSCoopSyncVFS',
      // OPFSCoopSyncVFS 同步、异步都支持，适配器无从猜测；wasmPath 指向的是同步产物
      // wa-sqlite.wasm，必须显式声明 sync 模式，否则会拿 asyncify glue 去配同步 wasm。
      async: false,
      worker: true,
      workerInstance: factories.createWorker(),
      workerOwnership: 'client',
      wasmPath: '/wa-sqlite/wa-sqlite.wasm'
    };
  }

  if (capabilities.sharedWorker) {
    return {
      vfs: 'IDBBatchAtomicVFS',
      sharedWorker: true,
      sharedWorkerInstance: factories.createSharedWorker(),
      workerOwnership: 'client',
      wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
    };
  }

  return {
    vfs: 'IDBBatchAtomicVFS',
    worker: true,
    workerInstance: factories.createWorker(),
    workerOwnership: 'client',
    wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
  };
}
