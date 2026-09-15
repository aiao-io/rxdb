/**
 * @fileoverview 同步桥的转接契约
 *
 * US-025 阶段 D 把推拉同步切到 `@aiao/rxdb-plugin-sync` 之后，两包之间只剩
 * {@link SyncHistoryBridge} 这一张面。桥上每一条都只是「转给当下这个
 * {@link HistoryManager}」，唯一带判断的是 `settlePull` —— 结算口径留在历史侧，
 * 同步侧原样交出 `options` / `result`（由该包的 `SyncManager.orchestration.spec.ts` 守）。
 *
 * 于是「这次 pull 算不算完整同步」的用例住在这里：判据在这边，用例就该在这边。
 */

import type { PullOptions, PullResult } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryManager } from '../HistoryManager.js';
import { PushInFlightRegistry } from '../push-inflight.js';
import { createSyncHistoryBridge } from '../sync-history-bridge.js';

type Settlement = { complete: boolean; pulled: number };

function createManagerDouble() {
  return {
    syncing: vi.fn(<T>(fn: () => Promise<T>) => fn()),
    clearUndoHistory: vi.fn<() => void>(),
    beginPullableSettlement: vi.fn<() => number>(() => 11),
    settlePullableCount: vi.fn<(token: number, settlement: Settlement) => void>(),
    reconcilePullableCount: vi.fn<(token: number, count: number) => void>(),
    incrementPullableCount: vi.fn<(count: number) => void>()
  };
}

function createPullResult(overrides: Partial<PullResult> = {}): PullResult {
  return {
    pulled: 3,
    compacted: 0,
    applied: 3,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    persistedProgress: true,
    historyInvalidated: true,
    failures: [],
    ...overrides
  } as PullResult;
}

function createBridge() {
  const manager = createManagerDouble();
  const pushInFlight = new PushInFlightRegistry();
  const bridge = createSyncHistoryBridge(() => manager as unknown as HistoryManager, pushInFlight);
  return { bridge, manager, pushInFlight };
}

describe('createSyncHistoryBridge', () => {
  it('转出的登记处就是传进来那一个', () => {
    const { bridge, pushInFlight } = createBridge();

    expect(bridge.pushInFlight).toBe(pushInFlight);
  });

  it('把无判断的几条原样转给当下的管理器', async () => {
    const { bridge, manager } = createBridge();
    const operation = vi.fn(async () => 'done');

    await expect(bridge.syncing(operation)).resolves.toBe('done');
    expect(manager.syncing).toHaveBeenCalledWith(operation);

    bridge.clearUndoHistory();
    expect(manager.clearUndoHistory).toHaveBeenCalledOnce();

    expect(bridge.beginPullableSettlement()).toBe(11);

    bridge.reconcilePullableCount(11, 4);
    expect(manager.reconcilePullableCount).toHaveBeenCalledWith(11, 4);

    bridge.incrementPullableCount(2);
    expect(manager.incrementPullableCount).toHaveBeenCalledWith(2);
  });

  // `VersionManager.init()` 会重建 HistoryManager（上一纪元 destroy 过）。桥若在构造时
  // 捏死实例，重连之后所有结算都打进一个已经拆掉事件总线的管理器 —— 计数从此不再变化。
  it('每次转接都重新取管理器，不捏死构造时那一个', () => {
    const first = createManagerDouble();
    const second = createManagerDouble();
    let current = first;
    const bridge = createSyncHistoryBridge(() => current as unknown as HistoryManager, new PushInFlightRegistry());

    bridge.clearUndoHistory();
    current = second;
    bridge.clearUndoHistory();

    expect(first.clearUndoHistory).toHaveBeenCalledOnce();
    expect(second.clearUndoHistory).toHaveBeenCalledOnce();
  });

  // RXD-034：分页 / 逐仓 / 有失败的 pull 只处理了一部分，判成完整会让全局计数归零，
  // 界面显示「已经同步干净了」而远端明明还有东西。
  it.each<[string, PullOptions | undefined, Partial<PullResult>]>([
    ['分页未拉完', { limit: 10 }, { hasMore: true }],
    ['只拉了指定仓库', { repositoryFilter: ['public:Todo'] }, {}],
    ['有仓库拉失败', undefined, { failures: [{ error: new Error('remote down') }] as PullResult['failures'] }]
  ])('把「%s」的 pull 结算成不完整', (_label, options, overrides) => {
    const { bridge, manager } = createBridge();
    const result = createPullResult(overrides);

    bridge.settlePull(11, options, result);

    expect(manager.settlePullableCount).toHaveBeenCalledWith(11, { complete: false, pulled: result.pulled });
  });

  it.each<[string, PullOptions | undefined]>([
    ['没传选项', undefined],
    ['只传了分页参数', { limit: 50, fetchAll: true }],
    ['仓库过滤是空数组', { repositoryFilter: [] }]
  ])('把「%s」且无分页无失败的 pull 结算成完整', (_label, options) => {
    const { bridge, manager } = createBridge();

    bridge.settlePull(11, options, createPullResult({ pulled: 5 }));

    expect(manager.settlePullableCount).toHaveBeenCalledWith(11, { complete: true, pulled: 5 });
  });

  // 抛错的 pull 一定不完整，但已落库的那部分得照实扣掉，令牌也必须收回
  it('按已落库条数结算抛错的 pull', () => {
    const { bridge, manager } = createBridge();

    bridge.settleAbortedPull(11, 4);

    expect(manager.settlePullableCount).toHaveBeenCalledWith(11, { complete: false, pulled: 4 });
  });
});
