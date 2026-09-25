import type { RxDB } from '@aiao/rxdb';

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

type SharedSuiteModule = Partial<Record<SuiteExportName, AdapterSuite>>;

const sharedSuiteModules = import.meta.glob<SharedSuiteModule>('./__tests__/*.suite.ts', { eager: true });

const getSharedSuite = (modulePath: string, exportName: SuiteExportName): AdapterSuite => {
  const suite = sharedSuiteModules[modulePath]?.[exportName];
  if (!suite) throw new Error(`Missing shared SQLite suite export: ${modulePath}#${exportName}`);
  return suite;
};

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
