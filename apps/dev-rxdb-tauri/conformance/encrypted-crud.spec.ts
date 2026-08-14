/**
 * US-210 AC#5：Rust 宿主 × 加密字段的 CRUD 往返与查询校验契约。
 *
 * @remarks
 * 加密不是桌面适配器自己的实现——`system/encrypt-patch.ts` 住在
 * `@aiao/rxdb-adapter-sqlite-core` 里。这个文件不写新逻辑，只接线：要证明的是
 * 换成 Rust 引擎之后那份继承来的行为**依然成立**，而不是某段 Tauri 专属的加密代码。
 *
 * @module conformance/encrypted-crud
 */

import { runCrudSuite, runQueryValidationSuite } from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import {
  readRustDatabaseFile,
  rustEncryptedAdapterFactory,
  rustHostStderr,
  stopRustTestHost
} from './rust-adapter-factory.js';

afterAll(() => {
  try {
    expect(rustHostStderr()).toBe('');
  } finally {
    stopRustTestHost();
  }
});

runCrudSuite({
  factory: rustEncryptedAdapterFactory,
  readDatabaseFile: readRustDatabaseFile
});

runQueryValidationSuite({ factory: rustEncryptedAdapterFactory });
