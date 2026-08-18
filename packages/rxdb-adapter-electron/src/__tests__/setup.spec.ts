/**
 * 桌面适配器的共享套件入口（US-207 AC#1 / AC#2）。
 *
 * @remarks
 * 与 wa-sqlite / sqlite-wasm 后端跑的是同一批套件、同一份断言，只换了工厂——
 * 「桌面路径的行为与浏览器路径一致」这句话因此有机械保证，而不是靠人肉比对。
 *
 * 只有 `createSqliteClientSuite` 未纳入：它校验的是 wasm 后端的 `worker` / `workerInstance`
 * 选项组合，而桌面客户端不接受任何 worker 选项——host 跑在哪个线程由宿主应用决定。
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
  electronAdapterFactory,
  electronHostDeliveryErrors,
  stopElectronTestHost
} from './electron-adapter-factory.js';

afterAll(() => {
  try {
    expect(electronHostDeliveryErrors()).toEqual([]);
  } finally {
    stopElectronTestHost();
  }
});

adapterConstructionSuite(electronAdapterFactory);
bigintBinaryClientSuite(electronAdapterFactory);
bigintBinaryEntitySuite(electronAdapterFactory);

rxdbAdapterSuite(electronAdapterFactory);
sqliteRepositorySuite(electronAdapterFactory);
systemSchemaMigrationSuite(electronAdapterFactory);
sqliteClientSuite(electronAdapterFactory);
sqliteClientBatchTimeoutSuite(electronAdapterFactory);

joinSqlSuite(electronAdapterFactory);
querySqlSuite(electronAdapterFactory);
tableIndexSuite(electronAdapterFactory);
transactionSqliteResultSuite(electronAdapterFactory);

crudIntegrationSuite(electronAdapterFactory);
customPrimaryKeySuite(electronAdapterFactory);
relationIntegrationSuite(electronAdapterFactory);
menuIntegrationSuite(electronAdapterFactory);
cascadeMutationSuite(electronAdapterFactory);
treeIntegrationSuite(electronAdapterFactory);

versionBranchSuite(electronAdapterFactory);
undoRedoSuite(electronAdapterFactory);
