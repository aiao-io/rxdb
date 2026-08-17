/**
 * US-207 AC#2：桌面适配器 × 加密字段的 CRUD 往返与查询校验契约。
 *
 * @remarks
 * 加密不是桌面适配器自己的实现 —— `system/encrypt-patch.ts` 住在
 * `@aiao/rxdb-adapter-sqlite-core` 里，`RxDBAdapterDesktop` 继承
 * `RxDBAdapterSqliteBase` 就该继承这份行为。所以这个文件不写新逻辑，只接线：
 * 真正要证明的是「继承确实成立」，而不是某段桌面专属的加密代码。
 *
 * @module __tests__/encrypted-crud
 */

import { runCrudSuite, runQueryValidationSuite } from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import {
  desktopEncryptedAdapterFactory,
  desktopHostDeliveryErrors,
  readDesktopDatabaseFile,
  stopDesktopTestHost
} from './desktop-adapter-factory.js';

afterAll(() => {
  try {
    expect(desktopHostDeliveryErrors()).toEqual([]);
  } finally {
    stopDesktopTestHost();
  }
});

runCrudSuite({
  factory: desktopEncryptedAdapterFactory,
  readDatabaseFile: readDesktopDatabaseFile
});

runQueryValidationSuite({ factory: desktopEncryptedAdapterFactory });
