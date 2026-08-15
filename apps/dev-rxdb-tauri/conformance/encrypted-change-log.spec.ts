/**
 * US-210 AC#5：Rust 宿主上加密字段的 change log 契约。
 *
 * @module conformance/encrypted-change-log
 */

import { runChangeLogSuite } from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import {
  readRustDatabaseFile,
  rustEncryptedAdapterFactory,
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

runChangeLogSuite({
  factory: rustEncryptedAdapterFactory,
  readDatabaseFile: readRustDatabaseFile
});
