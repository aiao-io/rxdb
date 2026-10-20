import { RxDB, SyncType } from '@aiao/rxdb';
import { createBomView, type BomViewHandle } from '@aiao/rxdb-plugin-bom';
import { mount } from '@vue/test-utils';
import { BehaviorSubject, Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, isReadonly, nextTick, ref, shallowRef } from 'vue';
import { useBomView, type BomViewCommands, type BomViewInput, type BomViewState } from '../index.js';
import { viewCommands, viewNode, viewState } from './fixtures.js';

vi.mock('@aiao/rxdb-plugin-bom', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-bom')>()),
  createBomView: vi.fn()
}));

const db = new RxDB({ dbName: 'vue-bom-binding', entities: [], sync: { type: SyncType.None } });
const otherDb = new RxDB({ dbName: 'vue-bom-binding-other', entities: [], sync: { type: SyncType.None } });
const input: BomViewInput = {
  context: { bomType: 'ebom', orgId: 'X', asOfDate: new Date('2099-01-01T00:00:00Z') },
  target: { parentItemId: 'root' },
  plannedQty: { value: '1', uom: 'pcs' }
};

const probeHandle = () => {
  const subject = new BehaviorSubject(viewState());
  let destroyed = false;
  const counts = { active: 0 };
  const commands: BomViewCommands = viewCommands();
  const handle: BomViewHandle = {
    ...commands,
    state$: new Observable<BomViewState>(subscriber => {
      if (destroyed) throw new Error('已销毁的 handle 不能重订阅');
      counts.active += 1;
      const subscription = subject.subscribe(subscriber);
      return () => {
        counts.active -= 1;
        subscription.unsubscribe();
      };
    }),
    destroy: vi.fn(() => {
      destroyed = true;
      subject.complete();
    })
  };
  return { handle, subject, counts };
};

const handles: ReturnType<typeof probeHandle>[] = [];

beforeEach(() => {
  handles.length = 0;
  vi.mocked(createBomView).mockReset();
  vi.mocked(createBomView).mockImplementation(() => {
    const probe = probeHandle();
    handles.push(probe);
    return probe.handle;
  });
});

/** 在独立 effectScope 中运行绑定，返回绑定与停止函数。 */
const scoped = <T>(run: () => T): { binding: T; stop: () => void } => {
  const scope = effectScope();
  const binding = scope.run(run);
  if (binding === undefined) throw new Error('没有创建 Vue scope');
  return { binding, stop: () => scope.stop() };
};

describe('Vue BOM 作用域绑定', () => {
  it('真实挂载返回只读 shallowRef，加载、空、数据、错误和刷新原样透传', async () => {
    const Consumer = defineComponent({
      setup() {
        const view = useBomView(db, input);
        return () => h('output', view.state.value.phase);
      }
    });
    const wrapper = mount(Consumer);
    expect(createBomView).toHaveBeenCalledWith(db, input);
    expect(wrapper.text()).toBe('loading');
    for (const phase of ['empty', 'success', 'error'] as const) {
      handles[0].subject.next(
        viewState({
          phase,
          error: phase === 'error' ? new Error('原始查询失败') : null,
          refreshing: phase === 'success'
        })
      );
      await nextTick();
      expect(wrapper.text()).toBe(phase);
    }
    const { binding, stop } = scoped(() => useBomView(db, input));
    try {
      expect(isReadonly(binding.state)).toBe(true);
      const state = viewState({ phase: 'success' });
      handles[1].subject.next(state);
      expect(binding.state.value).toBe(state);
    } finally {
      stop();
      wrapper.unmount();
    }
  });

  it('内联重建等值完整输入时，不会再次 setInput 或重置共享视图', async () => {
    const query = ref(input);
    const { binding, stop } = scoped(() => useBomView(db, query));
    try {
      query.value = { ...input, context: { ...input.context, asOfDate: new Date(input.context.asOfDate) } };
      handles[0].subject.next(viewState({ phase: 'success', refreshing: true }));
      await nextTick();
      expect(createBomView).toHaveBeenCalledTimes(1);
      expect(handles[0].handle.setInput).not.toHaveBeenCalled();
      expect(binding.state.value.refreshing).toBe(true);
    } finally {
      stop();
    }
  });

  it('无效评估日仍交给共享控制器产生领域错误，修正日期可继续使用同一绑定', async () => {
    const query = ref(input);
    const { stop } = scoped(() => useBomView(db, query));
    try {
      const invalid = { ...input, context: { ...input.context, asOfDate: new Date(NaN) } };
      query.value = invalid;
      await nextTick();
      expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(invalid);
      query.value = input;
      await nextTick();
      expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(input);
      expect(createBomView).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it('共享命令原样代理完整输入、刷新、路径选择和保存', async () => {
    const { binding, stop } = scoped(() => useBomView(db, input));
    try {
      const next = { ...input, plannedQty: { value: '3', uom: 'pcs' } };
      binding.commands.setInput(next);
      binding.commands.refresh();
      binding.commands.toggle(['branch']);
      await binding.commands.loadOccurrence('occurrence-1');
      await binding.commands.saveOccurrence({ qty: '3' });
      await expect(binding.commands.calculate()).rejects.toThrow('测试未提供完整数量结果');
      expect(handles[0].handle.setInput).toHaveBeenCalledWith(next);
      expect(handles[0].handle.refresh).toHaveBeenCalledOnce();
      expect(handles[0].handle.toggle).toHaveBeenCalledWith(['branch']);
      expect(handles[0].handle.loadOccurrence).toHaveBeenCalledWith('occurrence-1');
      expect(handles[0].handle.saveOccurrence).toHaveBeenCalledWith({ qty: '3' });
    } finally {
      stop();
    }
  });

  it('输入切换调用当前 handle，getter 与原地修改都会自动生效且不销毁它', async () => {
    const planned = ref('1');
    const { stop } = scoped(() =>
      useBomView(db, () => ({ ...input, plannedQty: { value: planned.value, uom: 'pcs' } }))
    );
    const query = ref(structuredClone(input));
    const second = scoped(() => useBomView(db, query));
    try {
      planned.value = '3';
      query.value.plannedQty.value = '5';
      await nextTick();
      expect(createBomView).toHaveBeenCalledTimes(2);
      expect(handles[0].handle.setInput).toHaveBeenLastCalledWith({ ...input, plannedQty: { value: '3', uom: 'pcs' } });
      expect(handles[1].handle.setInput).toHaveBeenLastCalledWith({ ...input, plannedQty: { value: '5', uom: 'pcs' } });
      expect(handles[0].handle.destroy).not.toHaveBeenCalled();
      expect(handles[1].handle.destroy).not.toHaveBeenCalled();
    } finally {
      stop();
      second.stop();
    }
  });

  it('更换显式数据库会释放旧 handle，旧流迟到值不会覆盖新数据库', async () => {
    const database = shallowRef(db);
    const query = ref(input);
    const { binding, stop } = scoped(() => useBomView(database, query));
    try {
      const changed = { ...input, plannedQty: { value: '3', uom: 'pcs' } };
      database.value = otherDb;
      query.value = changed;
      await nextTick();
      expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
      expect(createBomView).toHaveBeenLastCalledWith(otherDb, changed);
      expect(handles[1].handle.setInput).not.toHaveBeenCalled();
      const fresh = viewState({ phase: 'success', nodes: [viewNode([])] });
      handles[1].subject.next(fresh);
      handles[0].subject.next(viewState({ phase: 'error', error: new Error('旧库迟到错误') }));
      expect(binding.state.value).toBe(fresh);
      expect(handles.map(probe => probe.counts.active)).toEqual([0, 1]);
    } finally {
      stop();
    }
  });

  it('作用域销毁释放订阅和 handle，重新挂载建立独立订阅，销毁后命令明确拒绝', async () => {
    const Consumer = defineComponent({
      setup() {
        const view = useBomView(db, input);
        return () => h('output', view.state.value.phase);
      }
    });
    const first = mount(Consumer);
    expect(handles[0].counts.active).toBe(1);
    const { binding, stop } = scoped(() => useBomView(db, input));
    stop();
    expect(() => binding.commands.refresh()).toThrow('BOM 视图尚未挂载或已经卸载');
    first.unmount();
    expect(handles[0].counts.active).toBe(0);
    expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
    const second = mount(Consumer);
    expect(handles).toHaveLength(3);
    expect(handles[2].counts.active).toBe(1);
    handles[0].subject.next(viewState({ phase: 'error' }));
    await nextTick();
    expect(second.text()).toBe('loading');
    second.unmount();
    expect(handles[2].handle.destroy).toHaveBeenCalledOnce();
  });

  it('两个作用域分别使用显式数据库，销毁第一份不会影响第二份', () => {
    const first = scoped(() => useBomView(db, input));
    const second = scoped(() => useBomView(otherDb, input));
    try {
      expect(createBomView).toHaveBeenNthCalledWith(1, db, input);
      expect(createBomView).toHaveBeenNthCalledWith(2, otherDb, input);
      first.stop();
      const state = viewState({ phase: 'success' });
      handles[1].subject.next(state);
      expect(second.binding.state.value).toBe(state);
      expect(handles.map(probe => probe.counts.active)).toEqual([0, 1]);
    } finally {
      second.stop();
    }
  });

  it('没有可释放的 scope 时在创建订阅之前明确拒绝', () => {
    expect(() => useBomView(db, input)).toThrow(/scope|setup|作用域/);
    expect(createBomView).not.toHaveBeenCalled();
  });
});
