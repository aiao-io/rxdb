/**
 * US-217 阶段 C AC#9：Electron SQLite host 的备份 / 恢复新增峰值内存。
 *
 * @remarks
 * 与备份共享套件分开跑：两档库各要起两个子进程 host、写几十 MB，放在一起会拖慢整批套件。
 */
import { backupMemorySuite } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { afterAll, expect } from 'vitest';
import { electronSqliteBackupHarness, stopElectronBackupHost } from './electron-sqlite-backup-harness.js';

afterAll(async () => {
  expect(await stopElectronBackupHost()).toEqual({ output: '', deliveryErrors: [] });
});

backupMemorySuite(electronSqliteBackupHarness);
