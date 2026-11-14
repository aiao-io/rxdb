import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCK_RETRY_DELAYS, isLockContention, retryOnLockContention } from './lock-retry';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const busy = (): Error => new Error('sqlite-wasm execute() failed for SQL "SELECT 1": database is locked');
const handle = (): Error =>
  new Error(
    "sqlite-wasm execute() failed for SQL \"SELECT 1\": Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file."
  );

describe('isLockContention', () => {
  it('认得库文件被别的连接占着的几种报错：SQLITE_BUSY 与同步访问句柄拿不到', () => {
    expect(isLockContention(busy())).toBe(true);
    expect(isLockContention(handle())).toBe(true);
    expect(isLockContention(new DOMException('held', 'NoModificationAllowedError'))).toBe(true);
    expect(isLockContention(new Error('SQLITE_BUSY: database is locked'))).toBe(true);
  });

  it('适配器把浏览器的错误包了一层：看 cause 链上的名字（Safari 的措辞里没有 createSyncAccessHandle）', () => {
    const inner = new DOMException('The object can not be modified in this way.', 'NoModificationAllowedError');
    const wrapped = new Error(
      'sqlite-wasm execute() failed for SQL "SELECT 1": The object can not be modified in this way.',
      {
        cause: inner
      }
    );
    expect(isLockContention(wrapped)).toBe(true);
    expect(isLockContention(new Error('outer', { cause: new Error('UNIQUE constraint failed') }))).toBe(false);
    const deep = new Error('a', {
      cause: new Error('b', { cause: new Error('c', { cause: new Error('d', { cause: busy() }) }) })
    });
    expect(isLockContention(deep)).toBe(false);
  });

  it('别的错误一律不算：约束冲突、语法错误、不是 Error 的值', () => {
    expect(isLockContention(new Error('UNIQUE constraint failed: index idx'))).toBe(false);
    expect(isLockContention(new Error('no such table: note'))).toBe(false);
    expect(isLockContention('database is locked')).toBe(false);
    expect(isLockContention(undefined)).toBe(false);
  });
});

describe('retryOnLockContention', () => {
  it('第一次就成功：不等待，结果原样返回', async () => {
    const run = vi.fn(async () => 'ok');
    await expect(retryOnLockContention(run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('碰上别的连接占着库文件：按退避间隔重试，拿到之后返回结果', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(busy())
      .mockRejectedValueOnce(handle())
      .mockResolvedValue('ok');
    const result = retryOnLockContention(run);
    await vi.advanceTimersByTimeAsync(LOCK_RETRY_DELAYS[0]);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(LOCK_RETRY_DELAYS[1]);
    await expect(result).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('不是锁的错误立刻抛出，不重试', async () => {
    const failure = new Error('UNIQUE constraint failed: index idx');
    const run = vi.fn(async () => {
      throw failure;
    });
    await expect(retryOnLockContention(run)).rejects.toBe(failure);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('一直占着就在重试用完之后把最后一次的错误原样抛出，不无限等下去', async () => {
    const last = busy();
    const run = vi.fn<() => Promise<string>>().mockRejectedValue(last);
    const settled = retryOnLockContention(run).then(
      () => 'resolved',
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(LOCK_RETRY_DELAYS.reduce((sum, delay) => sum + delay, 0));
    expect(await settled).toBe(last);
    expect(run).toHaveBeenCalledTimes(LOCK_RETRY_DELAYS.length + 1);
  });

  it('可以换一份更短的退避间隔（单测与调用方自己的预算）', async () => {
    const run = vi.fn<() => Promise<string>>().mockRejectedValueOnce(busy()).mockResolvedValue('ok');
    const result = retryOnLockContention(run, [5]);
    await vi.advanceTimersByTimeAsync(5);
    await expect(result).resolves.toBe('ok');
  });
});
