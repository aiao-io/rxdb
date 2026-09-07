/**
 * @fileoverview `createHistoryScopeApi` 的缓存与引用计数
 *
 * 覆盖：
 * - 只调方法（不订阅任何流）不得在 `history_cache` 里留下永久条目
 * - 有订阅者期间共享同一个 api 对象，最后一个退订后条目被摘掉
 */

import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createHistoryScopeApi, type HistoryScopeApiHost } from '../../version/history-scope-api.js';
import type { HistoryItem, HistoryScope } from '../../version/VersionManager.interface.js';

const createHost = () => {
  const histories$ = new BehaviorSubject<HistoryItem[]>([]);
  const host: HistoryScopeApiHost = {
    history_cache: new Map(),
    history_ref_counts: new Map(),
    histories$,
    undoHistories$: histories$,
    redoHistories$: histories$,
    undoSession$: { value: { state: 'cleared' } as never },
    runSerialized: task => task(),
    fetchLatestHistories: async () => ({ histories: [], lastPushedMap: new Map() }),
    isUndoSessionCurrent: () => true,
    selectWholeTransactions: () => [],
    applyUndoRedoHistories: vi.fn(async () => undefined)
  };
  return host;
};

const recordScope = (entityId: string): HistoryScope => ({
  type: 'entity',
  namespace: 'public',
  entity: 'Todo',
  entityId
});

describe('createHistoryScopeApi - 缓存生命周期', () => {
  it('只调用方法、从不订阅，不在缓存里留下条目', async () => {
    const host = createHost();

    for (let index = 0; index < 50; index++) {
      await createHistoryScopeApi(host, recordScope(`todo-${index}`)).undo();
    }

    // 入表若发生在创建时，每调一次 history(record).undo() 就永久多一条，
    // 键还是按记录 id 分的 —— 这是无上界的增长。
    expect(host.history_cache.size).toBe(0);
    expect(host.history_ref_counts.size).toBe(0);
  });

  it('有订阅者期间进缓存，最后一个退订后摘掉', () => {
    const host = createHost();
    const scope = recordScope('todo-1');

    const first = createHistoryScopeApi(host, scope);
    const subA = first.histories$.subscribe();
    expect(host.history_cache.get(getOnlyKey(host))).toBe(first);
    expect(host.history_ref_counts.get(getOnlyKey(host))).toBe(1);

    // 第二个调用方拿到的必须是同一个 api，否则两边的流各自独立
    const second = createHistoryScopeApi(host, scope);
    expect(second).toBe(first);
    const subB = second.undoHistories$.subscribe();
    expect(host.history_ref_counts.get(getOnlyKey(host))).toBe(2);

    subA.unsubscribe();
    expect(host.history_cache.size).toBe(1);

    subB.unsubscribe();
    expect(host.history_cache.size).toBe(0);
    expect(host.history_ref_counts.size).toBe(0);
  });

  it('退订后重新订阅会重新入表', () => {
    const host = createHost();
    const scope = recordScope('todo-1');

    createHistoryScopeApi(host, scope).histories$.subscribe().unsubscribe();
    expect(host.history_cache.size).toBe(0);

    const revived = createHistoryScopeApi(host, scope);
    const sub = revived.histories$.subscribe();
    expect(host.history_cache.size).toBe(1);
    sub.unsubscribe();
    expect(host.history_cache.size).toBe(0);
  });
});

/** 缓存里此刻唯一的键；断言里顺带保证不会多出第二个作用域 */
function getOnlyKey(host: HistoryScopeApiHost): string {
  const keys = [...host.history_cache.keys()];
  expect(keys).toHaveLength(1);
  return keys[0];
}
