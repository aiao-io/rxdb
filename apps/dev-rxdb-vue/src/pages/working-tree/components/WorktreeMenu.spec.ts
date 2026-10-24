import { WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { mount, type VueWrapper } from '@vue/test-utils';
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
    props: {
      rows: [row()],
      mounted,
      activeBranch: mounted.isMain ? 'main' : 'feature',
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
    await wrapper.setProps({ onAdd: add });
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create-name"]').setValue('new tree');
    await wrapper.get('[data-testid="wt-worktree-create-confirm"]').trigger('click');

    expect(add).toHaveBeenCalledWith({ name: 'new tree', branchId: 'free' });
    expect(wrapper.find('[data-testid="wt-worktree-create-dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-create"]').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="wt-worktree-create-dialog"]').exists()).toBe(false);
  });

  it('链接检出位可以改名和删除，主检出位没有这两个操作', async () => {
    const rename = vi.fn();
    const remove = vi.fn();
    const wrapper = mountMenu();
    await wrapper.setProps({ onRename: rename, onRemove: remove });
    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-rename-w1"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-rename-name"]').setValue('renamed');
    await wrapper.get('[data-testid="wt-worktree-rename-confirm"]').trigger('click');
    expect(rename).toHaveBeenCalledWith({ id: 'w1', name: 'renamed' });

    await wrapper.get('[data-testid="wt-worktree-menu"]').trigger('click');
    await wrapper.get('[data-testid="wt-worktree-delete-w1"]').trigger('click');
    expect(wrapper.get('[data-testid="wt-worktree-delete-dialog"]')).toBeTruthy();
    await wrapper.get('[data-testid="wt-worktree-delete-confirm"]').trigger('click');
    expect(remove).toHaveBeenCalledWith('w1');
  });
});
