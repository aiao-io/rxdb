import { describe, expect, it } from 'vitest';
import { PlatformSubmission } from './platform-submission';

describe('平台接单回执丢失', () => {
  it('刷新后重用原请求标识和参数，账号与工作区各自隔离', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key)
    };
    const journal = new PlatformSubmission(storage, 'alice', 'workspace');
    const first = journal.prepare({ model: 'one', prompt: 'first', size: '1024x1024', billing: 'free' });
    const reloaded = new PlatformSubmission(storage, 'alice', 'workspace');
    expect(reloaded.prepare({ model: 'two', prompt: 'changed', size: '1024x1024', billing: 'credits' })).toEqual(first);
    expect(new PlatformSubmission(storage, 'bob', 'workspace').pending()).toBeNull();
    expect(new PlatformSubmission(storage, 'alice', 'other').pending()).toBeNull();
    reloaded.confirm(first.requestId);
    expect(journal.pending()).toBeNull();
    expect(journal.prepare({ model: 'two', prompt: 'next', size: '1024x1024', billing: 'free' }).requestId).not.toBe(
      first.requestId
    );
  });
  it('存储损坏时拒绝创建新标识，避免静默重复收费', () => {
    const storage = { getItem: () => '{}', setItem: () => undefined, removeItem: () => undefined };
    expect(() => new PlatformSubmission(storage, 'a', 'b').pending()).toThrow('未确认');
  });
});
