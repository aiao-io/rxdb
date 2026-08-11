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
 *
 * @remarks
 * P1-1：原实现只有二选一 —— OPFS 可用走专用 Worker，否则**无条件** `new SharedWorker(...)`。
 * 但 OPFS 与 SharedWorker 在 Safari &lt; 16.4 等环境里是**同时缺失**的，
 * 于是 else 分支必然命中并抛 `ReferenceError`：
 *
 * ```
 * provideAppInitializer(() => inject(RxDB).connect('wa-sqlite'))
 *   → 适配器工厂抛 ReferenceError → initializer reject → bootstrap 失败
 *   → main.ts 只有 console.error → 用户看到的是**整页空白**
 * ```
 *
 * 补上第三条路径：没有 SharedWorker 时用专用 Worker 跑同一个 `IDBBatchAtomicVFS`。
 * 代价是失去跨标签页协调（多标签同时写会各写各的 IndexedDB 事务），
 * 但这是可用与完全打不开之间的取舍。
 *
 * **同源缺口**：`dev-rxdb-angular` / `-react` / `-vue` 三个 app 的
 * `setup_rxdb_wa-sqlite.ts` 有一模一样的无守卫 else 分支，需要同样处理。
 */
export function buildWaSqliteOptions(
  capabilities: WaSqliteCapabilities,
  factories: WaSqliteWorkerFactories
): WaSqliteOptions {
  if (capabilities.opfs) {
    return {
      vfs: 'OPFSCoopSyncVFS',
      // OPFSCoopSyncVFS 同时支持 sync 与 async，适配器无从猜测；wasmPath 指向的是
      // 同步产物 wa-sqlite.wasm，必须显式声明 sync 模式，否则会加载 asyncify glue 配同步 wasm。
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
