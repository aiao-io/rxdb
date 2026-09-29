/**
 * US-217 阶段 C：Electron SQLite 在应用数据目录的库文件上跑备份共享套件。
 *
 * @remarks
 * 与 Tauri、wa-sqlite、sqlite-wasm 等后端跑的是同一批套件、同一份断言，只换了 harness。
 */
import {
  backupChannelSuite,
  backupConcurrencySuite,
  backupEncryptionSuite,
  backupFailureSuite,
  backupInterruptSuite,
  backupRoundtripSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { afterAll, expect } from 'vitest';
import { electronSqliteBackupHarness, stopElectronBackupHost } from './electron-sqlite-backup-harness.js';

afterAll(async () => {
  // host 的契约是「`handle()` 永不 reject，错误一律作为协议应答」，子进程输出上任何一个字都是缺陷。
  expect(await stopElectronBackupHost()).toEqual({ output: '', deliveryErrors: [] });
});

backupRoundtripSuite(electronSqliteBackupHarness);
backupConcurrencySuite(electronSqliteBackupHarness);
backupEncryptionSuite(electronSqliteBackupHarness);
backupFailureSuite(electronSqliteBackupHarness);
backupInterruptSuite(electronSqliteBackupHarness);
backupChannelSuite(electronSqliteBackupHarness);
