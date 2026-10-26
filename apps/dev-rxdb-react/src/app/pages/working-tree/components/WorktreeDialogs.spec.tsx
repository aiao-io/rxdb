import type { RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeDeleteDialog, WorkingTreeNewDialog, WorkingTreeRenameDialog } from './WorktreeDialogs';

const branches = [
  { id: 'main', activeKey: '*active*' },
  { id: 'feature', activeKey: null }
] as unknown as RxDBBranch[];
const worktree = { id: 'wt-feature', name: 'Feature', branchId: 'feature' } as Worktree;

describe('Worktree dialogs', () => {
  it('New worktree 要求名字与分支，回车提交并说明会立即打开', () => {
    const onConfirm = vi.fn();
    render(
      <WorkingTreeNewDialog
        activeBranch='main'
        branches={branches}
        branchId='feature'
        creating={false}
        error={null}
        name='Feature work'
        onBranchChange={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onNameChange={vi.fn()}
        open
      />
    );

    expect(screen.getByText(/opened immediately/i)).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('wt-worktree-create-name'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Rename 回车交出请求，空白名字禁用确认', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <WorkingTreeRenameDialog
        error={null}
        name='  '
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onNameChange={vi.fn()}
        saving={false}
        worktree={worktree}
      />
    );
    expect(screen.getByTestId<HTMLButtonElement>('wt-worktree-rename-confirm').disabled).toBe(true);
    rerender(
      <WorkingTreeRenameDialog
        error={null}
        name='Renamed'
        onClose={vi.fn()}
        onConfirm={onConfirm}
        onNameChange={vi.fn()}
        saving={false}
        worktree={worktree}
      />
    );
    fireEvent.keyDown(screen.getByTestId('wt-worktree-rename-name'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('删除当前脏检出位先展示未提交改动警告', () => {
    const onConfirm = vi.fn();
    render(
      <WorkingTreeDeleteDialog
        deleting={false}
        dirty
        error={null}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        worktree={worktree}
      />
    );
    expect(screen.getByTestId('wt-worktree-delete-warning')).toBeTruthy();
    fireEvent.click(screen.getByTestId('wt-worktree-delete-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
