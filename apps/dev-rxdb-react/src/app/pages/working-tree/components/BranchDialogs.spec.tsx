import type { BranchComparison, MergePreview } from '@aiao/rxdb-plugin-history';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeCompareDialog } from './CompareDialog';
import { WorkingTreeMergeDialog, type MergeDialogState } from './MergeDialog';

/**
 * @fileoverview 合并预览与对比对话框的展示契约（Angular / Vue 端同名 spec 的移植）。
 *
 * @remarks
 * 预览只是参考：读失败只显示错误，合并照常能点。两个对话框共用一个外壳：背板与面板是兄弟节点，
 * 打开时焦点进面板，面板里按 Escape 关闭。
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

const renderMergeDialog = (props: Partial<Parameters<typeof WorkingTreeMergeDialog>[0]> = {}) => {
  const handlers = { onCloseRequested: vi.fn(), onConfirm: vi.fn(), onStrategyChange: vi.fn() };
  render(
    <WorkingTreeMergeDialog
      activeBranch='main'
      dialog={dialog}
      error={null}
      onDeleteSourceChange={vi.fn()}
      preview={{ phase: 'success', value: preview }}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('WorkingTreeMergeDialog 的预览', () => {
  it('成功：摘要、条目与覆盖说明；对话框以标题命名，焦点进面板', () => {
    renderMergeDialog();

    const panel = screen.getByRole('dialog', { name: 'Merge branch' });
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
});

describe('WorkingTreeCompareDialog', () => {
  const comparison = (entries: BranchComparison['entries']): BranchComparison => ({
    fromBranchId: 'main',
    toBranchId: 'feature',
    entries
  });

  it('列出差异，字段读作「当前分支的值 → 那条分支的值」', () => {
    render(
      <WorkingTreeCompareDialog
        activeBranch='main'
        dialog={{
          branchId: 'feature',
          comparison: {
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
          }
        }}
        onCloseRequested={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Compare branches' })).toBeTruthy();
    expect(screen.getByTestId('wt-compare-summary').textContent).toBe('1 entity differs between main and feature.');
    expect(screen.getByTestId('wt-branch-diff-item').textContent).toContain('"a"');
    expect(screen.getByTestId('wt-branch-diff-item').textContent).toContain('"b"');
  });

  it('两侧一样：只有摘要，没有列表；Close 与 Escape 都请求关闭', () => {
    const onCloseRequested = vi.fn();
    render(
      <WorkingTreeCompareDialog
        activeBranch='main'
        dialog={{ branchId: 'feature', comparison: { phase: 'success', value: comparison([]) } }}
        onCloseRequested={onCloseRequested}
      />
    );

    expect(screen.getByTestId('wt-compare-summary').textContent).toBe('No differences between main and feature.');
    expect(screen.queryByTestId('wt-branch-diff-list')).toBeNull();
    fireEvent.click(screen.getByTestId('wt-compare-close'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCloseRequested).toHaveBeenCalledTimes(2);
  });

  it('读失败显示错误', () => {
    render(
      <WorkingTreeCompareDialog
        activeBranch='main'
        dialog={{ branchId: 'feature', comparison: { phase: 'error', message: "Branch 'feature' not found" } }}
        onCloseRequested={vi.fn()}
      />
    );

    expect(screen.getByTestId('wt-compare-error').textContent).toContain("Branch 'feature' not found");
  });
});
