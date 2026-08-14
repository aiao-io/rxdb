/**
 * US-207 AC#2：桌面适配器上加密字段的 change log 契约。
 *
 * @module __tests__/encrypted-change-log
 */

import { runChangeLogSuite } from '@aiao/rxdb-test/encrypted';
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

runChangeLogSuite({
  factory: desktopEncryptedAdapterFactory,
  readDatabaseFile: readDesktopDatabaseFile
});
