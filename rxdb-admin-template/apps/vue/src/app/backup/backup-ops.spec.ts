import { RxDBBackupError } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageEnMessages, pageZhMessages } from '../i18n/page-messages';
import {
  backupDownloadName,
  backupErrorMessage,
  collectBackup,
  downloadBlob,
  RESTORE_TARGET_INITIALIZED_MESSAGE
} from './backup-ops';

const runtime = new I18n({
  locale: 'zh-Hans',
  namespace: 'workbench',
  catalogs: [
    { locale: 'zh-Hans', namespace: 'workbench', messages: pageZhMessages },
    { locale: 'en', namespace: 'workbench', messages: pageEnMessages }
  ]
});
const errorMessage = (error: unknown): string => backupErrorMessage(error, runtime.t);

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

  it('下载文件名可使用当前语言的前缀', () => {
    expect(backupDownloadName(new Date(2026, 0, 5, 9, 7), 'workbench-backup')).toBe(
      'workbench-backup-20260105-0907.rxdb-backup'
    );
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('隐藏的锚点挂进文档后才点击，点击后立即移除', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:workbench-backup');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicks: { connected: boolean; hidden: boolean | string; href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ connected: this.isConnected, hidden: this.hidden, href: this.href, download: this.download });
    });

    downloadBlob(new Blob(['x']), 'backup.rxdb-backup');

    expect(clicks).toEqual([
      { connected: true, hidden: true, href: 'blob:workbench-backup', download: 'backup.rxdb-backup' }
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('blob 地址 1 秒后才回收，避免部分浏览器中断异步读取', () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:workbench-backup');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadBlob(new Blob(['x']), 'backup.rxdb-backup');

    vi.advanceTimersByTime(999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:workbench-backup');
  });
});

describe('backupErrorMessage', () => {
  it('备份错误按 code 给出可读原因', () => {
    expect(errorMessage(new RxDBBackupError('storage_full', 'no space'))).toBe('存储空间不足，无法完成备份');
    expect(errorMessage(new RxDBBackupError('corrupt_archive', 'bad frame'))).toBe(
      '归档文件损坏或不是有效的工作台备份'
    );
    expect(errorMessage(new RxDBBackupError('target_busy', 'has data'))).toBe(RESTORE_TARGET_INITIALIZED_MESSAGE);
    expect(errorMessage(new RxDBBackupError('target_not_empty', 'initialized'))).toBe(
      RESTORE_TARGET_INITIALIZED_MESSAGE
    );
    expect(errorMessage(new RxDBBackupError('unsupported_combination', 'opfs'))).toBe(
      '当前存储组合不支持备份 / 恢复（浏览器下仅 IndexedDB 存储支持）'
    );
  });

  it('归档属于另一个账号时单独说明：别的账号的备份不能恢复到当前账号（ADMIN-US-222，平台 US-040）', async () => {
    const foreign = new RxDBBackupError('incompatible_archive', 'Backup archive belongs to another identity', {
      details: { field: 'identity' }
    });
    expect(errorMessage(foreign)).toBe('这份备份属于另一个账号，不能恢复到当前账号的本机库');
    expect(errorMessage(new RxDBBackupError('incompatible_archive', 'schema'))).toBe('归档与当前工作台版本不兼容');
    await runtime.setLocale('en');
    try {
      expect(errorMessage(foreign)).toBe(
        "This backup belongs to another account and can't be restored into the current account's local database."
      );
    } finally {
      await runtime.setLocale('zh-Hans');
    }
  });

  it('带 message 的 Error 把原文放进失败文案，非 Error 值使用通用的未知原因文案', () => {
    expect(errorMessage(new Error('boom'))).toBe('操作失败：boom');
    expect(errorMessage('what')).toBe('操作失败，原因未知');
  });

  it('英文错误保留原始错误信息，已知错误按 code 翻译', async () => {
    await runtime.setLocale('en');
    try {
      expect(errorMessage(new RxDBBackupError('corrupt_archive', 'bad frame'))).toBe(
        'The archive is damaged or is not a valid workbench backup.'
      );
      expect(errorMessage(new Error('connection lost'))).toBe('Operation failed: connection lost');
      expect(errorMessage(undefined)).toBe('The operation failed for an unknown reason.');
    } finally {
      await runtime.setLocale('zh-Hans');
    }
  });
});
