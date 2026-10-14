import type { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import WorktreeMenu from './WorktreeMenu.vue';

/**
 * @fileoverview worktree 菜单创建表单的组件单测。
 *
 * @remarks
 * 锁表单自己的几条规则：派生选择（选中的分支被别处钉走就落回「Pick a branch…」占位）、label 原样交出、
 * 新分支名去掉两端空白、New branch 模式的复制提示。下拉骨架的行为在 `ToolbarDropdown.spec.ts`，
 * 真实的创建流程在 e2e。
 */

enableAutoUnmount(afterEach);

const branch = (id: string, activated = false): RxDBBranch => ({ id, activated }) as RxDBBranch;

const worktree = (branchId: string, active = false): WorktreeInfo => ({
  id: `wt-${branchId}`,
  branchId,
  label: null,
  active,
  createdAt: new Date(0)
});

interface MountOptions {
  readonly branches: readonly RxDBBranch[];
  readonly worktrees?: readonly WorktreeInfo[];
  readonly uncommittedCount?: number | null;
}

/** 挂上菜单并点「New worktree」打开创建弹层。 */
const openCreate = async (options: MountOptions) => {
  const wrapper = mount(WorktreeMenu, {
    attachTo: document.body,
    props: {
      worktrees: options.worktrees ?? [worktree('main', true)],
      branches: options.branches,
      activeBranch: 'main',
      popupWidth: 320,
      busy: false,
      listError: null,
      uncommittedCount: options.uncommittedCount ?? null,
      menuOpen: true
    }
  });
  await wrapper.get('[data-testid="wt-worktree-create"]').trigger('click');
  return wrapper;
};

const confirm = async (wrapper: Awaited<ReturnType<typeof openCreate>>): Promise<void> => {
  await wrapper.get('[data-testid="wt-worktree-create-confirm"]').trigger('click');
};

describe('WorktreeMenu 创建表单', () => {
  it('有候选时打开即 Existing branch、预选第一个候选并聚焦下拉框；首项是禁用的占位', async () => {
    const wrapper = await openCreate({ branches: [branch('main', true), branch('feature/x')] });

    const select = wrapper.get('[data-testid="wt-worktree-branch"]');
    expect((select.element as HTMLSelectElement).value).toBe('feature/x');
    expect(document.activeElement).toBe(select.element);
    const placeholder = select.findAll('option')[0];
    expect(placeholder.text()).toBe('Pick a branch…');
    expect(placeholder.attributes('value')).toBe('');
    expect(placeholder.attributes('disabled')).toBeDefined();
  });

  it('选中的分支被别处钉走后落回占位；此时 Create 就地报「Pick a branch.」、不往页面交', async () => {
    const wrapper = await openCreate({
      branches: [branch('main', true), branch('feature/x'), branch('feature/y')]
    });

    // 实时列表推来一行：feature/x 刚在别处被钉成 worktree，不再是候选。
    await wrapper.setProps({ worktrees: [worktree('main', true), worktree('feature/x')] });
    expect((wrapper.get('[data-testid="wt-worktree-branch"]').element as HTMLSelectElement).value).toBe('');

    await confirm(wrapper);
    expect(wrapper.emitted('createWorktree')).toBeUndefined();
    expect(wrapper.get('[data-testid="wt-worktree-create-popover"] [role="alert"]').text()).toBe('Pick a branch.');
  });

  it('label 原样交出（不 trim）、空串交 undefined；新分支名去掉两端空白，空名就地报错', async () => {
    const wrapper = await openCreate({ branches: [branch('main', true)] });

    await confirm(wrapper);
    expect(wrapper.emitted('createWorktree')).toBeUndefined();
    expect(wrapper.get('[data-testid="wt-worktree-create-popover"] [role="alert"]').text()).toBe(
      'Branch name is required.'
    );

    await wrapper.get('[data-testid="wt-worktree-new-branch"]').setValue('  feature/y  ');
    await wrapper.get('[data-testid="wt-worktree-label"]').setValue(' Feature Y ');
    await confirm(wrapper);
    await wrapper.get('[data-testid="wt-worktree-label"]').setValue('');
    await confirm(wrapper);

    expect(wrapper.emitted('createWorktree')).toEqual([
      [{ mode: 'new', branchId: 'feature/y', label: ' Feature Y ' }],
      [{ mode: 'new', branchId: 'feature/y', label: undefined }]
    ]);
  });

  it('New branch 模式下有未提交改动时提示会复制它们（单复数）；Existing branch 模式或干净时不提示', async () => {
    const wrapper = await openCreate({
      branches: [branch('main', true), branch('feature/x')],
      uncommittedCount: 1
    });
    const note = () => wrapper.find('[data-testid="wt-worktree-copy-note"]');

    expect(note().exists()).toBe(false);
    await wrapper.get('[data-testid="wt-worktree-mode-new"]').trigger('change');
    expect(note().text()).toBe('The new branch starts with a copy of your 1 uncommitted change.');
    expect(document.activeElement).toBe(wrapper.get('[data-testid="wt-worktree-new-branch"]').element);

    await wrapper.setProps({ uncommittedCount: 3 });
    expect(note().text()).toBe('The new branch starts with a copy of your 3 uncommitted changes.');
    await wrapper.setProps({ uncommittedCount: null });
    expect(note().exists()).toBe(false);
  });
});
