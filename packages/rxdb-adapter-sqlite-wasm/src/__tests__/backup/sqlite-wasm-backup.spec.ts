/**
 * US-217 阶段 B：sqlite-wasm 在内存与 IndexedDB 存储上跑备份共享套件。
 */
import {
  backupConcurrencySuite,
  backupEncryptionSuite,
  backupFailureSuite,
  backupInterruptSuite,
  backupRoundtripSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { sqliteWasmBackupHarness } from './sqlite-wasm-backup-harness.js';

backupRoundtripSuite(sqliteWasmBackupHarness);
backupConcurrencySuite(sqliteWasmBackupHarness);
backupEncryptionSuite(sqliteWasmBackupHarness);
backupFailureSuite(sqliteWasmBackupHarness);
backupInterruptSuite(sqliteWasmBackupHarness);
