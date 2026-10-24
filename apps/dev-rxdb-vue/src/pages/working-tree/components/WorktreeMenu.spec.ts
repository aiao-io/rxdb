import { WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorktreeMenu from './WorktreeMenu.vue';

const shadow = WorktreeTableSet.of('wt_123', []);
const branch = (id: string, activeKey: string | null): RxDBBranch =>
  ({ id, activeKey, activated: activeKey === WorktreeTableSet.MAIN.holderKey }) as RxDBBranch;
const row = (overrides: Partial<Worktree> = {}): Worktree =>
  ({
    id: 'w1',
    mode: 'writable',
    kind: 'branch',
    branchId: 'feature',
    commitId: null,
    sourceBranchId: null,
    sourceChangeId: null,
    targetChangeId: null,
    dbName: null,
    tableSetSuffix: 'wt_123',
    name: 'Feature worktree',
    owner: 'persistent',
    state: 'ready',
    schemaFingerprint: 'fingerprint',
    createdAt: new Date(0),
    lastAccessedAt: new Date(0),
    ...overrides
  }) as Worktree;

const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

function mountMenu(mounted = shadow): VueWrapper {
  const wrapper = mount(WorktreeMenu, {
    attachTo: document.body,
    props: {
      rows: [row()],
      mounted,
      activeBranch: mounted.isMain ? 'main' : 'feature',
      createWorktree: async () => undefined,
      renameWorktree: async () => undefined,
      deleteWorktree: async () => undefined,
      branches: [
        branch('main', WorktreeTableSet.MAIN.holderKey),
        branch('feature', shadow.holderKey),
        branch('free', null)
      ]
    }
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe('WorktreeMenu', () => {
  it('按 Main / Linked 分组，并给当前检出位 aria-current', async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');

    expect(wrapper.get('.gd-menu-header').text()).toContain('Main worktree');
    expect(wrapper.findAll('.gd-menu-header')[1]?.text()).toContain('Linked worktrees');
    expect(wrapper.get('[data-testid="wt-worktree-item"][data-worktree-id="w1"]').attributes('aria-current')).toBe(
      'true'
    );
    expect(
      wrapper.get('[data-testid="wt-worktree-item"][data-worktree-id="main"]').attributes('aria-current')
    ).toBeUndefined();
  });

  it('New Worktree 对话框可提交，Escape 关闭', async () => {
    const add = vi.fn();
    const wrapper = mountMenu(WorktreeTableSet.MAIN);
    await wrapper.setProps({ createWorktree: add });
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create-name"]').setValue('new tree');
    await wrapper.get('[data-testid="wt-worktree-create-confirm"]').trigger('click');

    await flushPromises();
    expect(add).toHaveBeenCalledWith({ name: 'new tree', branchId: null });
    expect(wrapper.find('[data-testid="wt-worktree-create-dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create-name"]').trigger('keydown', { key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="wt-worktree-create-dialog"]').exists()).toBe(false);
  });

  it('异步失败保留草稿、阻止重复提交和忙碌时关闭，并忽略输入法 Enter/Escape', async () => {
    const wrapper = mountMenu();
    let reject: (error: Error) => void = () => undefined;
    const create = vi.fn(() => new Promise<void>((_, rejectPromise) => (reject = rejectPromise)));
    await wrapper.setProps({ createWorktree: create });
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create"]').trigger('click');
    const input = wrapper.get('[data-testid="wt-worktree-create-name"]');
    await input.setValue('draft');
    await input.trigger('keydown', { key: 'Enter', isComposing: true });
    await input.trigger('keydown', { key: 'Escape', isComposing: true });
    expect(create).not.toHaveBeenCalled();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('keydown', { key: 'Escape' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="wt-worktree-create-dialog"]').exists()).toBe(true);
    reject(new Error('branch unavailable'));
    await flushPromises();
    expect(wrapper.get('[data-testid="wt-worktree-error"]').text()).toContain('branch unavailable');
    expect(wrapper.get<HTMLInputElement>('[data-testid="wt-worktree-create-name"]').element.value).toBe('draft');
  });

  it('Main 行展示主检出位分支，不随当前 linked 分支改变', async () => {
    const wrapper = mountMenu();
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    expect(wrapper.get('[data-worktree-id="main"]').text()).toContain('main');
    expect(wrapper.get('[data-worktree-id="main"]').text()).not.toContain('feature');
  });

  it('链接检出位可以改名和删除，主检出位没有这两个操作', async () => {
    const rename = vi.fn();
    const remove = vi.fn();
    const wrapper = mountMenu();
    await wrapper.setProps({ renameWorktree: rename, deleteWorktree: remove });
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-rename-w1"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-rename-name"]').setValue('renamed');
    await wrapper.get('[data-testid="wt-worktree-rename-confirm"]').trigger('click');
    await flushPromises();
    expect(rename).toHaveBeenCalledWith({ id: 'w1', name: 'renamed' });

    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-delete-w1"]').trigger('click');
    expect(wrapper.get('[data-testid="wt-worktree-delete-dialog"]')).toBeTruthy();
    await wrapper.get('[data-testid="wt-worktree-delete-confirm"]').trigger('click');
    await flushPromises();
    expect(remove).toHaveBeenCalledWith('w1');
  });
});
