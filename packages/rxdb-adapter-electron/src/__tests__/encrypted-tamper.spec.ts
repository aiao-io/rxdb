/**
 * US-207 AC#2：桌面适配器上的加密信封篡改检测契约。
 *
 * @module __tests__/encrypted-tamper
 */

import { runTamperSuite } from '@aiao/rxdb-test/encrypted';
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

runTamperSuite({
  factory: desktopEncryptedAdapterFactory,
  readDatabaseFile: readDesktopDatabaseFile
});
