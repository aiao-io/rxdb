/**
 * US-207 AC#2：桌面适配器上 keyring 的解锁 / 上锁生命周期契约。
 *
 * @remarks
 * AC#2 点名的「加密字段解锁」正是这一套 —— 其余四套是它的上下文。
 *
 * @module __tests__/encrypted-lifecycle
 */

import { runLifecycleSuite } from '@aiao/rxdb-test/encrypted';
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

runLifecycleSuite({
  factory: electronEncryptedAdapterFactory,
  readDatabaseFile: readElectronDatabaseFile
});
