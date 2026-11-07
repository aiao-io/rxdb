import type { WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';

/** 运行环境的存储 / 线程能力。 */
export interface WaSqliteCapabilities {
  /** OPFS 是否真正可用（`checkOPFSAvailable()` 的结果）。 */
  readonly opfs: boolean;
  /** 当前环境是否暴露 `SharedWorker`。 */
  readonly sharedWorker: boolean;
}

/** Worker 工厂：只有被选中的那条路径才会真正创建实例。 */
export interface WaSqliteWorkerFactories {
  createWorker(): Worker;
  createSharedWorker(): SharedWorker;
}

/** 当前环境是否支持 `SharedWorker`。 */
export const isSharedWorkerSupported = (): boolean => typeof SharedWorker !== 'undefined';

/**
 * 按环境能力挑选 wa-sqlite 的连接选项，与 dev-rxdb-supabase 相同：
 * OPFS 可用走专用 Worker 的 `OPFSCoopSyncVFS`，否则 IndexedDB，能用 SharedWorker 就跨标签页共用。
 */
export function buildWaSqliteOptions(
  capabilities: WaSqliteCapabilities,
  factories: WaSqliteWorkerFactories
): WaSqliteOptions {
  if (capabilities.opfs) {
    return {
      vfs: 'OPFSCoopSyncVFS',
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
