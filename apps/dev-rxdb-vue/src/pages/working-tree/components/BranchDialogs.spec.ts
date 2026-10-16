import type { BranchComparison, MergePreview } from '@aiao/rxdb-plugin-history';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import CompareDialog, { type CompareDialogState } from './CompareDialog.vue';
import MergeDialog, { type MergeDialogState } from './MergeDialog.vue';

/**
 * @fileoverview 合并预览与对比对话框的展示契约（Angular / React 端同名 spec 的移植）。
 *
 * @remarks
 * 预览只是参考：读失败只显示错误，合并照常能点。两个对话框共用一个外壳：背板与面板是兄弟节点，
 * 打开时焦点进面板，面板里按 Escape 关闭，Tab 在面板里首尾回绕，关闭后焦点还给打开前持有它的元素。
 */

const dialog: MergeDialogState = { sourceBranchId: 'feature', strategy: 'squash', deleteSource: false };

const preview: MergePreview = {
  sourceBranchId: 'feature',
  targetBranchId: 'main',
  strategy: 'squash',
  merged: 1,
  entries: [
    {
      namespace: 'public',
      entity: 'Todo',
      entityId: 't1',
      operation: 'UPDATE',
      patch: { title: 'from-feature' },
      inversePatch: { title: 'from-main' },
      conflict: { kind: 'overwrite', fields: ['title'] }
    }
  ]
};

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

/** 挂到 document 上：焦点断言要求元素在文档里。 */
const mountMergeDialog = (props: Partial<InstanceType<typeof MergeDialog>['$props']> = {}) => {
  const wrapper = mount(MergeDialog, {
    attachTo: document.body,
    props: { activeBranch: 'main', dialog, error: null, preview: { phase: 'success', value: preview }, ...props }
  });
  mounted.push(wrapper);
  return wrapper;
};

const mountCompareDialog = (comparison: CompareDialogState['comparison']) => {
  const wrapper = mount(CompareDialog, {
    attachTo: document.body,
    props: { activeBranch: 'main', dialog: { branchId: 'feature', comparison } }
  });
  mounted.push(wrapper);
  return wrapper;
};

/** 对话框的可读名：`aria-labelledby` 指向的标题文本。 */
const accessibleName = (wrapper: VueWrapper): string => {
  const id = wrapper.get('[role="dialog"]').attributes('aria-labelledby') ?? '';
  return document.getElementById(id)?.textContent?.trim() ?? '';
};

/** 焦点放到 `element` 上按一下 Tab（`shiftKey` 为 Shift+Tab）。 */
const pressTab = async (element: Omit<DOMWrapper<Element>, 'exists'>, shiftKey = false): Promise<void> => {
  (element.element as HTMLElement).focus();
  await element.trigger('keydown', { key: 'Tab', shiftKey });
};

describe('MergeDialog 的预览', () => {
  it('成功：摘要、条目与覆盖说明；对话框以标题命名，焦点进面板', () => {
    const wrapper = mountMergeDialog();

    expect(accessibleName(wrapper)).toBe('Merge branch');
    expect(document.activeElement).toBe(wrapper.get('[role="dialog"]').element);
    expect(wrapper.get('[data-testid="wt-merge-preview-summary"]').text()).toBe(
      'Merges 1 change from feature into main. 1 entity overlaps with changes made on main.'
    );
    expect(wrapper.findAll('[data-testid="wt-branch-diff-item"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="wt-branch-diff-conflict"]').text()).toBe("Overwrites main's changes to title");
  });

  it('读失败只显示错误，合并照常能点', async () => {
    const wrapper = mountMergeDialog({ preview: { phase: 'error', message: 'boom' } });

    expect(wrapper.get('[data-testid="wt-merge-preview-error"]').text()).toContain('boom');
    expect(wrapper.find('[data-testid="wt-branch-diff-list"]').exists()).toBe(false);
    await wrapper.get('[data-testid="wt-merge-confirm"]').trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('读取中给出提示，不画列表', () => {
    const wrapper = mountMergeDialog({ preview: { phase: 'loading' } });

    expect(wrapper.find('[data-testid="wt-merge-preview-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wt-branch-diff-list"]').exists()).toBe(false);
  });

  it('逐条合并的变更互相抵消：有计数、列表给空态', () => {
    const wrapper = mountMergeDialog({
      preview: { phase: 'success', value: { ...preview, strategy: 'normal', merged: 2, entries: [] } }
    });

    expect(wrapper.get('[data-testid="wt-merge-preview-summary"]').text()).toBe(
      'Merges 2 changes from feature into main.'
    );
    expect(wrapper.get('[data-testid="wt-branch-diff-empty"]').text()).toBe(
      'These changes cancel out; nothing on main changes.'
    );
  });

  it('面板里按 Escape、点背板都请求关闭；点面板本身不关', async () => {
    const wrapper = mountMergeDialog();

    await wrapper.get('[role="dialog"]').trigger('click');
    expect(wrapper.emitted('closeRequested')).toBeUndefined();
    await wrapper.get('[data-testid="wt-merge-strategy-normal"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('closeRequested')).toHaveLength(1);
    await wrapper.get('[aria-label="Close dialog"]').trigger('click');
    expect(wrapper.emitted('closeRequested')).toHaveLength(2);
  });

  it('背板不包着面板（按钮的子孙不许可聚焦）', () => {
    const wrapper = mountMergeDialog();

    const backdrop = wrapper.get('[aria-label="Close dialog"]').element;
    expect(backdrop.contains(wrapper.get('[role="dialog"]').element)).toBe(false);
  });

  it('焦点陷阱：Tab 从最后一个控件回到第一个，Shift+Tab 从第一个或面板本身去最后一个', async () => {
    const wrapper = mountMergeDialog();
    const first = wrapper.get('[data-testid="wt-merge-strategy-squash"]');
    const last = wrapper.get('[data-testid="wt-merge-confirm"]');

    await pressTab(last);
    expect(document.activeElement).toBe(first.element);
    await pressTab(first, true);
    expect(document.activeElement).toBe(last.element);
    await pressTab(wrapper.get('[role="dialog"]'), true);
    expect(document.activeElement).toBe(last.element);
  });

  it('关闭后焦点还给打开前持有它的元素', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const wrapper = mountMergeDialog();
    expect(document.activeElement).toBe(wrapper.get('[role="dialog"]').element);

    await wrapper.setProps({ dialog: null });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('CompareDialog', () => {
  const comparison = (entries: BranchComparison['entries']): BranchComparison => ({
    fromBranchId: 'main',
    toBranchId: 'feature',
    entries
  });

  it('列出差异，字段读作「当前分支的值 → 那条分支的值」', () => {
    const wrapper = mountCompareDialog({
      phase: 'success',
      value: comparison([
        {
          namespace: 'public',
          entity: 'Todo',
          entityId: 't1',
          operation: 'UPDATE',
          patch: { title: 'b' },
          inversePatch: { title: 'a' }
        }
      ])
    });

    expect(accessibleName(wrapper)).toBe('Compare branches');
    expect(wrapper.get('[data-testid="wt-compare-summary"]').text()).toBe('1 entity differs between main and feature.');
    expect(wrapper.get('[data-testid="wt-branch-diff-item"]').text()).toContain('"a"');
    expect(wrapper.get('[data-testid="wt-branch-diff-item"]').text()).toContain('"b"');
  });

  it('两侧一样：只有摘要，没有列表；Close 与 Escape 都请求关闭', async () => {
    const wrapper = mountCompareDialog({ phase: 'success', value: comparison([]) });

    expect(wrapper.get('[data-testid="wt-compare-summary"]').text()).toBe('No differences between main and feature.');
    expect(wrapper.find('[data-testid="wt-branch-diff-list"]').exists()).toBe(false);
    await wrapper.get('[data-testid="wt-compare-close"]').trigger('click');
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('closeRequested')).toHaveLength(2);
  });

  it('读失败显示错误', () => {
    const wrapper = mountCompareDialog({ phase: 'error', message: "Branch 'feature' not found" });

    expect(wrapper.get('[data-testid="wt-compare-error"]').text()).toContain("Branch 'feature' not found");
  });
});
