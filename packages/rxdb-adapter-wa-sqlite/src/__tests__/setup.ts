/**
 * wa-sqlite 适配器的共享套件设置。
 *
 * 从 @aiao/rxdb-adapter-sqlite-core 导入所有共享测试套件函数，
 * 并使用 wa-sqlite AdapterFactory 调用它们。
 */
import {
  bigintBinaryClientSuite,
  bigintBinaryEntitySuite,
  cascadeMutationSuite,
  createSqliteClientSuite,
  crudIntegrationSuite,
  customPrimaryKeySuite,
  joinSqlSuite,
  menuIntegrationSuite,
  querySqlSuite,
  relationIntegrationSuite,
  rxdbAdapterSuite,
  sqliteClientBatchTimeoutSuite,
  sqliteClientSuite,
  sqliteRepositorySuite,
  systemSchemaMigrationSuite,
  tableIndexSuite,
  transactionSqliteResultSuite,
  treeIntegrationSuite,
  undoRedoSuite,
  versionBranchSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { waSqliteFactory } from './wa-sqlite-factory.js';

// 核心功能套件。
bigintBinaryClientSuite(waSqliteFactory);
bigintBinaryEntitySuite(waSqliteFactory);
rxdbAdapterSuite(waSqliteFactory);
sqliteRepositorySuite(waSqliteFactory);
systemSchemaMigrationSuite(waSqliteFactory);
sqliteClientSuite(waSqliteFactory);
sqliteClientBatchTimeoutSuite(waSqliteFactory);
createSqliteClientSuite(waSqliteFactory);

// SQL 生成套件（集成）。
joinSqlSuite(waSqliteFactory);
querySqlSuite(waSqliteFactory);
tableIndexSuite(waSqliteFactory);
transactionSqliteResultSuite(waSqliteFactory);

// CRUD 与实体套件。
crudIntegrationSuite(waSqliteFactory);
customPrimaryKeySuite(waSqliteFactory);
relationIntegrationSuite(waSqliteFactory);
menuIntegrationSuite(waSqliteFactory);
cascadeMutationSuite(waSqliteFactory);
treeIntegrationSuite(waSqliteFactory);

// 版本管理套件。
versionBranchSuite(waSqliteFactory);
undoRedoSuite(waSqliteFactory);
