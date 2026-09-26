import type { RxDB } from '@aiao/rxdb';
import type { SqliteRestoreStage } from './backup/sqlite-backup.interface.js';
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
   * 造一个尚未连接的 adapter。
   *
   * @param rxdb - 绑定的实例
   * @param kind - 目标存储
   * @returns adapter
   */
  createAdapter(rxdb: RxDB, kind: SqliteBackupStorageKind): RxDBAdapterSqliteBase;
  /**
   * 造一个配置在备份矩阵之外的 adapter。
   *
   * @param rxdb - 绑定的实例
   * @returns adapter
   */
  createUnsupportedAdapter(rxdb: RxDB): RxDBAdapterSqliteBase;
  /** `createUnsupportedAdapter` 报 `unsupported_combination` 时 `details.field` 的值。 */
  readonly unsupportedField: string;
  /**
   * 引擎是否编进了 FTS5。编进了就用 FTS5 虚表验证搜索对象的往返与虚表模块的兼容性判定；
   * 没编进（npm `wa-sqlite` 的预编译 wasm）则不存在含虚表的归档，这两条断言不适用。
   */
  readonly fts5: boolean;
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
   * 起一个跑 {@link serveInterruptedRestore} 的 module Worker；后端做不到「强杀后存储还在」时给出原因，
   * 强杀用例整组跳过并把原因写进标题。
   *
   * @remarks
   * 必须是工厂、且在 harness 文件里字面地写 `new Worker(new URL('…', import.meta.url), { type: 'module' })`：
   * vite 只认这种静态写法并把它打成 worker 入口，vitest 浏览器模式也只给这样的入口注入动态 import 的运行时。
   */
  readonly interruptWorker: (() => Worker) | { readonly unsupported: string };
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
  | 'backupConcurrencySuite'
  | 'backupEncryptionSuite'
  | 'backupFailureSuite'
  | 'backupInterruptSuite'
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

const backupFixtureModules = import.meta.glob<{ serveInterruptedRestore: (harness: SqliteBackupHarness) => void }>(
  './__tests__/backup/sqlite-backup-fixture.ts',
  { eager: true }
);

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
export const backupRoundtripSuite = getBackupSuite(
  './__tests__/shared-backup-roundtrip.suite.ts',
  'backupRoundtripSuite'
);
