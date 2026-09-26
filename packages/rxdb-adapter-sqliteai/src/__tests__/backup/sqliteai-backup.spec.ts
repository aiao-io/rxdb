/**
 * US-217 阶段 B：sqliteai 在内存与 OPFS 存储上跑备份共享套件。
 */
import {
  backupConcurrencySuite,
  backupEncryptionSuite,
  backupFailureSuite,
  backupInterruptSuite,
  backupRoundtripSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { sqliteaiBackupHarness } from './sqliteai-backup-harness.js';

backupRoundtripSuite(sqliteaiBackupHarness);
backupConcurrencySuite(sqliteaiBackupHarness);
backupEncryptionSuite(sqliteaiBackupHarness);
backupFailureSuite(sqliteaiBackupHarness);
backupInterruptSuite(sqliteaiBackupHarness);
