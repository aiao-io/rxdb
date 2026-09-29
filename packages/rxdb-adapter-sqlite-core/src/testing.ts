import type { RxDB } from '@aiao/rxdb';
import type { SqliteRestoreStage } from './backup/sqlite-backup.interface.js';
import type { DesktopHostTransport } from './desktop/desktop-sqlite-client.js';
import type { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';

/**
 * 适配器清理的目标对象：清理回调只需拿到 RxDB 实例。
 */
export interface AdapterCleanupTarget {
  readonly rxdb: RxDB;
}

/**
 * 适配器工厂契约：屏蔽不同后端（wa-sqlite / sqliteai / ...）的构造差异，
 * 让共享测试套件用同一份代码跑通所有后端。
 *
 * @remarks
 * `createAdapter()` 交出的实例**必须已装 `@aiao/rxdb-plugin-history`**：
 * `undoRedoSuite` / `versionBranchSuite` / `systemSchemaMigrationSuite` 直接读
 * `adapter.rxdb.versionManager`，而 `cleanup_db()` 每条用例后都要重置它的会话态。
 * 历史 / 撤销重做 / 分支自 US-025 阶段 C 起不在核心里，工厂不 `use()` 就是没有。
 */
export interface AdapterFactory {
  readonly name: string;
  createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T>;
  createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T>;
  cleanupAdapter?(adapter: AdapterCleanupTarget): void | Promise<void>;
}

/**
 * 共享测试套件的签名：接收一个适配器工厂，用其构造后端并运行全部断言。
 */
export type AdapterSuite = (factory: AdapterFactory) => void;

/** 备份共享套件关心的两种目标：内存库，或该后端在备份矩阵里支持的持久化存储。 */
export type SqliteBackupStorageKind = 'memory' | 'persistent';

/** 引擎在每条新连接上自动建出的对象，见 {@link SqliteBackupHarness.engineObjects}。 */
export interface SqliteBackupEngineObjects {
  /** `type:name`，不含 `sqlite_` 开头的内部对象。 */
  readonly names: readonly string[];
  /** 往引擎自建的表里写一行用户数据。 */
  readonly write: string;
  /** 读回引擎自建表里的用户数据，结果有确定的顺序。 */
  readonly read: string;
}

/** 备份矩阵之外的一种配置，见 {@link SqliteBackupHarness.unsupportedConfiguration}。 */
export interface SqliteBackupUnsupportedConfiguration {
  /**
   * 按这种配置造一个 adapter。
   *
   * @param rxdb - 绑定的实例
   * @returns adapter
   */
  createAdapter(rxdb: RxDB): RxDBAdapterSqliteBase;
  /** 报 `unsupported_combination` 时 `details.field` 的值。 */
  readonly field: string;
}

/**
 * 一个 SQLite 后端接入备份 / 恢复共享套件所需的全部差异。
 *
 * @remarks
 * 同一个 `dbName` 的两次 `createAdapter(…, 'persistent')` 必须打开同一份持久化库；
 * 需要 Worker 的后端在 {@link SqliteBackupHarness.release} 里终止它。
 */
export interface SqliteBackupHarness {
  /** 注册名；必须等于 `adapter.name`，也就是 manifest 里的 `adapter.name`。 */
  readonly adapterName: string;
  /** 持久化存储写进 manifest 的 `adapter.storage`，例如 `idb` / `opfs`。 */
  readonly persistentLabel: string;
  /**
   * 该后端在备份矩阵里支持的目标存储，必须含 `persistent`。
   *
   * @remarks
   * 桌面 host 只有应用数据目录里的库文件，没有内存库：只声明 `persistent` 时，只对内存库成立的用例整组跳过
   * 并把原因写进标题，其余用例里「随便一个源 / 目标」改用 {@link SqliteBackupHarness.createRelocatedAdapter}
   * 给的另一个位置。
   */
  readonly storageKinds: readonly SqliteBackupStorageKind[];
  /**
   * 造一个尚未连接的 adapter。
   *
   * @param rxdb - 绑定的实例
   * @param kind - 目标存储
   * @returns adapter
   */
  createAdapter(rxdb: RxDB, kind: SqliteBackupStorageKind): RxDBAdapterSqliteBase;
  /**
   * 造一个与 `createAdapter(rxdb, 'persistent')` 同库名、却落在另一个持久化位置的 adapter；
   * {@link SqliteBackupHarness.storageKinds} 不含 `memory` 时必须提供。
   *
   * @remarks
   * 加密库的认证域就是库名：「恢复到同一认证域的新位置」需要库名相同、存储不同的两个 adapter。
   * 能开内存库的后端用内存库充当这个位置，不需要它。
   *
   * @param rxdb - 绑定的实例
   * @returns adapter
   */
  createRelocatedAdapter?(rxdb: RxDB): RxDBAdapterSqliteBase;
  /**
   * 备份矩阵之外的一种配置（AC#8）；该后端的每一种配置都在矩阵里时给出原因，
   * 相应用例整组跳过并把原因写进标题。
   */
  readonly unsupportedConfiguration: SqliteBackupUnsupportedConfiguration | { readonly none: string };
  /**
   * 引擎对 FTS5 的支持，决定虚表相关的用例怎么跑。
   *
   * @remarks
   * - `true`：编进了 FTS5，也能改写它的影子表。用 FTS5 虚表验证搜索对象的往返与虚表模块的兼容性判定。
   * - `false`：没编进（npm `wa-sqlite` 的预编译 wasm），不存在含虚表的归档，这两条断言不适用。
   * - `{ shadowTablesRejected }`：编进了，但后端改不了影子表（见 `RxDBAdapterSqliteBase.shadowTablesWritable`），
   *   含 FTS5 的库不在它的备份矩阵里；套件改为验证备份与恢复两侧都拒绝，值是原因，写进用例标题。
   */
  readonly fts5: boolean | { readonly shadowTablesRejected: string };
  /**
   * 持久化存储连接后实际生效的 `PRAGMA journal_mode`。连接初始化会请求 WAL，但 VFS 不支持共享内存时
   * SQLite 静默保留原模式；套件先核对这个声明，是 `wal` 时再验证「已提交未 checkpoint 的数据进快照」。
   */
  readonly persistentJournalMode: string;
  /**
   * 引擎在每条新连接上自动建出的对象（例如 sqliteai 内置扩展的表）；不自动建对象的引擎为 `null`。
   *
   * @remarks
   * 这些对象连同它们的初始行就是「空库」本来的样子：观察残留时剔除，恢复只把「恰好等于新建空库」的目标当作空的。
   * 用例用 `write` 往里写一行用户数据，验证它随归档往返、且写过的目标不再算空。
   */
  readonly engineObjects: SqliteBackupEngineObjects | null;
  /**
   * 起一个会被强杀的恢复执行者（{@link RestoreInterruptWorker}）；后端做不到「强杀后存储还在」时给出原因，
   * 强杀用例整组跳过并把原因写进标题。
   *
   * @remarks
   * 浏览器后端起一个跑 {@link serveInterruptedRestore} 的 module Worker。必须是工厂、且在 harness 文件里字面地写
   * `new Worker(new URL('…', import.meta.url), { type: 'module' })`：vite 只认这种静态写法并把它打成 worker 入口，
   * vitest 浏览器模式也只给这样的入口注入动态 import 的运行时。
   *
   * 桌面后端的库文件在 host 进程里：用 {@link hostKillingRestoreWorker} 在测试进程里驱动一次连到专用 host 进程的恢复，
   * 到达停止位置就杀掉那个进程，被杀的是真正持有库文件的那一方。
   */
  readonly interruptWorker: (() => RestoreInterruptWorker) | { readonly unsupported: string };
  /**
   * 起一个连到同一批库文件的「别的进程」（{@link ForeignSqliteHost}）；后端没有进程边界时给出原因，
   * 跨进程用例整组跳过并把原因写进标题。
   *
   * @remarks
   * 别的进程与测试进程之间只共享 SQLite 自己的文件锁——没有共用的连接、队列或 Web Locks，恢复的独占、
   * 快照的一致性只能靠文件锁与事务成立，这正是桌面后端要证明的。浏览器后端的所有页面同属一个 origin、
   * 共享 Web Locks，「同页第二个实例」的用例已经覆盖它们能遇到的并发，因此给出原因跳过。
   */
  readonly foreignHost: (() => ForeignSqliteHost) | { readonly unsupported: string };
  /**
   * 起一个传输层被 `wrap` 包住的专用 host（US-217 AC#21）；后端没有 renderer / host 通道时给出原因，
   * 通道用例整组跳过并把原因写进标题。
   *
   * @remarks
   * 与 {@link SqliteBackupHarness.foreignHost} 一样开同一个工作区，区别只在 `createAdapter(…, 'persistent')`
   * 经 `wrap(原传输层)` 与 host 往来：套件在包装里计量在途请求与消息大小，停住应答、丢掉请求或应答、改写握手，
   * 验证背压、断开与协议不兼容。`stop` 必须让 host 放开它持有的文件锁——通道彻底断掉时，只有 host 退出才能释放恢复的独占锁。
   *
   * @param wrap - 包住专用 host 的原传输层
   * @returns 连到专用 host 的后端契约与关闭入口
   */
  readonly channelHost:
    | ((wrap: (transport: DesktopHostTransport) => DesktopHostTransport) => ForeignSqliteHost)
    | { readonly unsupported: string };
  /**
   * 释放 `createAdapter` 为该实例开的外部资源（Worker 等）；在实例断开之后调用。
   *
   * @param rxdb - 实例
   */
  release?(rxdb: RxDB): void | Promise<void>;
}

/** 强杀恢复的位置：读流中途、各阶段回调里，或恢复已经返回之后。 */
export type RestoreInterruptPoint = 'streaming' | SqliteRestoreStage | 'returned';

/** 主线程发给强杀 Worker 的任务。 */
export interface RestoreInterruptRequest {
  readonly archive: Uint8Array;
  readonly dbName: string;
  readonly stopAt: RestoreInterruptPoint;
}

/** 强杀 Worker 的回报：到达停止位置，或恢复在到达之前就失败了。 */
export type RestoreInterruptReply = { readonly reached: RestoreInterruptPoint } | { readonly failed: string };

/**
 * 强杀用例驱动的恢复执行者：module {@link Worker} 结构上就满足它，桌面后端给一个同样收发消息的替身。
 *
 * @remarks
 * 收到 {@link RestoreInterruptRequest} 后开始恢复。回报 `reached` 时，底层存储必须已经处于「执行者被强杀」的状态，
 * 此后本次恢复再也碰不到目标；恢复在到达之前失败则回报 `failed`。`terminate` 可重复调用。
 */
export interface RestoreInterruptWorker {
  /** 收回报的回调，由套件设置。 */
  onmessage: ((event: MessageEvent<RestoreInterruptReply>) => void) | null;
  /** 执行者自身出错（例如 Worker 脚本加载失败）的回调，由套件设置。 */
  onerror: ((event: ErrorEvent) => void) | null;
  /**
   * 下发恢复任务。
   *
   * @param request - 归档、库名与停止位置
   */
  postMessage(request: RestoreInterruptRequest): void;
  /** 强杀执行者；已经杀掉时什么也不做。 */
  terminate(): void;
}

/** 强杀用例的一个专用桌面 host，见 {@link hostKillingRestoreWorker}。 */
export interface KillableRestoreHost {
  /** `createAdapter(…, 'persistent')` 连到这个专用 host 的后端契约；其余字段与后端本来的契约相同。 */
  readonly harness: SqliteBackupHarness;
  /**
   * 以 SIGKILL 强杀 host 进程并等它退出。
   *
   * @remarks
   * 返回时经它的在途请求都已失败，此后的请求也立刻失败，调用方再也碰不到库文件。已经退出时直接返回。
   */
  kill(): Promise<void>;
}

/** 跨进程用例的「别的进程」，见 {@link SqliteBackupHarness.foreignHost}。 */
export interface ForeignSqliteHost {
  /** `createAdapter(…, 'persistent')` 连到这个 host 的后端契约；其余字段与后端本来的契约相同。 */
  readonly harness: SqliteBackupHarness;
  /** 关掉 host 进程并等它退出；已经退出时直接返回。 */
  stop(): Promise<void>;
  /**
   * host 进程自启动以来的峰值常驻内存，由操作系统记账（US-217 AC#9）。
   *
   * @remarks
   * 进程里的一切都算在内：引擎页缓存、原生与 JS 分配、待回收的垃圾以及 IPC 缓冲。
   *
   * @returns 字节数
   */
  peakRss(): Promise<number>;
}

/** 一次备份或恢复量到的新增峰值内存（US-217 AC#9）。 */
export interface BackupMemoryDelta {
  /** host 进程的峰值常驻内存增量（字节）：相对同规模库空闲打开时的峰值。 */
  readonly host: number;
  /** renderer（测试进程）GC 之后存活内存的峰值增量（字节）。 */
  readonly renderer: number;
}

/** 一档库大小上备份与恢复各一次的测量结果。 */
export interface BackupMemoryMeasurement {
  /** 库的逻辑字节数。 */
  readonly databaseBytes: number;
  readonly backup: BackupMemoryDelta;
  readonly restore: BackupMemoryDelta;
}

/** 某个后端冻结的新增峰值预算（字节），与库大小无关。 */
export interface BackupMemoryBudget {
  readonly hostBackup: number;
  readonly hostRestore: number;
  /** 备份与恢复两边 renderer 增量的共同上限。 */
  readonly renderer: number;
}

/** 在关键点上采样 renderer 存活内存的峰值。 */
export interface BackupRendererMeter {
  /** 记一个采样点；每若干次才真正做一次 GC 与读数。 */
  sample(): void;
  /** 自创建以来的峰值增量（字节）。 */
  delta(): number;
}

/**
 * AC#9 测量工具，与存储后端无关：SQLite 桌面 host 由 `backupMemorySuite` 使用，其他后端（Electron PGlite host）
 * 在自己的用例里按同样的方法量、用同一条判据断言。只能在 Node 测试进程里调用。
 */
export interface BackupMemoryTools {
  /** 每条记录的不可压缩负载字节数：远大于一页，又远小于各后端的单行上限。 */
  readonly payloadBytes: number;
  /** 两档库大小（负载总量，MiB）。 */
  readonly sizesMib: readonly [number, number];
  /**
   * 可重复的不可压缩字节。
   *
   * @param size - 字节数
   * @param seed - 种子
   */
  noise(size: number, seed: number): Uint8Array;
  /** 以当前 GC 后存活内存为基线新建一个采样器。 */
  rendererMeter(): BackupRendererMeter;
  /**
   * 在一个临时目录里给出归档文件路径，`run` 结束后删掉目录。
   *
   * @param run - 使用该路径的操作
   */
  withArchiveFile<T>(run: (path: string) => Promise<T>): Promise<T>;
  /**
   * 把备份逐块写进文件，每块采样一次。
   *
   * @param backup - 以输出流调用后端备份
   * @param path - 归档文件
   * @param meter - 采样器
   */
  backupToFile(
    backup: (sink: WritableStream<Uint8Array>) => Promise<unknown>,
    path: string,
    meter: BackupRendererMeter
  ): Promise<void>;
  /**
   * 从文件逐块（64 KiB）读出归档，每块采样一次。
   *
   * @param path - 归档文件
   * @param meter - 采样器
   */
  fileSource(path: string, meter: BackupRendererMeter): ReadableStream<Uint8Array>;
  /**
   * AC#9 判据：两档都在绝对预算内，且大档相对小档的增量增长不到库增长的一半。
   *
   * @param small - 小档结果
   * @param large - 大档结果
   * @param budget - 该后端冻结的预算
   */
  expectBounded(small: BackupMemoryMeasurement, large: BackupMemoryMeasurement, budget: BackupMemoryBudget): void;
}

/** 备份共享套件的签名：接收一个后端契约，跑完该后端的备份 / 恢复断言。 */
export type BackupSuite = (harness: SqliteBackupHarness) => void;

type SuiteExportName =
  | 'adapterConstructionSuite'
  | 'bigintBinaryClientSuite'
  | 'bigintBinaryEntitySuite'
  | 'cascadeMutationSuite'
  | 'createSqliteClientSuite'
  | 'crudIntegrationSuite'
  | 'customPrimaryKeySuite'
  | 'joinSqlSuite'
  | 'menuIntegrationSuite'
  | 'querySqlSuite'
  | 'relationIntegrationSuite'
  | 'rxdbAdapterSuite'
  | 'sqliteClientBatchTimeoutSuite'
  | 'sqliteClientSuite'
  | 'sqliteRepositorySuite'
  | 'systemSchemaMigrationSuite'
  | 'tableIndexSuite'
  | 'transactionSqliteResultSuite'
  | 'treeIntegrationSuite'
  | 'undoRedoSuite'
  | 'versionBranchSuite';

type BackupSuiteExportName =
  | 'backupChannelSuite'
  | 'backupConcurrencySuite'
  | 'backupEncryptionSuite'
  | 'backupFailureSuite'
  | 'backupInterruptSuite'
  | 'backupMemorySuite'
  | 'backupRoundtripSuite';

type SharedSuiteModule = Partial<Record<SuiteExportName, AdapterSuite> & Record<BackupSuiteExportName, BackupSuite>>;

const sharedSuiteModules = import.meta.glob<SharedSuiteModule>('./__tests__/*.suite.ts', { eager: true });

const getSharedSuite = (modulePath: string, exportName: SuiteExportName): AdapterSuite => {
  const suite = sharedSuiteModules[modulePath]?.[exportName];
  if (!suite) throw new Error(`Missing shared SQLite suite export: ${modulePath}#${exportName}`);
  return suite;
};

const getBackupSuite = (modulePath: string, exportName: BackupSuiteExportName): BackupSuite => {
  const suite = sharedSuiteModules[modulePath]?.[exportName];
  if (!suite) throw new Error(`Missing shared SQLite backup suite export: ${modulePath}#${exportName}`);
  return suite;
};

const backupFixtureModules = import.meta.glob<{
  serveInterruptedRestore: (harness: SqliteBackupHarness) => void;
  hostKillingRestoreWorker: (startHost: () => KillableRestoreHost) => RestoreInterruptWorker;
}>('./__tests__/backup/sqlite-backup-fixture.ts', { eager: true });

/**
 * 在当前 module Worker 里接收恢复任务：把归档恢复到持久化目标，走到指定位置后停住，等主线程 terminate。
 *
 * @remarks
 * 供各后端的强杀 Worker 调用；主线程一侧由 `backupInterruptSuite` 驱动。
 *
 * @param harness - Worker 里可用的后端（`createAdapter(…, 'persistent')` 要能在 Worker 里直接打开存储）
 */
export const serveInterruptedRestore: (harness: SqliteBackupHarness) => void =
  backupFixtureModules['./__tests__/backup/sqlite-backup-fixture.ts'].serveInterruptedRestore;

/**
 * 桌面后端的恢复强杀执行者，用作 {@link SqliteBackupHarness.interruptWorker}：结构上与 module Worker 相同，
 * 被杀的是持有目标库文件的 host 进程。
 *
 * @remarks
 * 每个任务经 `startHost` 起一个专用 host，恢复在测试进程里驱动、经它写库文件，到达停止位置就 SIGKILL 它再回报 `reached`：
 * host 来不及回滚事务、关连接或删临时文件，文件锁由操作系统随进程回收，与应用进程被系统杀掉一样。
 * 套件随后用共用 host 上的新实例观察库文件，与应用被杀后重新启动一样。
 *
 * @param startHost - 起一个专用 host，与后端的共用 host 开同一批库文件；起过的 host 由后端负责收尾
 * @returns 执行者
 */
export const hostKillingRestoreWorker: (startHost: () => KillableRestoreHost) => RestoreInterruptWorker =
  backupFixtureModules['./__tests__/backup/sqlite-backup-fixture.ts'].hostKillingRestoreWorker;

const backupMemoryModules = import.meta.glob<{ backupMemoryTools: BackupMemoryTools }>(
  './__tests__/backup/backup-memory-tools.ts',
  { eager: true }
);

/** 见 {@link BackupMemoryTools}。 */
export const backupMemoryTools: BackupMemoryTools =
  backupMemoryModules['./__tests__/backup/backup-memory-tools.ts'].backupMemoryTools;

/**
 * 克隆一组实体类（继承原型并复制静态元数据），隔离跨套件的装饰器元数据变更。
 *
 * @remarks
 * **是核心 {@link https://github.com/aiao-io/rxdb | `@aiao/rxdb/testing`} 那一份的转出口，
 * 不是第二份实现。** 本包与 `@aiao/rxdb-adapter-pglite` 曾各写一遍逐字等价的副本，两份都靠
 * `symbol.description === 'ɵMetadata'` 找元数据槽位——而核心的槽位描述是
 * `'@aiao/rxdb/ɵMetadata'`，那个字面量从来没匹配上过。核心那一份按 `METADATA` 符号本身认，
 * 核心改名即编译错误。
 */
export { cloneEntityClasses } from '@aiao/rxdb/testing';

export const adapterConstructionSuite = getSharedSuite(
  './__tests__/shared-adapter-construction.suite.ts',
  'adapterConstructionSuite'
);
export const bigintBinaryClientSuite = getSharedSuite(
  './__tests__/shared-bigint-binary.suite.ts',
  'bigintBinaryClientSuite'
);
export const bigintBinaryEntitySuite = getSharedSuite(
  './__tests__/shared-bigint-binary-entity.suite.ts',
  'bigintBinaryEntitySuite'
);
export const cascadeMutationSuite = getSharedSuite(
  './__tests__/shared-cascade-mutation.suite.ts',
  'cascadeMutationSuite'
);
export const createSqliteClientSuite = getSharedSuite(
  './__tests__/shared-create-sqlite-client.suite.ts',
  'createSqliteClientSuite'
);
export const crudIntegrationSuite = getSharedSuite('./__tests__/shared-crud.suite.ts', 'crudIntegrationSuite');
export const customPrimaryKeySuite = getSharedSuite(
  './__tests__/shared-custom-primary-key.suite.ts',
  'customPrimaryKeySuite'
);
export const joinSqlSuite = getSharedSuite('./__tests__/shared-join-sql.suite.ts', 'joinSqlSuite');
export const menuIntegrationSuite = getSharedSuite('./__tests__/shared-menu.suite.ts', 'menuIntegrationSuite');
export const querySqlSuite = getSharedSuite('./__tests__/shared-query-sql.suite.ts', 'querySqlSuite');
export const relationIntegrationSuite = getSharedSuite(
  './__tests__/shared-relations.suite.ts',
  'relationIntegrationSuite'
);
export const sqliteRepositorySuite = getSharedSuite('./__tests__/shared-repository.suite.ts', 'sqliteRepositorySuite');
export const systemSchemaMigrationSuite = getSharedSuite(
  './__tests__/shared-system-schema-migration.suite.ts',
  'systemSchemaMigrationSuite'
);
export const rxdbAdapterSuite = getSharedSuite('./__tests__/shared-rxdb-adapter.suite.ts', 'rxdbAdapterSuite');
export const sqliteClientBatchTimeoutSuite = getSharedSuite(
  './__tests__/shared-sqlite-client-batch-timeout.suite.ts',
  'sqliteClientBatchTimeoutSuite'
);
export const sqliteClientSuite = getSharedSuite('./__tests__/shared-sqlite-client.suite.ts', 'sqliteClientSuite');
export const tableIndexSuite = getSharedSuite('./__tests__/shared-table-index.suite.ts', 'tableIndexSuite');
export const transactionSqliteResultSuite = getSharedSuite(
  './__tests__/shared-transaction-result.suite.ts',
  'transactionSqliteResultSuite'
);
export const treeIntegrationSuite = getSharedSuite('./__tests__/shared-tree.suite.ts', 'treeIntegrationSuite');
export const undoRedoSuite = getSharedSuite('./__tests__/shared-undo-redo.suite.ts', 'undoRedoSuite');
export const versionBranchSuite = getSharedSuite('./__tests__/shared-version-branch.suite.ts', 'versionBranchSuite');
export const backupChannelSuite = getBackupSuite('./__tests__/shared-backup-channel.suite.ts', 'backupChannelSuite');
export const backupConcurrencySuite = getBackupSuite(
  './__tests__/shared-backup-concurrency.suite.ts',
  'backupConcurrencySuite'
);
export const backupEncryptionSuite = getBackupSuite(
  './__tests__/shared-backup-encryption.suite.ts',
  'backupEncryptionSuite'
);
export const backupFailureSuite = getBackupSuite('./__tests__/shared-backup-failure.suite.ts', 'backupFailureSuite');
export const backupInterruptSuite = getBackupSuite(
  './__tests__/shared-backup-interrupt.suite.ts',
  'backupInterruptSuite'
);
export const backupMemorySuite = getBackupSuite('./__tests__/shared-backup-memory.suite.ts', 'backupMemorySuite');
export const backupRoundtripSuite = getBackupSuite(
  './__tests__/shared-backup-roundtrip.suite.ts',
  'backupRoundtripSuite'
);
