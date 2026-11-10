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
import { SYNC_REJECTIONS_FIXTURE, SYNC_REJECTIONS_NEXT_ROUND_FIXTURE } from '@aiao/rxdb-test';
import { mount } from '@vue/test-utils';
import { BehaviorSubject, Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import { type RxDBInput } from '../rxdb-vue';
import { useSyncState, type SyncStateResource } from '../use-sync-state';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

const createFixture = () => {
  const hub = new SyncStateHub({ online$: new BehaviorSubject(true) });
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
const mountWithProvider = (rxdb: RxDBInput<RxDB>) => {
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

  // US-218 AC#16：被拒列表是历史事实，与 lastConflict 同理不被后续成功清空；下一轮有被拒时整体替换
  it('被拒列表读到 hub 上报的同一引用，成功一轮仍保留，再上报整体替换', () => {
    const { hub, rxdb } = createFixture();
    const state = mountWithProvider(rxdb).state();
    expect(state.lastRejections.value).toEqual([]);

    hub.reportRejections(SYNC_REJECTIONS_FIXTURE);
    expect(state.lastRejections.value).toBe(SYNC_REJECTIONS_FIXTURE);

    hub.reportSuccess();
    expect(state.lastRejections.value).toBe(SYNC_REJECTIONS_FIXTURE);

    hub.reportRejections(SYNC_REJECTIONS_NEXT_ROUND_FIXTURE);
    expect(state.lastRejections.value).toBe(SYNC_REJECTIONS_NEXT_ROUND_FIXTURE);
  });

  // RV-01a1bb2cb3a0：provideRxDB 收调用方持有的 Ref，换库后面板必须跟随新库，
  // 旧库的后续变化不能再改面板，旧订阅当场释放而不是拖到卸载。React 侧随 provider 重新取 hub
  it('provider 的数据库 Ref 换库后跟随新库，旧库后续变化不再影响面板', () => {
    const first = createFixture();
    const second = createFixture();
    first.hub.reportOutboxCount(1);
    second.hub.reportOutboxCount(20);
    const databaseRef = shallowRef<RxDB | undefined>(first.rxdb);
    const { state, wrapper } = mountWithProvider(databaseRef);
    expect(state().pendingCount.value).toBe(1);

    databaseRef.value = second.rxdb;

    expect(state().pendingCount.value).toBe(20);
    expect(first.teardown).toHaveBeenCalledTimes(1);
    first.hub.reportOutboxCount(7);
    second.hub.reportOutboxCount(21);
    expect(state().pendingCount.value).toBe(21);

    wrapper.unmount();
    expect(second.teardown).toHaveBeenCalledTimes(1);
  });

  it('provider 的数据库 Ref 经过 undefined 再换成新库时同样跟随新库', () => {
    const first = createFixture();
    const second = createFixture();
    second.hub.reportOutboxCount(3);
    const databaseRef = shallowRef<RxDB | undefined>(first.rxdb);
    const { state } = mountWithProvider(databaseRef);

    databaseRef.value = undefined;
    databaseRef.value = second.rxdb;

    expect(state().pendingCount.value).toBe(3);
    expect(first.teardown).toHaveBeenCalledTimes(1);
    first.hub.reportOutboxCount(9);
    expect(state().pendingCount.value).toBe(3);
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
