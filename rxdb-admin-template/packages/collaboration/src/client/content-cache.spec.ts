import { describe, expect, it, vi } from 'vitest';
import { CollaborationError } from '../model.js';
import { ContentCache } from './content-cache.js';

/** 手动结算的加载：用来在请求进行中检查去重与失效。 */
function deferred() {
  const requests: { key: string; resolve: (value: string) => void; reject: (error: unknown) => void }[] = [];
  const fetch = vi.fn(
    (key: string) =>
      new Promise<string>((resolve, reject) => {
        requests.push({ key, resolve, reject });
      })
  );
  return { fetch, requests };
}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function setup() {
  const source = deferred();
  const loaded = vi.fn();
  const failed = vi.fn();
  const cache = new ContentCache<string>(source.fetch, loaded, failed);
  return { ...source, loaded, failed, cache };
}

describe('on-demand content cache', () => {
  it('returns undefined on a miss, loads once in the background and then serves the hit synchronously', async () => {
    const { cache, fetch, requests, loaded } = setup();
    expect(cache.peek('a')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('a');
    expect(loaded).not.toHaveBeenCalled();
    requests[0].resolve('content');
    await settle();
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(cache.peek('a')).toBe('content');
    expect(cache.peek('a')).toBe('content');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('sends a single request for concurrent reads of the same key, from any entry point', async () => {
    const { cache, fetch, requests } = setup();
    cache.peek('a');
    cache.peek('a');
    const first = cache.load('a');
    const second = cache.load('a');
    cache.peek('a');
    expect(fetch).toHaveBeenCalledTimes(1);
    requests[0].resolve('shared');
    await expect(Promise.all([first, second])).resolves.toEqual(['shared', 'shared']);
    expect(cache.peek('a')).toBe('shared');
    cache.peek('b');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith('b');
  });
  it('notifies once per finished load, including loads started by a user operation', async () => {
    const { cache, requests, loaded } = setup();
    const pending = cache.load('a');
    requests[0].resolve('done');
    await pending;
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(await cache.load('a')).toBe('done');
    expect(loaded).toHaveBeenCalledTimes(1);
  });
  it('records a failure once and never retries a failed key on its own', async () => {
    const { cache, fetch, requests, failed, loaded } = setup();
    expect(cache.peek('a')).toBeUndefined();
    const error = new CollaborationError('internal', 'down');
    requests[0].reject(error);
    await settle();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledWith(error);
    expect(loaded).not.toHaveBeenCalled();
    for (let index = 0; index < 5; index++) expect(cache.peek('a')).toBeUndefined();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('retries a failed key on the next explicit retry, and a user operation always tries again', async () => {
    const { cache, fetch, requests } = setup();
    cache.peek('a');
    requests[0].reject(new Error('down'));
    await settle();
    cache.retry();
    expect(cache.peek('a')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    requests[1].reject(new Error('still down'));
    await settle();
    expect(cache.peek('a')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    const operation = cache.load('a');
    expect(fetch).toHaveBeenCalledTimes(3);
    requests[2].resolve('back');
    await expect(operation).resolves.toBe('back');
    expect(cache.peek('a')).toBe('back');
  });
  it('rejects a failed user load for its caller and keeps the key blocked for background reads', async () => {
    const { cache, fetch, requests, failed } = setup();
    const operation = cache.load('a');
    requests[0].reject(new Error('down'));
    await expect(operation).rejects.toThrow('down');
    expect(cache.peek('a')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(failed).not.toHaveBeenCalled();
  });
  it('drops results that arrive after a reset and does not report them as failures', async () => {
    const { cache, fetch, requests, loaded, failed } = setup();
    const stale = cache.load('a');
    const outcome = stale.then(
      () => 'stored',
      (error: CollaborationError) => error.code
    );
    cache.reset();
    requests[0].resolve('old workspace');
    expect(await outcome).toBe('cancelled');
    expect(loaded).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(cache.peek('a')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    requests[1].resolve('new workspace');
    await settle();
    expect(cache.peek('a')).toBe('new workspace');
  });
  it('forgets failures and contents on reset, and ignores failures that arrive after it', async () => {
    const { cache, fetch, requests, failed } = setup();
    cache.peek('a');
    requests[0].resolve('content');
    await settle();
    cache.peek('b');
    cache.reset();
    requests[1].reject(new Error('late failure'));
    await settle();
    expect(failed).not.toHaveBeenCalled();
    expect(cache.peek('a')).toBeUndefined();
    expect(cache.peek('b')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('treats an empty string as a normal cached value', async () => {
    const { cache, fetch, requests } = setup();
    cache.peek('a');
    requests[0].resolve('');
    await settle();
    expect(cache.peek('a')).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
