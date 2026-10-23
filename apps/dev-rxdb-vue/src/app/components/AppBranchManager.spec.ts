import { WorktreeTableSet } from '@aiao/rxdb';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import AppBranchManager from './AppBranchManager.vue';

/**
 * @fileoverview 侧栏分支选择器认当前分支（US-314 C2.1，Angular / React 端同名用例的移植）：挂在可写检出位上时，
 * 当前分支是那套表持有的那一条，不是 `activated` 为真的那一条。
 */

const shadow = WorktreeTableSet.of('wt_x', []);

const mocks = vi.hoisted(() => ({
  branches: undefined as unknown,
  mounted: undefined as unknown
}));

vi.mock('@aiao/rxdb-vue', () => ({
  useFindAll: () => mocks.branches,
  useRxDB: () => ({ versionManager: { switchBranch: vi.fn(), createBranch: vi.fn() } })
}));

vi.mock('@aiao/rxdb-plugin-working-tree-vue', () => ({
  useWorktrees: () => ({ mounted: mocks.mounted })
}));

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
