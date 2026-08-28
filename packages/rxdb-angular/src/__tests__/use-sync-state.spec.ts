/**
 * `useSyncState` —— Angular 侧。
 *
 * @remarks
 * 与 `packages/rxdb-react/src/__tests__/use-sync-state.spec.tsx`、
 * `packages/rxdb-vue/src/__tests__/use-sync-state.spec.ts` **逐条对齐**：三端共用同一份
 * 语义（同名字段、同初值来源、同退订时机、无 provider 时同样抛错），只是容器形态不同 ——
 * Angular 是 `Signal`，Vue 是 `ComputedRef`，React 是渲染快照。
 *
 * 行为断言全部打在**真的** `SyncStateHub` 上而不是探针：这一层要证明的是「面板显示的
 * 是不是库当前的同步状态」，断言方法被调用过只能证明有人喊了一声。`state$` 外面再包一层
 * 是为了让「退订」这件事可断言 —— hub 自己没有暴露订阅数。
 */
import { RxDB, SyncStateHub, type SyncState } from '@aiao/rxdb';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideRxDB } from '../rxdb.provider';
import { useSyncState } from '../use-sync-state';

const createFixture = () => {
  const hub = new SyncStateHub({ online$: new BehaviorSubject(true), pushableCount$: new BehaviorSubject(0) });
  const teardown = vi.fn();
  const state$ = new Observable<SyncState>(subscriber => {
    const inner = hub.state$.subscribe(subscriber);
    return () => {
      teardown();
      inner.unsubscribe();
    };
  });
  const rxdb = {
    syncState: {
      state$,
      get snapshot(): SyncState {
        return hub.snapshot;
      }
    }
  } as unknown as RxDB;

  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRxDB(rxdb)] });
  return { hub, teardown };
};

afterEach(() => TestBed.resetTestingModule());

describe('useSyncState', () => {
  it('初值就是库当前的同步快照', () => {
    const { hub } = createFixture();
    hub.reportOutboxCount(2);
    hub.reportConflict({ namespace: 'public', entity: 'Recipe', entityId: 'r-1', winner: 'remote' });

    const state = TestBed.runInInjectionContext(() => useSyncState());

    expect(state.online()).toBe(true);
    expect(state.pendingCount()).toBe(2);
    expect(state.syncing()).toBe(false);
    expect(state.lastError()).toBeNull();
    expect(state.lastConflict()).toMatchObject({ entityId: 'r-1', winner: 'remote' });
  });

  it('离线写入队后待推数跟着涨', () => {
    const { hub } = createFixture();
    const state = TestBed.runInInjectionContext(() => useSyncState());
    expect(state.pendingCount()).toBe(0);

    hub.reportOfflineWrite();

    expect(state.pendingCount()).toBe(1);
  });

  it('一轮回推期间 syncing 为真，收尾后复位', () => {
    const { hub } = createFixture();
    const state = TestBed.runInInjectionContext(() => useSyncState());

    hub.beginRound();
    expect(state.syncing()).toBe(true);

    hub.endRound();
    expect(state.syncing()).toBe(false);
  });

  it('回推失败落在 lastError，成功一轮后清空', () => {
    const { hub } = createFixture();
    const state = TestBed.runInInjectionContext(() => useSyncState());
    const failure = new Error('remote unreachable');

    hub.reportError(failure);
    expect(state.lastError()).toBe(failure);

    hub.reportSuccess();
    expect(state.lastError()).toBeNull();
  });

  // 冲突是历史事实，不该被后续的成功抹掉 —— 用户需要知道自己离线时的改动被判负过
  it('冲突判定留在 lastConflict，不被后续成功清空', () => {
    const { hub } = createFixture();
    const state = TestBed.runInInjectionContext(() => useSyncState());

    hub.reportConflict({ namespace: 'public', entity: 'Recipe', entityId: 'r-2', winner: 'remote' });
    hub.reportSuccess();

    expect(state.lastConflict()).toMatchObject({ namespace: 'public', entity: 'Recipe', entityId: 'r-2' });
  });

  it('注入器销毁时退订上游', () => {
    const { teardown } = createFixture();
    const state = TestBed.runInInjectionContext(() => useSyncState());
    // 先读一次：signal 是惰性订阅的，没读过就无所谓退订
    expect(state.online()).toBe(true);
    expect(teardown).not.toHaveBeenCalled();

    TestBed.resetTestingModule();

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  // 没有库就没有同步状态可言。这里不返回一份「一切正常」的默认值：
  // 那会把「面板没接上」伪装成「没有待推变更」，恰好是最需要出声的时候不出声。
  it('没有 provider 时抛错，不返回伪造的正常态', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });

    expect(() => TestBed.runInInjectionContext(() => useSyncState())).toThrow();
  });
});
