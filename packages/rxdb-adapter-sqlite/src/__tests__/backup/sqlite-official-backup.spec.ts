/**
 * US-217 阶段 B：官方 sqlite 在内存与 OPFS 存储上跑备份共享套件。
 */
import {
  backupConcurrencySuite,
  backupEncryptionSuite,
  backupFailureSuite,
  backupInterruptSuite,
  backupRoundtripSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { sqliteOfficialBackupHarness } from './sqlite-official-backup-harness.js';

backupRoundtripSuite(sqliteOfficialBackupHarness);
backupConcurrencySuite(sqliteOfficialBackupHarness);
backupEncryptionSuite(sqliteOfficialBackupHarness);
backupFailureSuite(sqliteOfficialBackupHarness);
backupInterruptSuite(sqliteOfficialBackupHarness);
