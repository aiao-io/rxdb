/**
 * 桌面 PGlite 备份 / 恢复的错误归一（US-217）。
 *
 * @module pglite/electron-pglite-backup-error
 */

import { RxDBBackupError, type RxDBBackupErrorCode, type RxDBBackupErrorDetails } from '@aiao/rxdb';
import {
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  RxDBAdapterDesktopError,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

/** 备份读源库，恢复写目标库；同一个桌面错误码在两个方向上的归因不同。 */
export type ElectronPGliteBackupDirection = 'backup' | 'restore';

/** 这些码说的都是「数据目录此刻的状态」，`details` 指向目录名，调用方据此决定清理、等待还是换目标。 */
const TARGET_STATE_CODES = new Map<RxDBAdapterDesktopErrorCode, RxDBBackupErrorCode>([
  ['database_busy', 'target_busy'],
  ['restore_in_progress', 'restore_in_progress'],
  ['restore_incomplete', 'restore_incomplete'],
  ['target_not_empty', 'target_not_empty'],
  ['cleanup_pending', 'cleanup_pending']
]);

/** 这一侧的 host 或运行环境根本做不了这件事：重试无用，换组合才行。 */
const UNSUPPORTED_CODES: ReadonlySet<RxDBAdapterDesktopErrorCode> = new Set([
  'unsupported_runtime_engine',
  'invalid_database_name',
  'unsupported_operation'
]);

const targetStateMessage = (code: RxDBBackupErrorCode, name: string): string => {
  switch (code) {
    case 'target_busy':
      return `Desktop PGlite data directory "${name}" is open in another connection or being restored`;
    case 'restore_in_progress':
      return `Desktop PGlite data directory "${name}" is being restored`;
    case 'restore_incomplete':
      return `A previous restore into "${name}" did not finish; call cleanupIncompleteElectronPGliteRestore()`;
    case 'target_not_empty':
      return `Desktop PGlite data directory "${name}" already holds a database`;
    default:
      return `Failed to clean up the incomplete restore of "${name}"; call cleanupIncompleteElectronPGliteRestore()`;
  }
};

const generalCode = (
  code: RxDBAdapterDesktopErrorCode,
  direction: ElectronPGliteBackupDirection
): RxDBBackupErrorCode => {
  if (UNSUPPORTED_CODES.has(code)) return 'unsupported_combination';
  switch (code) {
    case 'disk_full':
      return 'storage_full';
    case 'transaction_unavailable':
      return 'lock_timeout';
    case 'session_closed':
      return 'invalid_state';
    case 'database_corrupted':
      // 恢复时坏的是归档写出来的目录；备份时坏的是源库，归档还没写出来，不能让人去怀疑它。
      return direction === 'restore' ? 'corrupt_archive' : 'io_error';
    default:
      return 'io_error';
  }
};

const fromDesktopError = (
  error: RxDBAdapterDesktopError,
  name: string,
  direction: ElectronPGliteBackupDirection
): RxDBBackupError => {
  const targetState = TARGET_STATE_CODES.get(error.code);
  if (targetState !== undefined) {
    const details: RxDBBackupErrorDetails = { field: 'dataDirectoryName', actual: name };
    return new RxDBBackupError(targetState, targetStateMessage(targetState, name), { details, cause: error });
  }
  if (error.code === 'protocol_violation') {
    return new RxDBBackupError('unsupported_combination', `The desktop host does not speak this renderer's protocol`, {
      details: { field: 'protocolVersion', expected: DESKTOP_PGLITE_PROTOCOL_VERSION },
      cause: error
    });
  }
  return new RxDBBackupError(
    generalCode(error.code, direction),
    `Desktop PGlite ${direction} failed: ${error.detail}`,
    {
      cause: error
    }
  );
};

/**
 * 把桌面 PGlite 备份 / 恢复途中的任意失败归一成 {@link RxDBBackupError}。
 *
 * @remarks
 * 备份与恢复的公共契约只认 `RxDBBackupError.code`；桌面错误码属于 host 线协议，漏到调用方手里，
 * 按契约写的 `switch (error.code)` 就会静默落进 default。已经是 `RxDBBackupError` 的原样返回；
 * 其余一律带着原始错误作为 `cause`：
 *
 * | 桌面错误码 | 备份契约 |
 * | --- | --- |
 * | `database_busy` | `target_busy` |
 * | `restore_in_progress` / `restore_incomplete` / `target_not_empty` / `cleanup_pending` | 同名码 |
 * | `protocol_violation` | `unsupported_combination`（`details.field` 为 `protocolVersion`） |
 * | `unsupported_operation` / `unsupported_runtime_engine` / `invalid_database_name` | `unsupported_combination` |
 * | `disk_full` | `storage_full` |
 * | `transaction_unavailable` | `lock_timeout` |
 * | `session_closed` | `invalid_state` |
 * | `database_corrupted` | 恢复为 `corrupt_archive`，备份为 `io_error` |
 * | 其余桌面错误及非桌面错误 | `io_error` |
 *
 * 目标状态类的码（前两行）`details` 为 `{ field: 'dataDirectoryName', actual: 目录名 }`。
 *
 * @param error - 捕获到的任意值
 * @param dataDirectoryName - 本次操作的数据目录名
 * @param direction - 发生在备份还是恢复
 * @returns 归一后的备份错误
 */
export const toElectronPGliteBackupError = (
  error: unknown,
  dataDirectoryName: string,
  direction: ElectronPGliteBackupDirection
): RxDBBackupError => {
  if (error instanceof RxDBBackupError) return error;
  if (error instanceof RxDBAdapterDesktopError) return fromDesktopError(error, dataDirectoryName, direction);
  return new RxDBBackupError('io_error', `Desktop PGlite ${direction} failed`, { cause: error });
};
