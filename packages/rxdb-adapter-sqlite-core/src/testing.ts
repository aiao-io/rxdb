import type { EntityType, RxDB } from '@aiao/rxdb';

/**
 * 适配器清理的目标对象：清理回调只需拿到 RxDB 实例。
 */
export interface AdapterCleanupTarget {
  readonly rxdb: RxDB;
}

/**
 * 适配器工厂契约：屏蔽不同后端（wa-sqlite / sqliteai / ...）的构造差异，
 * 让共享测试套件用同一份代码跑通所有后端。
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
  | 'rowsAffectedConformanceSuite'
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

const findMetadata = (EntityClass: EntityType): { symbol: symbol; value: object } | undefined => {
  let currentConstructor: object | null = EntityClass;
  while (currentConstructor) {
    const symbol = Object.getOwnPropertySymbols(currentConstructor).find(item => item.description === 'ɵMetadata');
    if (symbol) {
      const value: unknown = Object.getOwnPropertyDescriptor(currentConstructor, symbol)?.value;
      return value !== null && typeof value === 'object' ? { symbol, value } : undefined;
    }
    currentConstructor = Reflect.getPrototypeOf(currentConstructor);
  }
  return undefined;
};

const copyStaticProperties = (source: EntityType, target: EntityType, metadataSymbol?: symbol): void => {
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === 'prototype' || key === 'length' || key === 'name') continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) Object.defineProperty(target, key, descriptor);
  }

  for (const symbol of Object.getOwnPropertySymbols(source)) {
    if (symbol === metadataSymbol || symbol.description?.startsWith('ɵ')) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, symbol);
    if (descriptor) Object.defineProperty(target, symbol, { ...descriptor, configurable: true });
  }
};

/**
 * 克隆一组实体类（继承原型并复制静态元数据），隔离跨套件的装饰器元数据变更。
 */
export function cloneEntityClasses(entities: EntityType[]): EntityType[] {
  return entities.map(EntityClass => {
    const Clone: EntityType = class extends EntityClass {};
    const metadata = findMetadata(EntityClass);
    if (metadata) {
      Object.defineProperty(Clone, metadata.symbol, {
        value: Object.create(metadata.value),
        enumerable: false,
        configurable: true,
        writable: false
      });
    }
    copyStaticProperties(EntityClass, Clone, metadata?.symbol);
    return Clone;
  });
}

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
export const rowsAffectedConformanceSuite = getSharedSuite(
  './__tests__/shared-rows-affected-conformance.suite.ts',
  'rowsAffectedConformanceSuite'
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
