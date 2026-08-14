/**
 * US-210 AC#5：Rust 宿主上的加密信封篡改检测契约。
 *
 * @module conformance/encrypted-tamper
 */

import { runTamperSuite } from '@aiao/rxdb-test/encrypted';
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

runTamperSuite({
  factory: rustEncryptedAdapterFactory,
  readDatabaseFile: readRustDatabaseFile
});
