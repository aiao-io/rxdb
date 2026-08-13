/**
 * 桌面适配器的共享套件入口（US-207 AC#1 / AC#4）。
 *
 * @remarks
 * 与 wa-sqlite / sqlite-wasm 后端跑的是同一批套件、同一份断言，只换了工厂——
 * 「桌面路径的行为与浏览器路径一致」这句话因此有机械保证，而不是靠人肉比对。
 *
 * 两个套件未纳入，原因是它们测的配置在桌面后端根本不存在，跑起来只会假绿：
 * - `createSqliteClientSuite` 校验的是 wasm 后端的 `worker` / `workerInstance` 选项组合；
 *   桌面客户端不接受任何 worker 选项，host 跑在哪个线程由宿主应用决定。
 * - `sqliteClientBatchTimeoutSuite` 测的是变更事件的 debounce 与硬上限；host 侧
 *   `node:sqlite` 是同步的，每条语句返回前就已 flush，没有可配的 `batchTimeout`。
 *   跨传输层的变更事件投递另由 `desktop-sqlite-client.spec.ts` 覆盖。
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
import { desktopAdapterFactory, desktopHostDeliveryErrors, stopDesktopTestHost } from './desktop-adapter-factory.js';

afterAll(() => {
  try {
    expect(desktopHostDeliveryErrors()).toEqual([]);
  } finally {
    stopDesktopTestHost();
  }
});

adapterConstructionSuite(desktopAdapterFactory);
bigintBinaryClientSuite(desktopAdapterFactory);
bigintBinaryEntitySuite(desktopAdapterFactory);

rxdbAdapterSuite(desktopAdapterFactory);
sqliteRepositorySuite(desktopAdapterFactory);
systemSchemaMigrationSuite(desktopAdapterFactory);
rowsAffectedConformanceSuite(desktopAdapterFactory);
sqliteClientSuite(desktopAdapterFactory);

joinSqlSuite(desktopAdapterFactory);
querySqlSuite(desktopAdapterFactory);
tableIndexSuite(desktopAdapterFactory);
transactionSqliteResultSuite(desktopAdapterFactory);

crudIntegrationSuite(desktopAdapterFactory);
customPrimaryKeySuite(desktopAdapterFactory);
relationIntegrationSuite(desktopAdapterFactory);
menuIntegrationSuite(desktopAdapterFactory);
cascadeMutationSuite(desktopAdapterFactory);
treeIntegrationSuite(desktopAdapterFactory);

versionBranchSuite(desktopAdapterFactory);
undoRedoSuite(desktopAdapterFactory);
