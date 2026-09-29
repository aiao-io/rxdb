/**
 * US-217 阶段 C AC#9：Tauri SQLite 的 Rust host 备份 / 恢复新增峰值内存。
 *
 * @remarks
 * 与备份共享套件分开跑：两档库各要起两个 Rust host 进程、写几十 MB，放在一起会拖慢整批套件。
 * host 的峰值探针走 `getrusage`，只在 unix 上实现；Windows 上整组跳过而不是报协议错误。
 */
import { backupMemorySuite } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { afterAll, describe, expect } from 'vitest';
import { stopTauriBackupHost, tauriSqliteBackupHarness } from './tauri-sqlite-backup-harness.js';

afterAll(async () => {
  expect(await stopTauriBackupHost()).toEqual({ stderr: '', deliveryErrors: [] });
});

describe.skipIf(process.platform === 'win32')('Tauri SQLite host (peak RSS probe is unix-only)', () => {
  backupMemorySuite(tauriSqliteBackupHarness);
});
