/**
 * Rust 宿主的共享套件入口（US-210 AC#2/#3/#5/#7）。
 *
 * @remarks
 * 与 Electron、wa-sqlite、sqlite-wasm 后端跑的是同一批套件、同一份断言，只换了工厂。
 * 这是「Tauri 路径的行为与其它后端一致」这句话的全部证据。
 *
 * 只有 `createSqliteClientSuite` 未纳入：它校验的是 wasm 后端的 `worker` / `workerInstance`
 * 选项组合，而桌面客户端不接受任何 worker 选项——宿主跑在哪个线程由宿主应用决定。
 */

import {
  adapterConstructionSuite,
  bigintBinaryClientSuite,
  bigintBinaryEntitySuite,
  cascadeMutationSuite,
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
import { afterAll, expect } from 'vitest';
import {
  rustAdapterFactory,
  rustHostDeliveryErrors,
  rustHostStderr,
  stopRustTestHost
} from './rust-adapter-factory.js';

afterAll(() => {
  try {
    expect(rustHostStderr()).toBe('');
    expect(rustHostDeliveryErrors()).toEqual([]);
  } finally {
    stopRustTestHost();
  }
});

adapterConstructionSuite(rustAdapterFactory);
bigintBinaryClientSuite(rustAdapterFactory);
bigintBinaryEntitySuite(rustAdapterFactory);

rxdbAdapterSuite(rustAdapterFactory);
sqliteRepositorySuite(rustAdapterFactory);
systemSchemaMigrationSuite(rustAdapterFactory);
rowsAffectedConformanceSuite(rustAdapterFactory);
sqliteClientSuite(rustAdapterFactory);
sqliteClientBatchTimeoutSuite(rustAdapterFactory);

joinSqlSuite(rustAdapterFactory);
querySqlSuite(rustAdapterFactory);
tableIndexSuite(rustAdapterFactory);
transactionSqliteResultSuite(rustAdapterFactory);

crudIntegrationSuite(rustAdapterFactory);
customPrimaryKeySuite(rustAdapterFactory);
relationIntegrationSuite(rustAdapterFactory);
menuIntegrationSuite(rustAdapterFactory);
cascadeMutationSuite(rustAdapterFactory);
treeIntegrationSuite(rustAdapterFactory);

versionBranchSuite(rustAdapterFactory);
undoRedoSuite(rustAdapterFactory);
