/**
 * sqliteai 适配器的共享套件设置。
 *
 * 从 @aiao/rxdb-adapter-sqlite-core 导入所有共享测试套件函数，
 * 并使用 sqliteai AdapterFactory 调用它们。
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
  rowsAffectedConformanceSuite,
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
import { sqliteaiFactory } from './sqliteai-factory.js';

// 核心功能套件。
bigintBinaryClientSuite(sqliteaiFactory);
bigintBinaryEntitySuite(sqliteaiFactory);
rxdbAdapterSuite(sqliteaiFactory);
sqliteRepositorySuite(sqliteaiFactory);
systemSchemaMigrationSuite(sqliteaiFactory);
rowsAffectedConformanceSuite(sqliteaiFactory);
sqliteClientSuite(sqliteaiFactory);
sqliteClientBatchTimeoutSuite(sqliteaiFactory);
createSqliteClientSuite(sqliteaiFactory);

// SQL 生成套件（集成）。
joinSqlSuite(sqliteaiFactory);
querySqlSuite(sqliteaiFactory);
tableIndexSuite(sqliteaiFactory);
transactionSqliteResultSuite(sqliteaiFactory);

// CRUD 与实体套件。
crudIntegrationSuite(sqliteaiFactory);
customPrimaryKeySuite(sqliteaiFactory);
relationIntegrationSuite(sqliteaiFactory);
menuIntegrationSuite(sqliteaiFactory);
cascadeMutationSuite(sqliteaiFactory);
treeIntegrationSuite(sqliteaiFactory);

// 版本管理套件。
versionBranchSuite(sqliteaiFactory);
undoRedoSuite(sqliteaiFactory);
