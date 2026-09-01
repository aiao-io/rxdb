/**
 * US-208 AC#4：桌面 PGlite 适配器 × 加密字段的五套共享契约。
 *
 * @remarks
 * 加密不是桌面 PGlite 适配器自己的实现——它继承 `RxDBAdapterPGlite`，只把
 * `createClient()` 一个接缝换成了走 IPC 的客户端。所以这个文件不写新逻辑，只接线：
 * 要证明的是「换掉传输层之后行为一字不差」，而不是某段桌面专属的加密代码。
 *
 * 与浏览器档位跑的是**同一批套件、同一份断言**，只换了工厂——AC#4 那句「用户可见行为
 * 与浏览器内 PGlite adapter 一致」因此有机械保证，而不是靠人肉比对。
 *
 * @module __tests__/pglite-encrypted
 */

import {
  runBigIntBinaryEncryptedSuite,
  runChangeLogSuite,
  runCrudSuite,
  runLifecycleSuite,
  runQueryValidationSuite,
  runTamperSuite
} from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import {
  electronPgliteDeliveryErrors,
  electronPgliteEncryptedAdapterFactory,
  readElectronPgliteDatabaseFile,
  stopElectronPgliteTestHost
} from './electron-pglite-adapter-factory.js';

afterAll(async () => {
  try {
    expect(electronPgliteDeliveryErrors()).toEqual([]);
  } finally {
    await stopElectronPgliteTestHost();
  }
});

runCrudSuite({
  factory: electronPgliteEncryptedAdapterFactory,
  readDatabaseFile: readElectronPgliteDatabaseFile,
  // PG 的表名要带 schema 且大小写敏感，与浏览器档位同一份解析规则。
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});

runQueryValidationSuite({ factory: electronPgliteEncryptedAdapterFactory });

runLifecycleSuite({
  factory: electronPgliteEncryptedAdapterFactory,
  readDatabaseFile: readElectronPgliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});

runBigIntBinaryEncryptedSuite({
  factory: electronPgliteEncryptedAdapterFactory,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});

runChangeLogSuite({
  factory: electronPgliteEncryptedAdapterFactory,
  readDatabaseFile: readElectronPgliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});

runTamperSuite({
  factory: electronPgliteEncryptedAdapterFactory,
  readDatabaseFile: readElectronPgliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});
