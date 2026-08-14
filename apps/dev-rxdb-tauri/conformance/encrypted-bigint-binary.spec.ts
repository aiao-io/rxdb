/**
 * US-210 AC#5：Rust 宿主上的加密 bigint / binary 字段契约。
 *
 * @module conformance/encrypted-bigint-binary
 */

import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import { rustEncryptedAdapterFactory, rustHostStderr, stopRustTestHost } from './rust-adapter-factory.js';

afterAll(() => {
  try {
    expect(rustHostStderr()).toBe('');
  } finally {
    stopRustTestHost();
  }
});

runBigIntBinaryEncryptedSuite({ factory: rustEncryptedAdapterFactory });
