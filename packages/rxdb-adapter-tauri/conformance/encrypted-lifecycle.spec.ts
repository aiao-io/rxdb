/**
 * US-210 AC#5：Rust 宿主上 keyring 的解锁 / 上锁生命周期契约。
 *
 * @module conformance/encrypted-lifecycle
 */

import { runLifecycleSuite } from '@aiao/rxdb-test/encrypted';
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

runLifecycleSuite({
  factory: rustEncryptedAdapterFactory,
  readDatabaseFile: readRustDatabaseFile
});
