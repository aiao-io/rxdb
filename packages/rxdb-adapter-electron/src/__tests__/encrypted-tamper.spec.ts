/**
 * US-207 AC#2：桌面适配器上的加密信封篡改检测契约。
 *
 * @module __tests__/encrypted-tamper
 */

import { runTamperSuite } from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import {
  electronEncryptedAdapterFactory,
  electronHostDeliveryErrors,
  readElectronDatabaseFile,
  stopElectronTestHost
} from './electron-adapter-factory.js';

afterAll(() => {
  try {
    expect(electronHostDeliveryErrors()).toEqual([]);
  } finally {
    stopElectronTestHost();
  }
});

runTamperSuite({
  factory: electronEncryptedAdapterFactory,
  readDatabaseFile: readElectronDatabaseFile
});
