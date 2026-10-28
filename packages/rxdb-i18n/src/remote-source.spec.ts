import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteMessageEntry } from './entities.js';
import { createRemoteCatalogSource } from './remote-source.js';

const remoteRow: RemoteMessageEntry = {
  id: '["en","app","greeting"]',
  locale: 'en',
  namespace: 'app',
  key: 'greeting',
  value: 'Remote greeting',
  source: 'remote',
  updatedAt: new Date('2026-10-28T00:00:00Z')
};

const monitor = () => {
  const wakeup = new Subject<void>();
  const unwatch = vi.fn();
  const watch = vi.fn(() => unwatch);
  return { wakeup, unwatch, reachability: { wakeup$: wakeup.asObservable(), watch } };
};

describe('可选远端目录生命周期', () => {
  it('空远端缓存离线时发出空目录，联网节拍后恢复官方查询', async () => {
    const source = monitor();
    const offline = new TypeError('Failed to fetch');
    const query = vi
      .fn()
      .mockReturnValueOnce(throwError(() => offline))
      .mockReturnValue(of([remoteRow]));
    const local = vi.fn().mockResolvedValue([]);
    const results: RemoteMessageEntry[][] = [];
    const subscription = createRemoteCatalogSource({ query, local, reachability: source.reachability }).subscribe(
      rows => results.push(rows)
    );
    await vi.waitFor(() => expect(results).toEqual([[]]));
    source.wakeup.next();
    expect(results).toEqual([[], [remoteRow]]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(local).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    expect(source.unwatch).toHaveBeenCalledOnce();
  });

  it('网络故障保留已缓存目录，再次离线不会终结外层恢复流', async () => {
    const source = monitor();
    const query = vi.fn(() => throwError(() => Object.assign(new Error('offline'), { code: 'ECONNREFUSED' })));
    const local = vi.fn().mockResolvedValue([remoteRow]);
    const results: RemoteMessageEntry[][] = [];
    const subscription = createRemoteCatalogSource({ query, local, reachability: source.reachability }).subscribe(
      rows => results.push(rows)
    );
    await vi.waitFor(() => expect(results).toHaveLength(1));
    source.wakeup.next();
    await vi.waitFor(() => expect(results).toHaveLength(2));
    expect(results.every(rows => rows[0] === remoteRow)).toBe(true);
    expect(subscription.closed).toBe(false);
    subscription.unsubscribe();
  });

  it('鉴权与其他业务错误不读取目录缓存，原错误仍终结查询', () => {
    const source = monitor();
    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 });
    const local = vi.fn().mockResolvedValue([]);
    const error = vi.fn();
    const subscription = createRemoteCatalogSource({
      query: () => throwError(() => unauthorized),
      local,
      reachability: source.reachability
    }).subscribe({ error });
    expect(error).toHaveBeenCalledExactlyOnceWith(unauthorized);
    expect(local).not.toHaveBeenCalled();
    expect(subscription.closed).toBe(true);
    expect(source.unwatch).toHaveBeenCalledOnce();
  });

  it('本地读取错误不会被当成离线成功', async () => {
    const source = monitor();
    const failure = new Error('Storage read failed');
    const error = vi.fn();
    const subscription = createRemoteCatalogSource({
      query: () => throwError(() => new TypeError('Failed to fetch')),
      local: () => Promise.reject(failure),
      reachability: source.reachability
    }).subscribe({ error });
    await vi.waitFor(() => expect(error).toHaveBeenCalledExactlyOnceWith(failure));
    expect(subscription.closed).toBe(true);
    expect(source.unwatch).toHaveBeenCalledOnce();
  });

  it('销毁时释放查询及可达性监视，不再响应后续节拍', () => {
    const source = monitor();
    const pending = new Subject<RemoteMessageEntry[]>();
    const query = vi.fn(() => pending.asObservable());
    const subscription = createRemoteCatalogSource({
      query,
      local: async () => [],
      reachability: source.reachability
    }).subscribe();
    expect(pending.observed).toBe(true);
    subscription.unsubscribe();
    expect(pending.observed).toBe(false);
    expect(source.unwatch).toHaveBeenCalledOnce();
    source.wakeup.next();
    expect(query).toHaveBeenCalledOnce();
  });
});
