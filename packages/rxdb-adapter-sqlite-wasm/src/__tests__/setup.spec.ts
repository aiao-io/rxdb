/**
 * sqlite-wasm adapter 测试套件入口
 *
 * 使用 memory VFS，全部在浏览器环境（vitest browser）中运行。
 */
import {
  adapterConstructionSuite,
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
import { sqliteWasmFactory } from './sqlite-wasm-factory.js';

// 构造。
adapterConstructionSuite(sqliteWasmFactory);
bigintBinaryClientSuite(sqliteWasmFactory);
bigintBinaryEntitySuite(sqliteWasmFactory);

// 核心功能。
rxdbAdapterSuite(sqliteWasmFactory);
sqliteRepositorySuite(sqliteWasmFactory);
systemSchemaMigrationSuite(sqliteWasmFactory);
sqliteClientSuite(sqliteWasmFactory);
sqliteClientBatchTimeoutSuite(sqliteWasmFactory);
createSqliteClientSuite(sqliteWasmFactory);

// SQL 生成。
joinSqlSuite(sqliteWasmFactory);
querySqlSuite(sqliteWasmFactory);
tableIndexSuite(sqliteWasmFactory);
transactionSqliteResultSuite(sqliteWasmFactory);

// CRUD 与实体。
crudIntegrationSuite(sqliteWasmFactory);
customPrimaryKeySuite(sqliteWasmFactory);
relationIntegrationSuite(sqliteWasmFactory);
menuIntegrationSuite(sqliteWasmFactory);
cascadeMutationSuite(sqliteWasmFactory);
treeIntegrationSuite(sqliteWasmFactory);

// 版本管理。
versionBranchSuite(sqliteWasmFactory);
undoRedoSuite(sqliteWasmFactory);
