/**
 * 「刚同步过」记忆表本身的契约（US-020 D13 / US-023 D12）。
 *
 * 此前它只在 `Repository.remote-invalidation.spec.ts` 等用例里被顺带驱动，
 * 「窗口到期」「全表遗忘」「代次作废」三条失效路径没有一条被直接断言过。
 * 记忆退化成「永远新鲜」时远端权威就没了，这三条必须各自钉住。
 *
 * 计时器用假时钟：真等 `staleTime` 会把用例变成靠睡眠的赌博，而
 * {@link QueryCacheSyncMemo.clear} 要证的恰恰是「计时器被撤了」——
 * 只有 `vi.getTimerCount()` 能直接看见这件事，断言方法被调过证明不了资源被释放。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_QUERY_CACHE_SYNC_STALE_TIME,
  queryCacheFingerprint,
  QueryCacheSyncMemo
} from '../../repository/query-cache-sync-memo.js';

const FP = 'fp';

describe('queryCacheFingerprint', () => {
  it('键序不同但语义相同的查询得到同一指纹', () => {
    const a = queryCacheFingerprint({ where: { combinator: 'and', rules: [] }, localCacheFirst: true });
    const b = queryCacheFingerprint({ localCacheFirst: true, where: { combinator: 'and', rules: [] } });

    expect(a).toBe(b);
  });

  // 同一个 `where` 走 SWR 与走标准模式是两条不同的读路径，指纹必须分开，
  // 否则互相复用会把模式判定悄悄抹掉
  it('读模式进指纹', () => {
    const where = { combinator: 'and', rules: [] };

    expect(queryCacheFingerprint({ where })).not.toBe(queryCacheFingerprint({ where, localCacheFirst: true }));
    expect(queryCacheFingerprint({ where })).not.toBe(queryCacheFingerprint({ where, offlineFallback: true }));
  });

  // 省略与显式 false 必须同指纹，否则调用方写不写这两个字段会得到两条记忆
  it('省略与显式 false 等价', () => {
    const where = { combinator: 'and', rules: [] };

    expect(queryCacheFingerprint({ where })).toBe(
      queryCacheFingerprint({ where, localCacheFirst: false, offlineFallback: false })
    );
  });
});

describe('QueryCacheSyncMemo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('记住之后窗口内命中', () => {
    const memo = new QueryCacheSyncMemo(1000);
    memo.remember(FP, memo.generation);

    vi.advanceTimersByTime(999);

    expect(memo.has(FP)).toBe(true);
  });

  it('窗口到期后自动遗忘', () => {
    const memo = new QueryCacheSyncMemo(1000);
    memo.remember(FP, memo.generation);

    vi.advanceTimersByTime(1000);

    expect(memo.has(FP)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  // `syncStaleTime: 0` 是「每次读都回远端校验」的显式开关，不是「窗口极短」
  it('staleTime 为 0 时完全不记忆', () => {
    const memo = new QueryCacheSyncMemo(0);
    memo.remember(FP, memo.generation);

    expect(memo.has(FP)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  // 同一指纹重复记忆不能留下两个计时器：旧的那个到期时会把刚续上的记忆一起抹掉
  it('重复记忆同一指纹时撤掉旧计时器', () => {
    const memo = new QueryCacheSyncMemo(1000);
    memo.remember(FP, memo.generation);
    vi.advanceTimersByTime(600);
    memo.remember(FP, memo.generation);

    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(600);
    expect(memo.has(FP)).toBe(true);
  });

  it('clear 撤掉所有待触发的计时器', () => {
    const memo = new QueryCacheSyncMemo(1000);
    memo.remember('a', memo.generation);
    memo.remember('b', memo.generation);
    expect(vi.getTimerCount()).toBe(2);

    memo.clear();

    // 关键断言：不是「查不到了」而是「计时器不在了」。只清表不撤计时器的话，
    // 表面上 `has()` 一样返回 false，但每条记忆都会把自己的闭包钉在事件循环上
    // 直到窗口走完 —— `syncStaleTime` 可配成分钟级，仓储销毁后照样活着。
    expect(vi.getTimerCount()).toBe(0);
    expect(memo.has('a')).toBe(false);
    expect(memo.has('b')).toBe(false);
  });

  it('clear 递增代次，作废此刻还在飞的同步', () => {
    const memo = new QueryCacheSyncMemo(1000);
    const generation = memo.generation;

    memo.clear();
    memo.remember(FP, generation);

    expect(memo.has(FP)).toBe(false);
    expect(memo.generation).toBe(generation + 1);
  });

  // 适配器流每次发射都重建主仓储，但**实例没换**时那只是重新求值（订阅归零再订阅），
  // 清记忆等于让翻页永远回远端；换了实例才是断连重连（US-020 AC#22）
  it('两侧实例都没换时不清记忆', () => {
    const memo = new QueryCacheSyncMemo(1000);
    const local = {};
    const remote = {};
    memo.bindAdapters(local, remote);
    memo.remember(FP, memo.generation);

    memo.bindAdapters(local, remote);

    expect(memo.has(FP)).toBe(true);
  });

  it('任一侧换了实例即全表遗忘', () => {
    const local = {};
    const remote = {};

    for (const rebind of [() => ({ local: {}, remote }), () => ({ local, remote: {} })]) {
      const memo = new QueryCacheSyncMemo(1000);
      memo.bindAdapters(local, remote);
      memo.remember(FP, memo.generation);

      const next = rebind();
      memo.bindAdapters(next.local, next.remote);

      expect(memo.has(FP)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('缺省窗口为 DEFAULT_QUERY_CACHE_SYNC_STALE_TIME', () => {
    const memo = new QueryCacheSyncMemo();
    memo.remember(FP, memo.generation);

    vi.advanceTimersByTime(DEFAULT_QUERY_CACHE_SYNC_STALE_TIME - 1);
    expect(memo.has(FP)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(memo.has(FP)).toBe(false);
  });
});
