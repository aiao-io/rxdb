/**
 * US-217 阶段 C：Tauri SQLite 经真实的 Rust host 进程在库文件上跑备份共享套件。
 *
 * @remarks
 * 与 Electron、wa-sqlite、sqlite-wasm 等后端跑的是同一批套件、同一份断言，只换了 harness。
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
import { stopTauriBackupHost, tauriSqliteBackupHarness } from './tauri-sqlite-backup-harness.js';

afterAll(async () => {
  // Rust 侧的契约是「`handle()` 永不 panic，错误一律作为返回值」，stderr 上任何一个字都是缺陷。
  expect(await stopTauriBackupHost()).toEqual({ stderr: '', deliveryErrors: [] });
});

backupRoundtripSuite(tauriSqliteBackupHarness);
backupConcurrencySuite(tauriSqliteBackupHarness);
backupEncryptionSuite(tauriSqliteBackupHarness);
backupFailureSuite(tauriSqliteBackupHarness);
backupInterruptSuite(tauriSqliteBackupHarness);
backupChannelSuite(tauriSqliteBackupHarness);
