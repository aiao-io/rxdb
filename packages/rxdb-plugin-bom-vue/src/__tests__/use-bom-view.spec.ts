import type { RxDB } from '@aiao/rxdb';
import * as bom from '@aiao/rxdb-plugin-bom';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, isReadonly, nextTick } from 'vue';
import { useBomView } from '../index.js';
import { handle, input, state } from './test-utils.js';

vi.mock('@aiao/rxdb-plugin-bom', async original => ({
  ...(await original<typeof import('@aiao/rxdb-plugin-bom')>()),
  createBomView: vi.fn()
}));

afterEach(() => vi.restoreAllMocks());

describe('Vue useBomView', () => {
  it('显式数据库和完整输入原样传入共享控制器，输出是只读 shallowRef', () => {
    const core = handle();
    vi.mocked(bom.createBomView).mockReturnValue(core);
    const db = {} as RxDB;
    const scope = effectScope();
    try {
      const binding = scope.run(() => useBomView(db, input));
      expect(bom.createBomView).toHaveBeenCalledWith(db, input);
      expect(isReadonly(binding?.state)).toBe(true);
      expect(binding?.state.value).toBe(core.state$.value);
      const next = state({ refreshing: true });
      core.state$.next(next);
      expect(binding?.state.value).toBe(next);
    } finally {
      scope.stop();
    }
  });

  it('输入、折叠、独立编辑、保存、计算和刷新命令原样委托', async () => {
    const core = handle();
    vi.mocked(bom.createBomView).mockReturnValue(core);
    const scope = effectScope();
    const binding = scope.run(() => useBomView({} as RxDB, input));
    if (!binding) throw new Error('没有创建 Vue scope');
    try {
      const next = { ...input, plannedQty: { value: '3', uom: 'pcs' }, params: { factor: '5' } };
      binding.commands.setInput(next);
      binding.commands.toggle(['a', 'b']);
      binding.commands.refresh();
      await binding.commands.loadOccurrence('draft');
      await binding.commands.saveOccurrence({ qty: '9' });
      await expect(binding.commands.calculate()).resolves.toEqual(await core.calculate());
      expect(core.setInput).toHaveBeenCalledWith(next);
      expect(core.toggle).toHaveBeenCalledWith(['a', 'b']);
      expect(core.refresh).toHaveBeenCalledOnce();
      expect(core.loadOccurrence).toHaveBeenCalledWith('draft');
      expect(core.saveOccurrence).toHaveBeenCalledWith({ qty: '9' });
    } finally {
      scope.stop();
    }
  });

  it('真实组件卸载释放订阅并销毁 handle，重挂使用新 handle', async () => {
    const first = handle();
    const second = handle();
    vi.mocked(bom.createBomView).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const Component = defineComponent({
      setup() {
        const binding = useBomView({} as RxDB, input);
        return () => h('output', binding.state.value.phase);
      }
    });
    const wrapper = mount(Component);
    first.state$.next(state({ phase: 'empty' }));
    await nextTick();
    expect(wrapper.text()).toBe('empty');
    wrapper.unmount();
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(first.state$.observed).toBe(false);
    const remounted = mount(Component);
    first.state$.next(state({ phase: 'error' }));
    await nextTick();
    expect(remounted.text()).toBe('success');
    remounted.unmount();
    expect(second.destroy).toHaveBeenCalledOnce();
  });

  it('没有可释放的 scope 时在创建订阅之前明确拒绝', () => {
    vi.mocked(bom.createBomView).mockClear();
    expect(() => useBomView({} as RxDB, input)).toThrow(/scope|setup|作用域/);
    expect(bom.createBomView).not.toHaveBeenCalled();
  });
});
