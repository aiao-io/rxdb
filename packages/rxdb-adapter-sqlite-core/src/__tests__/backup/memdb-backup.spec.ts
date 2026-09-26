/**
 * US-217 阶段 B：共享备份套件在 sqlite-core 自己的 memdb 后端上跑一遍，
 * 四个真实 adapter 各自再用自己的存储跑同一组套件。
 */
import { backupConcurrencySuite } from '../shared-backup-concurrency.suite.js';
import { backupEncryptionSuite } from '../shared-backup-encryption.suite.js';
import { backupFailureSuite } from '../shared-backup-failure.suite.js';
import { backupInterruptSuite } from '../shared-backup-interrupt.suite.js';
import { backupRoundtripSuite } from '../shared-backup-roundtrip.suite.js';
import { memdbBackupHarness } from './memdb-harness.js';

backupRoundtripSuite(memdbBackupHarness);
backupConcurrencySuite(memdbBackupHarness);
backupEncryptionSuite(memdbBackupHarness);
backupFailureSuite(memdbBackupHarness);
backupInterruptSuite(memdbBackupHarness);
