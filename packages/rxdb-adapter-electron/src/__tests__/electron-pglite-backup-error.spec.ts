/**
 * 桌面 PGlite 备份 / 恢复的错误归一（US-217 阶段 C）。
 *
 * @remarks
 * 备份与恢复的公共契约只认 {@link RxDBBackupError} 的 `code`。桌面错误码是 host 线协议的一部分，
 * 原样漏到调用方手里，`switch (error.code)` 就会静默落进 default。这里逐码钉住映射：
 * 新增桌面错误码而忘了在映射表里安排，`it.each` 的完整性断言会先红。
 */

import { RxDBBackupError, type RxDBBackupErrorCode, type RxDBBackupErrorDetails } from '@aiao/rxdb';
import {
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  RxDBAdapterDesktopError,
  isRxDBAdapterDesktopErrorCode,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { describe, expect, it } from 'vitest';
import { toElectronPGliteBackupError } from '../pglite/electron-pglite-backup-error.js';

const NAME = 'todo-pgdata';

const directory: RxDBBackupErrorDetails = { field: 'dataDirectoryName', actual: NAME };
const protocol: RxDBBackupErrorDetails = { field: 'protocolVersion', expected: DESKTOP_PGLITE_PROTOCOL_VERSION };

type Expectation = readonly [
  desktop: RxDBAdapterDesktopErrorCode,
  backup: RxDBBackupErrorCode,
  restore: RxDBBackupErrorCode,
  details: RxDBBackupErrorDetails
];

const EXPECTATIONS: readonly Expectation[] = [
  ['unsupported_runtime_engine', 'unsupported_combination', 'unsupported_combination', {}],
  ['invalid_database_name', 'unsupported_combination', 'unsupported_combination', {}],
  ['host_unavailable', 'io_error', 'io_error', {}],
  ['session_closed', 'invalid_state', 'invalid_state', {}],
  ['protocol_violation', 'unsupported_combination', 'unsupported_combination', protocol],
  ['open_failed', 'io_error', 'io_error', {}],
  ['permission_denied', 'io_error', 'io_error', {}],
  // 同一个码两个方向含义不同：恢复时是归档写出来的目录不可用，备份时是源库本身坏了——
  // 后者不是调用方给的输入有问题，报 corrupt_archive 会让人去怀疑一份根本还没写出来的归档。
  ['database_corrupted', 'io_error', 'corrupt_archive', {}],
  ['statement_failed', 'io_error', 'io_error', {}],
  ['host_internal_error', 'io_error', 'io_error', {}],
  ['database_busy', 'target_busy', 'target_busy', directory],
  ['file_not_found', 'io_error', 'io_error', {}],
  ['invalid_file_path', 'io_error', 'io_error', {}],
  ['disk_full', 'storage_full', 'storage_full', {}],
  ['write_aborted', 'io_error', 'io_error', {}],
  ['transaction_not_found', 'io_error', 'io_error', {}],
  ['transaction_unavailable', 'lock_timeout', 'lock_timeout', {}],
  ['restore_in_progress', 'restore_in_progress', 'restore_in_progress', directory],
  ['restore_incomplete', 'restore_incomplete', 'restore_incomplete', directory],
  ['target_not_empty', 'target_not_empty', 'target_not_empty', directory],
  ['cleanup_pending', 'cleanup_pending', 'cleanup_pending', directory],
  ['unsupported_operation', 'unsupported_combination', 'unsupported_combination', {}]
];

describe('toElectronPGliteBackupError', () => {
  it('covers every desktop error code exactly once', () => {
    const codes = EXPECTATIONS.map(([code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every(isRxDBAdapterDesktopErrorCode)).toBe(true);
    // 桌面错误码是只追加的契约；表比 22 个少，说明有新码没安排映射。
    expect(codes).toHaveLength(22);
  });

  it.each(EXPECTATIONS)('maps %s during backup and restore', (desktop, backup, restore, details) => {
    const cause = new RxDBAdapterDesktopError(desktop, 'from the host');
    for (const [operation, code] of [
      ['backup', backup],
      ['restore', restore]
    ] as const) {
      const mapped = toElectronPGliteBackupError(cause, NAME, operation);
      expect(mapped).toBeInstanceOf(RxDBBackupError);
      expect(mapped.code).toBe(code);
      expect(mapped.details).toEqual(details);
      // 原始桌面错误必须留在 cause 上：host 侧的 detail 是排障唯一的线索。
      expect(mapped.cause).toBe(cause);
    }
  });

  it('names the data directory in messages about the target', () => {
    const mapped = toElectronPGliteBackupError(new RxDBAdapterDesktopError('restore_incomplete', 'x'), NAME, 'restore');
    expect(mapped.message).toContain(NAME);
    expect(mapped.message).toContain('cleanupIncompleteElectronPGliteRestore');
  });

  it('passes a backup error through untouched', () => {
    const original = new RxDBBackupError('aborted', 'stopped', { details: { field: 'signal' } });
    expect(toElectronPGliteBackupError(original, NAME, 'backup')).toBe(original);
    expect(toElectronPGliteBackupError(original, NAME, 'restore')).toBe(original);
  });

  it('reports anything else as an I/O failure that keeps its cause', () => {
    const cause = new TypeError('transport exploded');
    for (const operation of ['backup', 'restore'] as const) {
      const mapped = toElectronPGliteBackupError(cause, NAME, operation);
      expect(mapped.code).toBe('io_error');
      expect(mapped.details).toEqual({});
      expect(mapped.cause).toBe(cause);
    }
  });
});
