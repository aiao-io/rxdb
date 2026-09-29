/**
 * @fileoverview US-217 备份错误：稳定 code、结构化细节、原因链。
 */

import { describe, expect, it } from 'vitest';
import { RxDBBackupError, isRxDBBackupError } from '../../backup/backup-error.js';
import { RxDBError } from '../../RxDBError.js';

describe('RxDBBackupError', () => {
  it('是 RxDBError 子类，携带 code / details / cause', () => {
    const cause = new Error('root');
    const error = new RxDBBackupError('incompatible_archive', 'bad', {
      details: { field: 'x', expected: 1, actual: 2 },
      cause
    });
    expect(error).toBeInstanceOf(RxDBError);
    expect(error).toBeInstanceOf(RxDBBackupError);
    expect(error.name).toBe('RxDBBackupError');
    expect(error.code).toBe('incompatible_archive');
    expect(error.details).toEqual({ field: 'x', expected: 1, actual: 2 });
    expect(error.cause).toBe(cause);
  });

  it('未给细节与原因时细节为空对象、不设 cause', () => {
    const error = new RxDBBackupError('aborted', 'stop');
    expect(error.details).toEqual({});
    expect('cause' in error).toBe(false);
  });

  it('isRxDBBackupError 按类型与 code 判别', () => {
    const error = new RxDBBackupError('target_busy', 'busy');
    expect(isRxDBBackupError(error)).toBe(true);
    expect(isRxDBBackupError(error, 'target_busy')).toBe(true);
    expect(isRxDBBackupError(error, 'target_not_empty')).toBe(false);
    expect(isRxDBBackupError(new RxDBError('x'))).toBe(false);
    expect(isRxDBBackupError('target_busy')).toBe(false);
  });
});
