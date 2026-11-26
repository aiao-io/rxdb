import type { HistoryItem, HistoryScopeAPI } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { historyActions, redoBlockedReason, undoBlockedReason } from './history-actions';

const item = (reverted = false) => ({ reverted }) as HistoryItem;

describe('undoBlockedReason', () => {
  it('能撤销时没有原因', () => {
    expect(undoBlockedReason({ blocked: null, count: 2, barrier: null, histories: [item()] })).toBeNull();
  });

  it('页面自己的写入口关着时，先报页面给的原因', () => {
    expect(undoBlockedReason({ blocked: '访客只读', count: 2, barrier: null, histories: [] })).toBe('访客只读');
  });

  it('下一步已被子分支继承：写明是哪几条分支', () => {
    expect(
      undoBlockedReason({
        blocked: null,
        count: 0,
        barrier: { reason: 'inherited_by_branch', branchIds: ['feature', 'hotfix'] },
        histories: [item()]
      })
    ).toBe('下一步已被分支 feature、hotfix 继承，撤销到这里为止');
  });

  it('本次会话改过、却一条都撤不了：推送或拉到改写之后撤销栈清空了', () => {
    expect(undoBlockedReason({ blocked: null, count: 0, barrier: null, histories: [item()] })).toBe(
      '推送或拉到远端的改写之后，之前的修改不能再撤销'
    );
  });

  it('什么都没改，或改过的都已撤销', () => {
    expect(undoBlockedReason({ blocked: null, count: 0, barrier: null, histories: [] })).toBe('没有可撤销的修改');
    expect(undoBlockedReason({ blocked: null, count: 0, barrier: null, histories: [item(true)] })).toBe(
      '没有可撤销的修改'
    );
  });
});

describe('redoBlockedReason', () => {
  it('能重做时没有原因；页面的原因优先；否则说明没有可重做的', () => {
    expect(redoBlockedReason({ blocked: null, count: 1 })).toBeNull();
    expect(redoBlockedReason({ blocked: '访客只读', count: 1 })).toBe('访客只读');
    expect(redoBlockedReason({ blocked: null, count: 0 })).toBe('没有可重做的修改');
  });
});

describe('historyActions', () => {
  it('撤销、重做走同一个作用域：计数跟着作用域，执行期间标为进行中', async () => {
    let finish: () => void = () => undefined;
    const undoCount$ = new BehaviorSubject(1);
    const scope = {
      type: 'repository',
      histories$: of([item()]),
      undoCount$,
      redoCount$: of(0),
      undoBarrier$: of(null),
      undo: vi.fn(() => new Promise<void>(resolve => (finish = resolve))),
      redo: vi.fn(() => Promise.resolve())
    } as unknown as HistoryScopeAPI;
    const { undo, redo } = TestBed.runInInjectionContext(() => historyActions(scope, signal(null)));

    expect(undo.count()).toBe(1);
    expect(undo.disabledReason()).toBeNull();
    expect(redo.disabledReason()).toBe('没有可重做的修改');

    const running = undo.run();
    expect(undo.pending()).toBe(true);
    finish();
    await running;
    expect(undo.pending()).toBe(false);
    expect(scope.undo).toHaveBeenCalledTimes(1);

    undoCount$.next(0);
    expect(undo.disabledReason()).toBe('推送或拉到远端的改写之后，之前的修改不能再撤销');
  });
});
