import {
  backupConcurrencySuite,
  backupEncryptionSuite,
  backupFailureSuite,
  backupInterruptSuite,
  backupRoundtripSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { afterEach } from 'vitest';
import { releaseOpfsBackupWorkers, sqliteWasmOpfsBackupHarness } from './sqlite-wasm-opfs-backup-harness.js';

backupRoundtripSuite(sqliteWasmOpfsBackupHarness);
backupConcurrencySuite(sqliteWasmOpfsBackupHarness);
backupEncryptionSuite(sqliteWasmOpfsBackupHarness);
backupFailureSuite(sqliteWasmOpfsBackupHarness);
backupInterruptSuite(sqliteWasmOpfsBackupHarness);

afterEach(() => releaseOpfsBackupWorkers());
