import { WorktreeTableSet } from '@aiao/rxdb';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, shallowRef } from 'vue';
import AppBranchManager from './AppBranchManager.vue';

/**
 * @fileoverview 侧栏分支选择器认当前分支（US-314 C2.1，Angular / React 端同名用例的移植）：挂在可写检出位上时，
 * 当前分支是那套表持有的那一条，不是 `activated` 为真的那一条。
 */

const shadow = WorktreeTableSet.of('wt_x', []);

const mocks = vi.hoisted(() => ({
  branches: undefined as unknown,
  mounted: undefined as unknown,
  switchBranch: vi.fn(),
  toastError: vi.fn()
}));

vi.mock('@aiao/rxdb-vue', () => ({
  useFindAll: () => mocks.branches,
  useRxDB: () => ({ versionManager: { switchBranch: mocks.switchBranch, createBranch: vi.fn() } })
}));

vi.mock('@aiao/rxdb-plugin-working-tree-vue', () => ({
  useWorktrees: () => ({ mounted: mocks.mounted })
}));

vi.mock('../composables/useToast', async importOriginal => ({
  ...(await importOriginal<typeof import('../composables/useToast')>()),
  useToast: () => ({ error: mocks.toastError })
}));

/** 主检出位停在 `active` 上：那一条持有主检出位的哨兵、`activated` 为真 */
const mainCheckoutOn = (active: 'main' | 'feature') => [
  { id: 'main', activated: active === 'main', activeKey: active === 'main' ? WorktreeTableSet.MAIN.holderKey : null },
  {
    id: 'feature',
    activated: active === 'feature',
    activeKey: active === 'feature' ? WorktreeTableSet.MAIN.holderKey : null
  }
];

const mountedWrappers: VueWrapper[] = [];

beforeEach(() => {
  // useFindAll 交回的是带 `value` 的资源对象，不是 ref（模板里照样写 `branches.value`）
  mocks.branches = {
    value: [
      { id: 'main', activated: true, activeKey: WorktreeTableSet.MAIN.holderKey },
      { id: 'feature', activated: false, activeKey: shadow.holderKey }
    ]
  };
  mocks.mounted = shallowRef<WorktreeTableSet>(shadow);
});

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
});

describe('AppBranchManager：当前分支（US-314 C2.1）', () => {
  it('挂在检出位上选中的是那套表持有的分支；挂回主检出位选中主检出位停着的那条', async () => {
    const wrapper = mount(AppBranchManager);
    mountedWrappers.push(wrapper);
    const select = wrapper.get<HTMLSelectElement>('[data-testid="app-branch-select"]');

    expect(select.attributes('aria-label')).toBe('当前分支');
    expect(select.element.value).toBe('feature');

    (mocks.mounted as { value: WorktreeTableSet }).value = WorktreeTableSet.MAIN;
    await wrapper.vm.$nextTick();

    expect(select.element.value).toBe('main');
  });
});

// 与 React 端「rolls back the selection and exposes switch failures」「switches branches and waits for the
// active branch source」同一场景
describe('AppBranchManager：切换分支', () => {
  beforeEach(() => {
    mocks.switchBranch.mockReset();
    mocks.toastError.mockReset();
    // 活查询资源：响应式对象，改 value 就像分支数据回传
    mocks.branches = reactive({ value: mainCheckoutOn('main') });
    mocks.mounted = shallowRef<WorktreeTableSet>(WorktreeTableSet.MAIN);
  });

  const renderOnMain = () => {
    const wrapper = mount(AppBranchManager);
    mountedWrappers.push(wrapper);
    const select = wrapper.get<HTMLSelectElement>('[data-testid="app-branch-select"]');
    expect(select.element.value).toBe('main');
    return { select, wrapper };
  };

  it('切换失败后选择器回到真实分支，并提示失败原因', async () => {
    mocks.switchBranch.mockRejectedValue(new Error('switch failed'));
    const { select } = renderOnMain();

    await select.setValue('feature');
    await flushPromises();

    expect(mocks.switchBranch).toHaveBeenCalledWith('feature');
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('switch failed'));
    expect(select.element.value).toBe('main');
  });

  it('切换成功后等分支数据回传再改选中项', async () => {
    mocks.switchBranch.mockResolvedValue(undefined);
    const { select, wrapper } = renderOnMain();

    await select.setValue('feature');
    await flushPromises();

    expect(mocks.switchBranch).toHaveBeenCalledWith('feature');
    expect(select.element.value).toBe('main');
    (mocks.branches as { value: unknown }).value = mainCheckoutOn('feature');
    await wrapper.vm.$nextTick();
    expect(select.element.value).toBe('feature');
  });
});
