import { describe, expect, it, vi } from 'vitest';
import { initializeSearchRecords, runExclusive } from './search-lifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('runExclusive', () => {
  it('rejects a second action before React can re-render', async () => {
    const lock = { current: false };
    const pending = deferred<string>();
    const action = vi.fn(() => pending.promise);

    const first = runExclusive(lock, action);
    const second = await runExclusive(lock, action);

    expect(second).toBeUndefined();
    expect(action).toHaveBeenCalledOnce();
    pending.resolve('done');
    await expect(first).resolves.toBe('done');
    expect(lock.current).toBe(false);
  });

  it('releases the lock after failure', async () => {
    const lock = { current: false };

    await expect(runExclusive(lock, () => Promise.reject(new Error('failed')))).rejects.toThrow('failed');
    await expect(runExclusive(lock, () => Promise.resolve('retry'))).resolves.toBe('retry');
  });
});

describe('initializeSearchRecords', () => {
  it('commits existing records when still active', async () => {
    const commit = vi.fn();
    const seed = vi.fn();

    await initializeSearchRecords({
      loadArticles: () => Promise.resolve(['article']),
      loadComments: () => Promise.resolve(['comment']),
      seed,
      commit,
      isCancelled: () => false
    });

    expect(commit).toHaveBeenCalledWith(['article'], ['comment']);
    expect(seed).not.toHaveBeenCalled();
  });

  it('stops after article loading when cancelled', async () => {
    let cancelled = false;
    const loadComments = vi.fn(() => Promise.resolve(['comment']));
    const commit = vi.fn();
    const articles = deferred<string[]>();
    const initialization = initializeSearchRecords({
      loadArticles: () => articles.promise,
      loadComments,
      seed: vi.fn(),
      commit,
      isCancelled: () => cancelled
    });

    cancelled = true;
    articles.resolve(['article']);
    await initialization;

    expect(loadComments).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops after comment loading when cancelled', async () => {
    let cancelled = false;
    const comments = deferred<string[]>();
    const commit = vi.fn();
    const initialization = initializeSearchRecords({
      loadArticles: () => Promise.resolve(['article']),
      loadComments: () => comments.promise,
      seed: vi.fn(),
      commit,
      isCancelled: () => cancelled
    });

    await Promise.resolve();
    cancelled = true;
    comments.resolve(['comment']);
    await initialization;

    expect(commit).not.toHaveBeenCalled();
  });

  it('delegates empty initialization to cancellation-aware seed', async () => {
    const seed = vi.fn(() => Promise.resolve());
    const isCancelled = vi.fn(() => false);

    await initializeSearchRecords({
      loadArticles: () => Promise.resolve([]),
      loadComments: () => Promise.resolve([]),
      seed,
      commit: vi.fn(),
      isCancelled
    });

    expect(seed).toHaveBeenCalledWith(isCancelled);
  });
});
