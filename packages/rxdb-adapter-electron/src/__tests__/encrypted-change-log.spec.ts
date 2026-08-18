/**
 * US-207 AC#2：桌面适配器上加密字段的 change log 契约。
 *
 * @module __tests__/encrypted-change-log
 */

import { runChangeLogSuite } from '@aiao/rxdb-test/encrypted';
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

runChangeLogSuite({
  factory: electronEncryptedAdapterFactory,
  readDatabaseFile: readElectronDatabaseFile
});
