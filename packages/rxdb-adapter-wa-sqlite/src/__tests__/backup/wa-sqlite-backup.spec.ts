/**
 * US-217 阶段 B：wa-sqlite 在内存与 IndexedDB 存储上跑备份共享套件。
 */
import {
  backupConcurrencySuite,
  backupEncryptionSuite,
  backupFailureSuite,
  backupInterruptSuite,
  backupRoundtripSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { waSqliteBackupHarness } from './wa-sqlite-backup-harness.js';

backupRoundtripSuite(waSqliteBackupHarness);
backupConcurrencySuite(waSqliteBackupHarness);
backupEncryptionSuite(waSqliteBackupHarness);
backupFailureSuite(waSqliteBackupHarness);
backupInterruptSuite(waSqliteBackupHarness);
