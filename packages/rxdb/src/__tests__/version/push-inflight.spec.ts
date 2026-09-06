/**
 * @fileoverview 推送在飞窗口内的 undo 隔离
 *
 * 契约是「**只有还没推上去的变更可以撤销**」（`filterUndoableHistories` 的 `notPushed` 判据）。
 * 判据的数据源是 `RxDBSync.lastPushedChangeId`，而那个值只在 push **提交**时才写。
 * push 的远端往返在事务之外，于是有一段窗口：变更已经发到远端、水位线还没推进。
 * 这期间一次 `undo()` 会认为它「还没推」而放行，把它在本地回滚成 `revertChangeId != null`。
 *
 * 回滚**不产生新的变更行**（`undo-redo-apply.ts` 只给原行打 `revertChangeId` 标记），
 * 而出站查询恰恰过滤 `revertChangeId = null` —— 于是这条变更远端有、本地没有，
 * 且再也没有任何一次 push 会把这个差异送出去。永久分叉。
 *
 * 修法不是事后补救，是让「在飞」这件事本身可见：push 在往返之前认领区间，
 * undo 把认领区间当成已推。
 */

import { describe, expect, it } from 'vitest';
import type { RxDBChange } from '../../system/change.js';
import { buildLastPushedMap, filterUndoableHistories } from '../../version/history-filters.js';
import { PushInFlightRegistry } from '../../version/push-inflight.js';
import type { HistoryItem } from '../../version/VersionManager.interface.js';

/** 只保留 `buildLastPushedMap` 真正读的三个字段 */
const syncRow = (entity: string, lastPushedChangeId: number | null) => ({
  namespace: 'public',
  entity,
  lastPushedChangeId
});

/** 一条本地未推、未回滚的历史 */
const history = (id: number, entity = 'User'): HistoryItem =>
  ({
    transactionId: null,
    changeId: id,
    fingerprint: `fp-${id}`,
    changes: [{ id, namespace: 'public', entity, revertChangeId: null, remoteId: null } as RxDBChange],
    type: 'INSERT',
    count: 1,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    description: 'test',
    namespace: 'public',
    entity,
    reverted: false,
    redoInvalidated: false
  }) as HistoryItem;

describe('PushInFlightRegistry', () => {
  it('没有认领时快照为空', () => {
    expect(new PushInFlightRegistry().snapshot().size).toBe(0);
  });

  it('认领后报出该仓库正在推的最大 change id', () => {
    const registry = new PushInFlightRegistry();
    const session = registry.session();
    session.claim('public:User', 42);

    expect(registry.snapshot().get('public:User')).toBe(42);
  });

  it('同一 session 对同一仓库二次认领取较大者，不会被较小者拉低', () => {
    const registry = new PushInFlightRegistry();
    const session = registry.session();
    session.claim('public:User', 42);
    session.claim('public:User', 7);

    expect(registry.snapshot().get('public:User')).toBe(42);
  });

  it('两个 session 并发推同一仓库时取最大值', () => {
    const registry = new PushInFlightRegistry();
    const first = registry.session();
    const second = registry.session();
    first.claim('public:User', 10);
    second.claim('public:User', 30);

    expect(registry.snapshot().get('public:User')).toBe(30);
  });

  it('release() 只撤销自己那个 session 的认领', () => {
    const registry = new PushInFlightRegistry();
    const first = registry.session();
    const second = registry.session();
    first.claim('public:User', 10);
    second.claim('public:User', 30);

    second.release();

    // 30 那次已经结束，10 那次还在飞：水位线回落到 10 而不是消失
    expect(registry.snapshot().get('public:User')).toBe(10);

    first.release();
    expect(registry.snapshot().size).toBe(0);
  });

  it('重复 release() 不影响其它 session', () => {
    const registry = new PushInFlightRegistry();
    const first = registry.session();
    const second = registry.session();
    first.claim('public:User', 10);
    second.claim('public:User', 30);

    second.release();
    second.release();

    expect(registry.snapshot().get('public:User')).toBe(10);
  });

  it('一个 session 认领多个仓库，release() 一次全撤', () => {
    const registry = new PushInFlightRegistry();
    const session = registry.session();
    session.claim('public:User', 10);
    session.claim('public:Post', 20);

    expect(registry.snapshot().size).toBe(2);

    session.release();
    expect(registry.snapshot().size).toBe(0);
  });
});

describe('buildLastPushedMap', () => {
  it('没有在飞认领时逐字等于 RxDBSync 的水位线', () => {
    const map = buildLastPushedMap([syncRow('User', 15), syncRow('Post', 5)], new Map());

    expect([...map]).toEqual([
      ['public:User', 15],
      ['public:Post', 5]
    ]);
  });

  it('lastPushedChangeId 为 null 的仓库不进 map', () => {
    expect(buildLastPushedMap([syncRow('User', null)], new Map()).size).toBe(0);
  });

  it('在飞认领高于已推水位线时取在飞值', () => {
    const map = buildLastPushedMap([syncRow('User', 15)], new Map([['public:User', 20]]));

    expect(map.get('public:User')).toBe(20);
  });

  it('已推水位线高于在飞认领时取已推值', () => {
    // 上一轮推到 30，这一轮只在飞到 20：水位线不许倒退
    const map = buildLastPushedMap([syncRow('User', 30)], new Map([['public:User', 20]]));

    expect(map.get('public:User')).toBe(30);
  });

  it('只有在飞认领、还没有 RxDBSync 行时也报出来', () => {
    const map = buildLastPushedMap([], new Map([['public:User', 20]]));

    expect(map.get('public:User')).toBe(20);
  });
});

describe('在飞窗口内的 undo', () => {
  it('远端往返期间的变更被挡下，不可撤销', () => {
    const registry = new PushInFlightRegistry();
    const session = registry.session();
    // 本轮 push 正在把 id ≤ 12 的变更送往远端；水位线还停在 10
    session.claim('public:User', 12);

    const lastPushed = buildLastPushedMap([syncRow('User', 10)], registry.snapshot());
    const undoable = filterUndoableHistories([history(11), history(12), history(13)], lastPushed);

    // 11、12 在飞，13 还没进这一批
    expect(undoable.map(item => item.changeId)).toEqual([13]);
  });

  it('push 失败释放认领后，那些变更重新可撤销', () => {
    const registry = new PushInFlightRegistry();
    const session = registry.session();
    session.claim('public:User', 12);
    session.release();

    const lastPushed = buildLastPushedMap([syncRow('User', 10)], registry.snapshot());
    const undoable = filterUndoableHistories([history(11), history(12), history(13)], lastPushed);

    expect(undoable.map(item => item.changeId)).toEqual([11, 12, 13]);
  });

  it('在飞认领只影响自己那个仓库', () => {
    const registry = new PushInFlightRegistry();
    const session = registry.session();
    session.claim('public:User', 12);

    const lastPushed = buildLastPushedMap([syncRow('User', 10), syncRow('Post', 10)], registry.snapshot());
    const undoable = filterUndoableHistories([history(11, 'User'), history(11, 'Post')], lastPushed);

    expect(undoable.map(item => item.entity)).toEqual(['Post']);
  });
});
