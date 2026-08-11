/**
 * T058 — Reactive refresh 状态流转单测（纯逻辑）
 *
 * 断言 `subscribeDataChanges` 回调触发的直通重查会把 `state$`
 * 从 `success`（或 `empty`）推进到 `loading` 再回到 `success` / `empty`，
 * 并且 `results$` 重新 emit 最新一批结果。
 *
 * 真 sqlite-wasm + rxdb entity 事件的端到端路径由 `apps/dev-rxdb-*-e2e`
 * 的 `search-refresh` E2E（T062-T064）覆盖；此处仅锁住 handle 内部
 * state 机与 trigger$ 直通契约。
 */
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSearchHandle, type PerformSearch, type SearchPage } from '../core/search-handle.js';
import type { SearchResult, SearchState } from '../types.js';

const res = (id: string): SearchResult => ({
  entity: 'Article',
  collection: 'article',
  id,
  rank: -1,
  matchedField: 'title',
  snippet: `snip-${id}`
});

describe('Reactive refresh state transitions (T058)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('INSERT 后 state 走 success → loading → success，results 重 emit', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const states: SearchState[] = [];
    const perform = vi
      .fn<PerformSearch>()
      .mockImplementationOnce(async () => ({ results: [res('a')], hasMore: false }))
      .mockImplementationOnce(async () => ({
        results: [res('a'), res('new-inserted')],
        hasMore: false
      }));

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });
    const sub = h.state$.subscribe(s => states.push(s));

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a']);
    expect(await firstValueFrom(h.state$)).toBe('success');

    // 模拟 INSERT 事件
    onChangeCb?.();
    // 变更通道有 refreshAuditMs 合并窗口（默认 80ms），推进过窗口即可；
    // 关键契约仍是「不必等 300ms 的输入防抖」
    await vi.advanceTimersByTimeAsync(100);

    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a', 'new-inserted']);
    expect(await firstValueFrom(h.state$)).toBe('success');

    // success → loading → success 三态至少出现过一次 loading
    expect(states.includes('loading')).toBe(true);

    sub.unsubscribe();
    h.destroy();
  });

  it('DELETE 清空匹配后 state 走 success → loading → empty，results 为空数组', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const perform = vi
      .fn<PerformSearch>()
      .mockImplementationOnce(async () => ({ results: [res('a'), res('b')], hasMore: false }))
      .mockImplementationOnce(async () => ({ results: [], hasMore: false }));

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });

    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(await firstValueFrom(h.state$)).toBe('success');

    onChangeCb?.();
    await vi.advanceTimersByTimeAsync(100);

    expect(await firstValueFrom(h.results$)).toEqual([]);
    expect(await firstValueFrom(h.state$)).toBe('empty');
    h.destroy();
  });

  it('UPDATE 保留查询词：currentQuery 不变，仅 results 重算', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const perform = vi
      .fn<PerformSearch>()
      .mockImplementationOnce(async () => ({ results: [res('a')], hasMore: false }))
      .mockImplementationOnce(async () => ({ results: [res('a-updated')], hasMore: false }));

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });

    h.setQuery('my-query');
    await vi.advanceTimersByTimeAsync(400);

    onChangeCb?.();
    await vi.advanceTimersByTimeAsync(100);

    // 第二次 perform 收到的查询词与第一次相同
    expect(perform.mock.calls[0][0]).toBe('my-query');
    expect(perform.mock.calls[1][0]).toBe('my-query');
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['a-updated']);
    h.destroy();
  });

  it('空查询下数据变更不触发直通重查', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [], hasMore: false });
    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });

    // 没有 setQuery，currentQuery 为空
    onChangeCb?.();
    await vi.advanceTimersByTimeAsync(100);

    expect(perform).not.toHaveBeenCalled();
    expect(await firstValueFrom(h.state$)).toBe('idle');
    h.destroy();
  });

  // 每个实体事件立刻触发一次完整重查，而一次重查 = collections × fields 条并发 rawQuery。
  // 批量导入 / 同步拉取产生几百个事件时，会有数千条 SQL 灌进单线程 sqlite-wasm worker。
  // switchMap 只取消订阅，已发出的 promise 与其 SQL 仍会跑完。
  it('合并同一窗口内的多次数据变更，只重查一次', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('a')], hasMore: false });

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });
    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(perform).toHaveBeenCalledTimes(1);

    // 模拟一次批量写入产生的事件风暴
    for (let i = 0; i < 50; i += 1) onChangeCb?.();
    await vi.advanceTimersByTimeAsync(200);

    expect(perform).toHaveBeenCalledTimes(2);
    h.destroy();
  });

  it('refreshAuditMs 为 0 时保持逐事件直通', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    const perform = vi.fn<PerformSearch>().mockResolvedValue({ results: [res('a')], hasMore: false });

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges, refreshAuditMs: 0 });
    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(perform).toHaveBeenCalledTimes(1);

    onChangeCb?.();
    await vi.advanceTimersByTimeAsync(100);

    expect(perform).toHaveBeenCalledTimes(2);
    h.destroy();
  });

  it('慢查询期间只保留 trailing refresh，且不产生并发执行', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    let resolveFirst: ((page: { results: SearchResult[]; hasMore: boolean }) => void) | undefined;
    let inFlight = 0;
    let maxInFlight = 0;
    const perform = vi
      .fn<PerformSearch>()
      .mockImplementationOnce(() =>
        new Promise<SearchPage>(resolve => {
          resolveFirst = resolve;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
        }).finally(() => {
          inFlight -= 1;
        })
      )
      .mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return { results: [res('latest')], hasMore: false };
      });

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });
    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    expect(perform).toHaveBeenCalledTimes(1);

    onChangeCb?.();
    onChangeCb?.();
    await vi.advanceTimersByTimeAsync(100);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);

    resolveFirst!({ results: [res('first')], hasMore: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(perform).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect((await firstValueFrom(h.results$)).map(r => r.id)).toEqual(['latest']);
    h.destroy();
  });

  it('destroy 会取消可取消的在途查询并丢弃排队 refresh', async () => {
    let onChangeCb: (() => void) | undefined;
    const subscribeDataChanges = (cb: () => void) => {
      onChangeCb = cb;
      return () => {
        onChangeCb = undefined;
      };
    };
    let aborted = false;
    const perform = vi.fn<PerformSearch>().mockImplementation(
      ((_query: string, _page: number, signal: AbortSignal | undefined): Promise<SearchPage> =>
        new Promise<SearchPage>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        })) as PerformSearch
    );

    const h = createSearchHandle({ performSearch: perform, subscribeDataChanges });
    h.setQuery('alpha');
    await vi.advanceTimersByTimeAsync(400);
    onChangeCb?.();
    await vi.advanceTimersByTimeAsync(100);
    h.destroy();
    await vi.advanceTimersByTimeAsync(1);

    expect(aborted).toBe(true);
    expect(perform).toHaveBeenCalledTimes(1);
  });
});
