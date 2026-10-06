import { describe, expect, it, vi } from 'vitest';
import { LifecycleScopeDisposedError } from '../../lifecycle/lifecycle-scope.interface.js';
import { LifecycleScope } from '../../lifecycle/lifecycle-scope.js';

describe('LifecycleScope 获取过程关闭的资源归属', () => {
  it('setup 同步关闭 scope 后仍释放刚取得的资源', async () => {
    const scope = new LifecycleScope('close-during-setup');
    const cleanup = vi.fn();
    let closing: Promise<void> | undefined;

    try {
      scope.acquire(() => {
        closing = scope.dispose();
        return cleanup;
      }, 'late-resource');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LifecycleScopeDisposedError);
    }

    await closing;
    await scope.dispose();
    expect(scope.state).toBe('disposed');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('普通获取后重复 dispose 不重复释放', async () => {
    const scope = new LifecycleScope('normal');
    const cleanup = vi.fn();
    scope.acquire(() => cleanup, 'resource');

    const first = scope.dispose();
    expect(scope.dispose()).toBe(first);
    await first;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
