/**
 * US-207 AC#2：桌面适配器上的加密 bigint / binary 字段契约。
 *
 * @module __tests__/encrypted-bigint-binary
 */

import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';
import { afterAll, expect } from 'vitest';
import {
  desktopEncryptedAdapterFactory,
  desktopHostDeliveryErrors,
  stopDesktopTestHost
} from './desktop-adapter-factory.js';

afterAll(() => {
  try {
    expect(desktopHostDeliveryErrors()).toEqual([]);
  } finally {
    stopDesktopTestHost();
  }
});

runBigIntBinaryEncryptedSuite({ factory: desktopEncryptedAdapterFactory });
