import { describe, expect, it, vi } from 'vitest';
import { ConditionalRequestCache, requestFingerprint } from '../conditional-cache.js';

/**
 * US-212 AC#28 的**容器**单元测试：指纹、有界、single-flight。
 *
 * 线上行为（if-none-match 的发出、304 的解读、未启用时的对照）在
 * `transport.spec.ts` 的「条件请求」一节，那些断言需要 `fetch` 打桩才成立。
 */
describe('requestFingerprint', () => {
  it('method / url / body 三者共同定键，任一不同即不同指纹', () => {
    const base = requestFingerprint('POST', 'https://api.example.com/items', '{"offset":0}');
    expect(requestFingerprint('GET', 'https://api.example.com/items', '{"offset":0}')).not.toBe(base);
    expect(requestFingerprint('POST', 'https://api.example.com/other', '{"offset":0}')).not.toBe(base);
    expect(requestFingerprint('POST', 'https://api.example.com/items', '{"offset":1}')).not.toBe(base);
    expect(requestFingerprint('POST', 'https://api.example.com/items', '{"offset":0}')).toBe(base);
  });

  it('翻页的相邻两页是不同指纹', () => {
    // AC#28「翻页 / 分块按单页 / 单块各自校验（offset 变了就是另一个指纹）」——
    // 若两页同键，第 2 页会拿第 1 页的 ETag 换回第 1 页的行，拼出一个错位的结果集
    const page1 = requestFingerprint('POST', 'https://api.example.com/items', '{"offset":0,"limit":100}');
    const page2 = requestFingerprint('POST', 'https://api.example.com/items', '{"offset":100,"limit":100}');
    expect(page1).not.toBe(page2);
  });

  it('无 body 与空字符串 body 不混为一谈', () => {
    expect(requestFingerprint('GET', 'https://api.example.com/items', undefined)).not.toBe(
      requestFingerprint('GET', 'https://api.example.com/items', '')
    );
  });
});

describe('ConditionalRequestCache', () => {
  const entry = (etag: string, value: unknown) => ({ etag, value });

  describe('有界', () => {
    it('超出条目上限时逐出最久未用的一条', () => {
      const cache = new ConditionalRequestCache(2);
      cache.set('a', entry('"1"', 'A'));
      cache.set('b', entry('"2"', 'B'));
      cache.set('c', entry('"3"', 'C'));
      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')?.takeValue()).toBe('B');
      expect(cache.get('c')?.takeValue()).toBe('C');
    });

    it('读命中会刷新 recency，最旧的判定按访问顺序而非写入顺序', () => {
      // 翻页场景下第 1 页会被反复重放，按写入顺序逐出会正好把最热的那条挤掉
      const cache = new ConditionalRequestCache(2);
      cache.set('a', entry('"1"', 'A'));
      cache.set('b', entry('"2"', 'B'));
      cache.get('a');
      cache.set('c', entry('"3"', 'C'));
      expect(cache.get('a')?.takeValue()).toBe('A');
      expect(cache.get('b')).toBeUndefined();
    });

    it('重复写同一键不增长条目数', () => {
      const cache = new ConditionalRequestCache(2);
      cache.set('a', entry('"1"', 'A'));
      cache.set('a', entry('"2"', 'A2'));
      expect(cache.size).toBe(1);
      expect(cache.get('a')?.takeValue()).toBe('A2');
    });
  });

  describe('清空与删除', () => {
    it('clear() 清空所有条目', () => {
      const cache = new ConditionalRequestCache(4);
      cache.set('a', entry('"1"', 'A'));
      cache.set('b', entry('"2"', 'B'));
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });

    it('delete() 只删指定键', () => {
      const cache = new ConditionalRequestCache(4);
      cache.set('a', entry('"1"', 'A'));
      cache.set('b', entry('"2"', 'B'));
      cache.delete('a');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')?.takeValue()).toBe('B');
    });
  });

  describe('调用方之间不共享对象引用', () => {
    // 未启用条件请求时每次响应都是 JSON.parse 的新对象，调用方改自己手里那份是安全的。
    // 缓存若把同一个对象反复发出去，`conditionalRequests: true` 就会引入一条
    // 「上游改了行 → 之后每次 304 都返回被改过的数据」的静默污染路径，
    // 与「未启用时行为逐字相同」直接冲突
    it('set() 存的是私有副本，调用方事后改动不影响缓存', () => {
      const cache = new ConditionalRequestCache(4);
      const value = { rows: [{ id: 'a' }] };
      cache.set('k', entry('"1"', value));
      value.rows[0].id = 'mutated';
      expect(cache.get('k')?.takeValue()).toEqual({ rows: [{ id: 'a' }] });
    });

    it('takeValue() 每次给出独立副本，改一份不影响下一次', () => {
      const cache = new ConditionalRequestCache(4);
      cache.set('k', entry('"1"', { rows: [{ id: 'a' }] }));
      const first = cache.get('k')?.takeValue() as { rows: { id: string }[] };
      first.rows[0].id = 'mutated';
      expect(cache.get('k')?.takeValue()).toEqual({ rows: [{ id: 'a' }] });
      expect(cache.get('k')?.takeValue()).not.toBe(first);
    });

    it('single-flight 的合流方各拿一份，互不影响', async () => {
      const cache = new ConditionalRequestCache(4);
      const factory = vi.fn(() => Promise.resolve({ rows: [{ id: 'a' }] }));
      const [first, second] = await Promise.all([cache.singleFlight('k', factory), cache.singleFlight('k', factory)]);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(second).not.toBe(first);
      first.rows[0].id = 'mutated';
      expect(second).toEqual({ rows: [{ id: 'a' }] });
    });
  });

  describe('single-flight', () => {
    it('同一指纹的并发请求只执行一次 factory，两者拿到同一结果', async () => {
      // AC#28 的「空洞」正在这里被堵：第二个请求若独立发出，会带着同一个
      // If-None-Match 拿到 304，而此时第一个还没回填，缓存里没有 body
      const cache = new ConditionalRequestCache(4);
      const factory = vi.fn(() => Promise.resolve('R'));
      const [first, second] = await Promise.all([cache.singleFlight('k', factory), cache.singleFlight('k', factory)]);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(first).toBe('R');
      expect(second).toBe('R');
    });

    it('不同指纹互不合流', async () => {
      const cache = new ConditionalRequestCache(4);
      const factory = vi.fn((value: string) => () => Promise.resolve(value));
      await Promise.all([cache.singleFlight('a', factory('A')), cache.singleFlight('b', factory('B'))]);
      expect(await cache.singleFlight('a', factory('A2'))).toBe('A2');
    });

    it('结算后不再合流，下一次调用重新执行', async () => {
      const cache = new ConditionalRequestCache(4);
      const factory = vi.fn(() => Promise.resolve('R'));
      await cache.singleFlight('k', factory);
      await cache.singleFlight('k', factory);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('factory 失败时两个调用方拿到同一错误，且 in-flight 记录不残留', async () => {
      const cache = new ConditionalRequestCache(4);
      const boom = new Error('boom');
      const failing = vi.fn(() => Promise.reject(boom));
      const results = await Promise.allSettled([cache.singleFlight('k', failing), cache.singleFlight('k', failing)]);
      expect(failing).toHaveBeenCalledTimes(1);
      expect(results.every(r => r.status === 'rejected' && r.reason === boom)).toBe(true);
      // 残留会让这个指纹永久返回那次失败
      const recovered = vi.fn(() => Promise.resolve('R'));
      expect(await cache.singleFlight('k', recovered)).toBe('R');
    });
  });
});
