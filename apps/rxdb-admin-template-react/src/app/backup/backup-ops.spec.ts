import { RxDBBackupError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  backupDownloadName,
  backupErrorMessage,
  collectBackup,
  RESTORE_TARGET_INITIALIZED_MESSAGE
} from './backup-ops';

describe('collectBackup', () => {
  it('把备份流的所有字节块拼成归档 Blob，并带回摘要', async () => {
    const payload = new TextEncoder().encode('hello workbench');
    const adapter = {
      backup: async (sink: WritableStream<Uint8Array>) => {
        const writer = sink.getWriter();
        await writer.write(payload.slice(0, 5));
        await writer.write(payload.slice(5));
        await writer.close();
        return { sha256: 'abc123', bytes: payload.length };
      },
      restore: async () => ({ sha256: '' })
    };
    const collected = await collectBackup(adapter);
    expect(new Uint8Array(await collected.blob.arrayBuffer())).toEqual(payload);
    expect(collected.sha256).toBe('abc123');
    expect(collected.bytes).toBe(payload.length);
  });
});

describe('backupDownloadName', () => {
  it('文件名带日期时间戳与固定扩展名', () => {
    expect(backupDownloadName(new Date(2026, 0, 5, 9, 7))).toBe('工作台备份-20260105-0907.rxdb-backup');
  });
});

describe('backupErrorMessage', () => {
  it('备份错误按 code 给出可读原因', () => {
    expect(backupErrorMessage(new RxDBBackupError('storage_full', 'no space'))).toBe('存储空间不足，无法完成备份');
    expect(backupErrorMessage(new RxDBBackupError('corrupt_archive', 'bad frame'))).toBe(
      '归档文件损坏或不是有效的工作台备份'
    );
    expect(backupErrorMessage(new RxDBBackupError('target_busy', 'has data'))).toBe(RESTORE_TARGET_INITIALIZED_MESSAGE);
    expect(backupErrorMessage(new RxDBBackupError('target_not_empty', 'initialized'))).toBe(
      RESTORE_TARGET_INITIALIZED_MESSAGE
    );
    expect(backupErrorMessage(new RxDBBackupError('unsupported_combination', 'opfs'))).toBe(
      '当前存储组合不支持备份 / 恢复（浏览器下仅 IndexedDB 存储支持）'
    );
  });

  it('未知错误兜底为原文或通用文案，不吞掉信息', () => {
    expect(backupErrorMessage(new Error('boom'))).toBe('操作失败：boom');
    expect(backupErrorMessage('what')).toBe('操作失败，原因未知');
  });
});
