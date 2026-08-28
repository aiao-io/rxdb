/**
 * `useSyncState` —— React 侧。
 *
 * @remarks
 * 与 `packages/rxdb-angular/src/__tests__/use-sync-state.spec.ts`、
 * `packages/rxdb-vue/src/__tests__/use-sync-state.spec.ts` **逐条对齐**：三端共用同一份
 * 语义（同名字段、同初值来源、同退订时机、无 provider 时同样抛错），只是容器形态不同 ——
 * React 是渲染快照，Angular 是 `Signal`，Vue 是 `ComputedRef`。
 *
 * 行为断言全部打在**真的** `SyncStateHub` 上而不是探针：这一层要证明的是「面板显示的
 * 是不是库当前的同步状态」，断言方法被调用过只能证明有人喊了一声。`state$` 外面再包一层
 * 是为了让「退订」这件事可断言 —— hub 自己没有暴露订阅数。
 */
import { RxDB, SyncStateHub, type SyncState } from '@aiao/rxdb';
import { act, cleanup, renderHook } from '@testing-library/react';
import { BehaviorSubject, Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBProvider } from '../rxdb-react.js';
import { useSyncState } from '../use-sync-state.js';

afterEach(cleanup);

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

  return { hub, rxdb, teardown };
};

const renderWithProvider = (rxdb: RxDB) =>
  renderHook(() => useSyncState(), {
    wrapper: ({ children }) => <RxDBProvider db={rxdb}>{children}</RxDBProvider>
  });

describe('useSyncState', () => {
  it('初值就是库当前的同步快照', () => {
    const { hub, rxdb } = createFixture();
    hub.reportOutboxCount(2);
    hub.reportConflict({ namespace: 'public', entity: 'Recipe', entityId: 'r-1', winner: 'remote' });

    const { result } = renderWithProvider(rxdb);

    expect(result.current.online).toBe(true);
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.syncing).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.lastConflict).toMatchObject({ entityId: 'r-1', winner: 'remote' });
  });

  it('离线写入队后待推数跟着涨', () => {
    const { hub, rxdb } = createFixture();
    const { result } = renderWithProvider(rxdb);
    expect(result.current.pendingCount).toBe(0);

    act(() => hub.reportOfflineWrite());

    expect(result.current.pendingCount).toBe(1);
  });

  it('一轮回推期间 syncing 为真，收尾后复位', () => {
    const { hub, rxdb } = createFixture();
    const { result } = renderWithProvider(rxdb);

    act(() => hub.beginRound());
    expect(result.current.syncing).toBe(true);

    act(() => hub.endRound());
    expect(result.current.syncing).toBe(false);
  });

  it('回推失败落在 lastError，成功一轮后清空', () => {
    const { hub, rxdb } = createFixture();
    const { result } = renderWithProvider(rxdb);
    const failure = new Error('remote unreachable');

    act(() => hub.reportError(failure));
    expect(result.current.lastError).toBe(failure);

    act(() => hub.reportSuccess());
    expect(result.current.lastError).toBeNull();
  });

  // 冲突是历史事实，不该被后续的成功抹掉 —— 用户需要知道自己离线时的改动被判负过
  it('冲突判定留在 lastConflict，不被后续成功清空', () => {
    const { hub, rxdb } = createFixture();
    const { result } = renderWithProvider(rxdb);

    act(() => hub.reportConflict({ namespace: 'public', entity: 'Recipe', entityId: 'r-2', winner: 'remote' }));
    act(() => hub.reportSuccess());

    expect(result.current.lastConflict).toMatchObject({ namespace: 'public', entity: 'Recipe', entityId: 'r-2' });
  });

  it('卸载时退订上游', () => {
    const { rxdb, teardown } = createFixture();
    const { unmount } = renderWithProvider(rxdb);
    expect(teardown).not.toHaveBeenCalled();

    unmount();

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  // 状态没变时必须返回**同一个**对象引用：useSyncExternalStore 拿它判要不要重渲染，
  // 每次新建对象会让任何一次父级重渲染都触发一轮无谓的重渲染，
  // 调用方也没法把它安全地放进 useEffect / useMemo 的依赖数组。
  it('状态不变时快照引用稳定', () => {
    const { hub, rxdb } = createFixture();
    const { result, rerender } = renderWithProvider(rxdb);
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);

    act(() => hub.reportOfflineWrite());
    expect(result.current).not.toBe(first);
  });

  // 没有库就没有同步状态可言。这里不返回一份「一切正常」的默认值：
  // 那会把「面板没接上」伪装成「没有待推变更」，恰好是最需要出声的时候不出声。
  it('没有 Provider 时抛错，不返回伪造的正常态', () => {
    expect(() => renderHook(() => useSyncState())).toThrow(/No RxDB instance found/);
  });
});
