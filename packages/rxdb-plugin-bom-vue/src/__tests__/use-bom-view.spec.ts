/** @fileoverview 仅替换控制器边界，验证 Vue 容器、命令透传与 scope 清理，不模拟领域算法。 */

import { RxDB } from '@aiao/rxdb';
import {
  createBomView,
  type BomViewCommands,
  type BomViewHandle,
  type BomViewInput,
  type BomViewState
} from '@aiao/rxdb-plugin-bom';
import { BehaviorSubject, Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, isReadonly, isRef, nextTick, type ComputedRef, type EffectScope } from 'vue';
import { useBomView } from '../use-bom-view.js';
import { viewInput, viewNode, viewState } from './fixtures.js';

vi.mock('@aiao/rxdb-plugin-bom', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-plugin-bom')>();
  return { ...actual, createBomView: vi.fn() };
});

const scopes: EffectScope[] = [];
let sequence = 0;

const controller = (initial = viewState()) => {
  const subject = new BehaviorSubject(initial);
  const unsubscribed = vi.fn();
  const failure = new Error('完整数量消费被拒绝');
  const handle: BomViewHandle = {
    state$: new Observable(observer => {
      const subscription = subject.subscribe(observer);
      return () => {
        subscription.unsubscribe();
        unsubscribed();
      };
    }),
    setInput: vi.fn<BomViewCommands['setInput']>(),
    refresh: vi.fn<BomViewCommands['refresh']>(),
    toggle: vi.fn<BomViewCommands['toggle']>(),
    loadOccurrence: vi.fn<BomViewCommands['loadOccurrence']>().mockResolvedValue(undefined),
    saveOccurrence: vi.fn<BomViewCommands['saveOccurrence']>().mockResolvedValue(undefined),
    calculate: vi.fn<BomViewCommands['calculate']>().mockRejectedValue(failure),
    destroy: vi.fn(() => subject.complete())
  };
  return { handle, subject, unsubscribed, failure };
};

const bind = (handle: BomViewHandle, input: BomViewInput = viewInput()) => {
  vi.mocked(createBomView).mockReturnValueOnce(handle);
  const db = new RxDB({ dbName: `bom-vue-binding-${sequence++}`, entities: [] });
  const scope = effectScope();
  scopes.push(scope);
  const binding = scope.run(() => useBomView(db, input));
  if (!binding) throw new Error('绑定必须返回资源');
  return { binding, scope, db, input };
};

afterEach(() => {
  while (scopes.length > 0) scopes.pop()?.stop();
  vi.clearAllMocks();
});

describe('useBomView（Vue）', () => {
  it('显式 db/input 只创建一个共享控制器，state 是只读 ComputedRef', async () => {
    const core = controller(viewState({ phase: 'loading' }));
    const { binding, db, input } = bind(core.handle);
    const state: ComputedRef<BomViewState> = binding.state;
    expect(createBomView).toHaveBeenCalledExactlyOnceWith(db, input);
    expect(isRef(state)).toBe(true);
    expect(isReadonly(state)).toBe(true);
    expect(state.value.phase).toBe('loading');
    core.subject.next(viewState({ phase: 'success', nodes: [viewNode(['one'])] }));
    await nextTick();
    expect(state.value.phase).toBe('success');
    expect(state.value.nodes).toHaveLength(1);
    expect(createBomView).toHaveBeenCalledTimes(1);
  });

  it('同一容器持续接收刷新、空和原始错误状态，不重新拼错误', async () => {
    const core = controller(viewState({ phase: 'success', nodes: [viewNode(['one'])] }));
    const { binding } = bind(core.handle);
    const original = binding.state;
    core.subject.next(viewState({ phase: 'loading', refreshing: true, nodes: [viewNode(['one'])] }));
    await nextTick();
    expect(binding.state).toBe(original);
    expect(binding.state.value.refreshing).toBe(true);
    expect(binding.state.value.nodes).toHaveLength(1);
    core.subject.next(viewState({ phase: 'empty' }));
    await nextTick();
    expect(binding.state.value.phase).toBe('empty');
    const failure = new Error('检测到环：A → B → A');
    core.subject.next(viewState({ phase: 'error', error: failure }));
    await nextTick();
    expect(binding.state.value.phase).toBe('error');
    expect(binding.state.value.error).toBe(failure);
  });

  it('只替换 state 容器，完整命令组与参数和拒绝原因原样透传', async () => {
    const core = controller();
    const { binding } = bind(core.handle);
    expect(Object.keys(binding).sort()).toEqual([
      'calculate',
      'loadOccurrence',
      'refresh',
      'saveOccurrence',
      'setInput',
      'state',
      'toggle'
    ]);
    const next = viewInput();
    next.context.asOfDate = new Date('2099-02-01T00:00:00.000Z');
    const path = ['assembly-one', 'occurrence-two'];
    const patch = {
      qty: '1.234567890123456789012345678901234',
      componentScrap: '0.05',
      operationSeq: 20,
      effectiveFrom: new Date('2099-02-01T00:00:00.000Z'),
      effectiveTo: null
    };
    binding.setInput(next);
    binding.refresh();
    binding.toggle(path);
    await binding.loadOccurrence('draft-occurrence');
    await binding.saveOccurrence(patch);
    await expect(binding.calculate()).rejects.toBe(core.failure);
    expect(core.handle.setInput).toHaveBeenCalledExactlyOnceWith(next);
    expect(core.handle.refresh).toHaveBeenCalledTimes(1);
    expect(core.handle.toggle).toHaveBeenCalledExactlyOnceWith(path);
    expect(core.handle.loadOccurrence).toHaveBeenCalledExactlyOnceWith('draft-occurrence');
    expect(core.handle.saveOccurrence).toHaveBeenCalledExactlyOnceWith(patch);
    expect(core.handle.calculate).toHaveBeenCalledTimes(1);
  });

  it('scope 停止后销毁控制器并结束状态订阅，重复 stop 不重复清理', async () => {
    const core = controller(viewState({ phase: 'loading' }));
    const { binding, scope } = bind(core.handle);
    scope.stop();
    scope.stop();
    expect(core.handle.destroy).toHaveBeenCalledTimes(1);
    expect(core.unsubscribed).toHaveBeenCalledTimes(1);
    core.subject.next(viewState({ phase: 'empty' }));
    await nextTick();
    expect(binding.state.value.phase).toBe('loading');
  });

  it('两份作用域各用自己的控制器，销毁一份不停止另一份', async () => {
    const first = controller(viewState({ phase: 'loading' }));
    const second = controller(viewState({ phase: 'empty' }));
    const one = bind(first.handle);
    const two = bind(second.handle);
    one.scope.stop();
    second.subject.next(viewState({ phase: 'success', nodes: [viewNode(['second-db'])] }));
    await nextTick();
    expect(first.handle.destroy).toHaveBeenCalledTimes(1);
    expect(second.handle.destroy).not.toHaveBeenCalled();
    expect(one.binding.state.value.phase).toBe('loading');
    expect(two.binding.state.value.nodes[0].path).toEqual(['second-db']);
    expect(createBomView).toHaveBeenNthCalledWith(1, one.db, one.input);
    expect(createBomView).toHaveBeenNthCalledWith(2, two.db, two.input);
  });
});
