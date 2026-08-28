/**
 * `useSyncState` —— Vue 侧。
 *
 * @remarks
 * 与 `packages/rxdb-angular/src/__tests__/use-sync-state.spec.ts`、
 * `packages/rxdb-react/src/__tests__/use-sync-state.spec.tsx` **逐条对齐**：三端共用同一份
 * 语义（同名字段、同初值来源、同退订时机、无 provider 时同样抛错），只是容器形态不同 ——
 * Vue 是 `ComputedRef`，Angular 是 `Signal`，React 是渲染快照。
 *
 * 行为断言全部打在**真的** `SyncStateHub` 上而不是探针：这一层要证明的是「面板显示的
 * 是不是库当前的同步状态」，断言方法被调用过只能证明有人喊了一声。`state$` 外面再包一层
 * 是为了让「退订」这件事可断言 —— hub 自己没有暴露订阅数。
 */
import { RxDB, SyncStateHub, type SyncState } from '@aiao/rxdb';
import { mount } from '@vue/test-utils';
import { BehaviorSubject, Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { useSyncState, type SyncStateResource } from '../use-sync-state';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

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

/** 在 provider 子树的 setup 里调用 hook，把返回值取出来供断言 */
const mountWithProvider = (rxdb: RxDB) => {
  let state!: SyncStateResource;
  const wrapper = mount(
    createRxDBProviderHarness(
      rxdb,
      createSetupHarness(() => (state = useSyncState()))
    )
  );
  return { state: () => state, wrapper };
};

describe('useSyncState', () => {
  it('初值就是库当前的同步快照', () => {
    const { hub, rxdb } = createFixture();
    hub.reportOutboxCount(2);
    hub.reportConflict({ namespace: 'public', entity: 'Recipe', entityId: 'r-1', winner: 'remote' });

    const state = mountWithProvider(rxdb).state();

    expect(state.online.value).toBe(true);
    expect(state.pendingCount.value).toBe(2);
    expect(state.syncing.value).toBe(false);
    expect(state.lastError.value).toBeNull();
    expect(state.lastConflict.value).toMatchObject({ entityId: 'r-1', winner: 'remote' });
  });

  it('离线写入队后待推数跟着涨', () => {
    const { hub, rxdb } = createFixture();
    const state = mountWithProvider(rxdb).state();
    expect(state.pendingCount.value).toBe(0);

    hub.reportOfflineWrite();

    expect(state.pendingCount.value).toBe(1);
  });

  it('一轮回推期间 syncing 为真，收尾后复位', () => {
    const { hub, rxdb } = createFixture();
    const state = mountWithProvider(rxdb).state();

    hub.beginRound();
    expect(state.syncing.value).toBe(true);

    hub.endRound();
    expect(state.syncing.value).toBe(false);
  });

  it('回推失败落在 lastError，成功一轮后清空', () => {
    const { hub, rxdb } = createFixture();
    const state = mountWithProvider(rxdb).state();
    const failure = new Error('remote unreachable');

    hub.reportError(failure);
    expect(state.lastError.value).toBe(failure);

    hub.reportSuccess();
    expect(state.lastError.value).toBeNull();
  });

  // 冲突是历史事实，不该被后续的成功抹掉 —— 用户需要知道自己离线时的改动被判负过
  it('冲突判定留在 lastConflict，不被后续成功清空', () => {
    const { hub, rxdb } = createFixture();
    const state = mountWithProvider(rxdb).state();

    hub.reportConflict({ namespace: 'public', entity: 'Recipe', entityId: 'r-2', winner: 'remote' });
    hub.reportSuccess();

    expect(state.lastConflict.value).toMatchObject({ namespace: 'public', entity: 'Recipe', entityId: 'r-2' });
  });

  it('作用域销毁时退订上游', () => {
    const { rxdb, teardown } = createFixture();
    const { wrapper } = mountWithProvider(rxdb);
    expect(teardown).not.toHaveBeenCalled();

    wrapper.unmount();

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  // 没有库就没有同步状态可言。这里不返回一份「一切正常」的默认值：
  // 那会把「面板没接上」伪装成「没有待推变更」，恰好是最需要出声的时候不出声。
  it('没有 provider 时抛错，不返回伪造的正常态', () => {
    expect(() => mount(createSetupHarness(() => useSyncState()))).toThrow(/RxDB instance not found/);
  });
});
