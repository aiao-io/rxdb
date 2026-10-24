import type { MergePreview } from '@aiao/rxdb-plugin-history';
import { fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeDialogShell } from './DialogShell';
import { WorkingTreeMergeDialog, type MergeDialogState } from './MergeDialog';

/**
 * @fileoverview 合并对话框的展示契约：选来源分支与合并预览（Angular / Vue 端同名 spec 的移植）。
 *
 * @remarks
 * 预览只是参考：读失败只显示错误，合并照常能点。对话框外壳与别的对话框共用：背板与面板是兄弟节点，
 * 打开时焦点进面板，面板里按 Escape 关闭，Tab 在面板里首尾回绕，关闭后焦点还给打开前持有它的元素。
 * 外壳只认面板 DOM 里发出的按键是 React 端独有的一条（portal 里的按键沿组件树冒泡上来）。
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

type MergeDialogProps = Parameters<typeof WorkingTreeMergeDialog>[0];

/** 搭一个开着的合并对话框；`rerender` 换一份 props 重渲染（没给的仍取这里的默认值）。 */
const renderMergeDialog = (props: Partial<MergeDialogProps> = {}) => {
  const handlers = {
    onCloseRequested: vi.fn(),
    onConfirm: vi.fn(),
    onDeleteSourceChange: vi.fn(),
    onSourceChange: vi.fn(),
    onStrategyChange: vi.fn()
  };
  const view = (next: Partial<MergeDialogProps>) => (
    <WorkingTreeMergeDialog
      activeBranch='main'
      branches={['feature', 'other']}
      dialog={dialog}
      error={null}
      preview={{ phase: 'success', value: preview }}
      {...handlers}
      {...next}
    />
  );
  const { rerender } = render(view(props));
  return { ...handlers, rerender: (next: Partial<MergeDialogProps>) => rerender(view(next)) };
};

/** 焦点放到 `element` 上按一下 Tab（`shiftKey` 为 Shift+Tab）。 */
const pressTab = (element: HTMLElement, shiftKey = false): void => {
  element.focus();
  fireEvent.keyDown(element, { key: 'Tab', shiftKey });
};

describe('WorkingTreeMergeDialog 的预览', () => {
  it('成功：摘要、条目与覆盖说明；对话框以标题命名，焦点进面板', () => {
    renderMergeDialog();

    const panel = screen.getByRole('dialog', { name: 'Merge into main' });
    expect(document.activeElement).toBe(panel);
    expect(screen.getByTestId('wt-merge-preview-summary').textContent).toBe(
      'Merges 1 change from feature into main. 1 entity overlaps with changes made on main.'
    );
    expect(screen.getAllByTestId('wt-branch-diff-item')).toHaveLength(1);
    expect(screen.getByTestId('wt-branch-diff-conflict').textContent).toBe("Overwrites main's changes to title");
  });

  it('读失败只显示错误，合并照常能点', () => {
    const { onConfirm } = renderMergeDialog({ preview: { phase: 'error', message: 'boom' } });

    expect(screen.getByTestId('wt-merge-preview-error').textContent).toContain('boom');
    expect(screen.queryByTestId('wt-branch-diff-list')).toBeNull();
    fireEvent.click(screen.getByTestId('wt-merge-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('读取中给出提示，不画列表', () => {
    renderMergeDialog({ preview: { phase: 'loading' } });

    expect(screen.getByTestId('wt-merge-preview-loading')).toBeTruthy();
    expect(screen.queryByTestId('wt-branch-diff-list')).toBeNull();
  });

  it('逐条合并的变更互相抵消：有计数、列表给空态', () => {
    renderMergeDialog({
      preview: { phase: 'success', value: { ...preview, strategy: 'normal', merged: 2, entries: [] } }
    });

    expect(screen.getByTestId('wt-merge-preview-summary').textContent).toBe('Merges 2 changes from feature into main.');
    expect(screen.getByTestId('wt-branch-diff-empty').textContent).toBe(
      'These changes cancel out; nothing on main changes.'
    );
  });

  it('面板里按 Escape、点背板都请求关闭；点面板本身不关', () => {
    const { onCloseRequested } = renderMergeDialog();

    fireEvent.click(screen.getByRole('dialog'));
    expect(onCloseRequested).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('wt-merge-strategy-normal'), { key: 'Escape' });
    expect(onCloseRequested).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onCloseRequested).toHaveBeenCalledTimes(2);
  });

  it('背板不包着面板（按钮的子孙不许可聚焦）', () => {
    renderMergeDialog();

    expect(screen.getByRole('button', { name: 'Close dialog' }).contains(screen.getByRole('dialog'))).toBe(false);
  });

  it('焦点陷阱：Tab 从最后一个控件回到第一个，Shift+Tab 从第一个或面板本身去最后一个', () => {
    renderMergeDialog();
    const first = screen.getByTestId('wt-merge-branch-filter');
    const last = screen.getByTestId('wt-merge-confirm');

    pressTab(last);
    expect(document.activeElement).toBe(first);
    pressTab(first, true);
    expect(document.activeElement).toBe(last);
    pressTab(screen.getByRole('dialog'), true);
    expect(document.activeElement).toBe(last);
  });

  it('关闭后焦点还给打开前持有它的元素', () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const { rerender } = renderMergeDialog();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    rerender({ dialog: null });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('WorkingTreeMergeDialog 的选分支', () => {
  /** 列表里各行的分支名，按显示顺序。 */
  const listedIds = (): (string | undefined)[] =>
    screen.queryAllByTestId('wt-merge-branch-item').map(item => item.dataset['branchId']);

  it('列出能合并进来的分支，选中的那条标 aria-current；点一条交出它', () => {
    const { onSourceChange } = renderMergeDialog();

    const items = screen.getAllByTestId('wt-merge-branch-item');
    expect(items.map(item => [item.dataset['branchId'], item.getAttribute('aria-current')])).toEqual([
      ['feature', 'true'],
      ['other', null]
    ]);
    fireEvent.click(items[1]);
    expect(onSourceChange.mock.calls).toEqual([['other']]);
  });

  it('还没选来源：提示先选一条，不画预览与选项，合并置灰', () => {
    renderMergeDialog({ dialog: { ...dialog, sourceBranchId: null }, preview: { phase: 'loading' } });

    expect(screen.getByTestId('wt-merge-choose-hint').textContent).toBe('Choose a branch to merge into main.');
    expect(screen.queryByTestId('wt-merge-preview')).toBeNull();
    expect(screen.queryByTestId('wt-merge-strategy-squash')).toBeNull();
    expect(screen.getByTestId<HTMLButtonElement>('wt-merge-confirm').disabled).toBe(true);
  });

  it('筛选：按名字子串、大小写不敏感；一条都不剩时说没有匹配', () => {
    renderMergeDialog();
    const filter = screen.getByTestId('wt-merge-branch-filter');

    fireEvent.change(filter, { target: { value: 'OTH' } });
    expect(listedIds()).toEqual(['other']);

    fireEvent.change(filter, { target: { value: 'nope' } });
    expect(listedIds()).toEqual([]);
    expect(screen.getByTestId('wt-merge-branch-list').textContent).toBe('No matching branches');
  });

  it('关掉再打开：筛选词不留，列表回到完整', () => {
    const { rerender } = renderMergeDialog();
    fireEvent.change(screen.getByTestId('wt-merge-branch-filter'), { target: { value: 'oth' } });

    rerender({ dialog: null });
    rerender({ dialog });

    expect(screen.getByTestId<HTMLInputElement>('wt-merge-branch-filter').value).toBe('');
    expect(screen.getAllByTestId('wt-merge-branch-item')).toHaveLength(2);
  });
});

describe('WorkingTreeDialogShell', () => {
  it('portal 里冒上来的按键不归外壳管：Tab 不被拉回面板，Escape 不关外壳', () => {
    const onCloseRequested = vi.fn();
    // 面板里没有可聚焦元素：外壳若接了这一下 Tab，会把焦点拉回面板本身
    render(
      <WorkingTreeDialogShell labelledBy='wt-shell-title' onCloseRequested={onCloseRequested} testId='wt-shell'>
        <h2 id='wt-shell-title'>Shell</h2>
        {createPortal(<button type='button'>In portal</button>, document.body)}
      </WorkingTreeDialogShell>
    );
    const inPortal = screen.getByRole('button', { name: 'In portal' });

    pressTab(inPortal);
    expect(document.activeElement).toBe(inPortal);
    fireEvent.keyDown(inPortal, { key: 'Escape' });
    expect(onCloseRequested).not.toHaveBeenCalled();
  });
});
