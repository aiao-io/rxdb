/**
 * @fileoverview US-217 备份 / 恢复的跨上下文锁：立即尝试、拿不到不排队、释放幂等。
 */

import { describe, expect, it } from 'vitest';
import { hasRxDBBackupWebLocks, tryAcquireRxDBBackupLock } from '../../backup/backup-lock.js';

const lockName = (): string => `rxdb-backup-lock-spec:${crypto.randomUUID()}`;

describe('tryAcquireRxDBBackupLock', () => {
  it('浏览器环境提供 Web Locks', () => {
    expect(hasRxDBBackupWebLocks()).toBe(true);
  });

  it('独占锁被占时立即返回 null，释放后可再获取', async () => {
    const name = lockName();
    const first = await tryAcquireRxDBBackupLock(name, 'exclusive');
    expect(first).not.toBeNull();
    await expect(tryAcquireRxDBBackupLock(name, 'exclusive')).resolves.toBeNull();
    await expect(tryAcquireRxDBBackupLock(name, 'shared')).resolves.toBeNull();
    await first?.release();
    await first?.release();
    const second = await tryAcquireRxDBBackupLock(name, 'exclusive');
    expect(second).not.toBeNull();
    await second?.release();
  });

  it('共享锁之间互不阻塞，但挡住独占锁', async () => {
    const name = lockName();
    const a = await tryAcquireRxDBBackupLock(name, 'shared');
    const b = await tryAcquireRxDBBackupLock(name, 'shared');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    await expect(tryAcquireRxDBBackupLock(name, 'exclusive')).resolves.toBeNull();
    await a?.release();
    await b?.release();
    const exclusive = await tryAcquireRxDBBackupLock(name, 'exclusive');
    expect(exclusive).not.toBeNull();
    await exclusive?.release();
  });
});
