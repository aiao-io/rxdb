import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeCreateBranchDialog, type CreateBranchDialogState } from './CreateBranchDialog';

/**
 * @fileoverview 「Create a branch」对话框（GitHub Desktop 的 `create-branch-dialog.tsx`）：History 右键从提交建，
 * 分支下拉的 New branch 从当前分支 HEAD 建，两处共用（Angular / Vue 端同名 spec 的移植）。
 */

const FROM_COMMIT: CreateBranchDialogState = {
  base: { commitId: '0123456789abcdef', summary: 'Add todos' },
  from: 'commit',
  availability: 'ok'
};

type CreateBranchDialogProps = Parameters<typeof WorkingTreeCreateBranchDialog>[0];

/**
 * 搭一个开着的对话框；组件交出来的事件记在返回的 mock 上。
 * `rerender` 换一份 props 重渲染（没给的仍取这里的默认值）。
 */
const renderDialog = (props: Partial<CreateBranchDialogProps> = {}) => {
  const handlers = { onCloseRequested: vi.fn(), onConfirmRequested: vi.fn(), onNameChange: vi.fn() };
  const view = (next: Partial<CreateBranchDialogProps>) => (
    <WorkingTreeCreateBranchDialog
      activeBranch='main'
      creating={false}
      dialog={FROM_COMMIT}
      error={null}
      name=''
      {...handlers}
      {...next}
    />
  );
  const { rerender } = render(view(props));
  return { ...handlers, rerender: (next: Partial<CreateBranchDialogProps>) => rerender(view(next)) };
};

const confirmButton = (): HTMLButtonElement => screen.getByTestId<HTMLButtonElement>('wt-create-branch-confirm');

describe('WorkingTreeCreateBranchDialog', () => {
  it('关着时什么都不画', () => {
    renderDialog({ dialog: null });

    expect(screen.queryByTestId('wt-create-branch-dialog')).toBeNull();
  });

  it('基于提交：以标题命名，名字框有可读名，写明基于哪个提交', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Create a branch' })).toBe(screen.getByTestId('wt-create-branch-dialog'));
    expect(screen.getByRole('textbox', { name: 'Name' })).toBe(screen.getByTestId('wt-create-branch-name'));
    expect(screen.getByTestId('wt-create-branch-base').textContent).toBe(
      "Your new branch will be based on the commit 'Add todos' (0123456) from your repository."
    );
  });

  it('基于当前分支：写明是当前分支；在默认分支上补一句它是默认分支', () => {
    const fromBranch: CreateBranchDialogState = { ...FROM_COMMIT, from: 'branch' };
    const { rerender } = renderDialog({ dialog: fromBranch, activeBranch: 'main' });
    expect(screen.getByTestId('wt-create-branch-base').textContent).toBe(
      'Your new branch will be based on your currently checked out branch (main). main is the default branch for your repository.'
    );

    rerender({ dialog: fromBranch, activeBranch: 'feature/x' });
    expect(screen.getByTestId('wt-create-branch-base').textContent).toBe(
      'Your new branch will be based on your currently checked out branch (feature/x).'
    );
  });

  it('名字为空或全是空白：Create 置灰；有名字时点 Create 交出去掉首尾空白的名字', () => {
    const { onConfirmRequested, rerender } = renderDialog({ name: '   ' });
    expect(confirmButton().disabled).toBe(true);

    rerender({ name: '  feature/y ' });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(onConfirmRequested.mock.calls).toEqual([['feature/y']]);
  });

  it('名字框里回车提交；输入法组字中的回车不提交', () => {
    const { onConfirmRequested } = renderDialog({ name: 'feature/y' });
    const input = screen.getByTestId('wt-create-branch-name');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onConfirmRequested).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirmRequested.mock.calls).toEqual([['feature/y']]);
  });

  it('预检还没回来：写着在检查，Create 置灰', () => {
    renderDialog({ dialog: { ...FROM_COMMIT, availability: 'checking' }, name: 'y' });

    expect(screen.getByTestId('wt-create-branch-checking').textContent).toBe('Checking this commit…');
    expect(confirmButton().disabled).toBe(true);
  });

  it('预检被拒：以 alert 写明原因，Create 置灰', () => {
    renderDialog({ dialog: { ...FROM_COMMIT, availability: 'history_rewritten' }, name: 'y' });

    const reason = screen.getByTestId('wt-create-branch-unavailable');
    expect(reason.getAttribute('role')).toBe('alert');
    expect(reason.textContent).toBe(
      'Changes in this commit were undone or redone after it was made, so a branch based on it would not match it.'
    );
    expect(confirmButton().disabled).toBe(true);
  });

  it('建分支报错：以 alert 写出来；进行中按钮置灰、写着 Creating…', () => {
    const { rerender } = renderDialog({ name: 'main', error: 'Branch id (main) already exists' });
    const error = screen.getByTestId('wt-create-branch-error');
    expect([error.getAttribute('role'), error.textContent]).toEqual(['alert', 'Branch id (main) already exists']);

    rerender({ name: 'y', creating: true });
    expect([confirmButton().disabled, confirmButton().textContent]).toEqual([true, 'Creating…']);
  });

  it('名字框里组字中的 Escape 是输入法在取消候选词，不关对话框', () => {
    const { onCloseRequested } = renderDialog({ name: 'feature/y' });
    const input = screen.getByTestId('wt-create-branch-name');

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(onCloseRequested).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCloseRequested).toHaveBeenCalledOnce();
  });

  it('Cancel 与 Escape 都请求关闭', () => {
    const { onCloseRequested } = renderDialog();

    fireEvent.click(screen.getByTestId('wt-create-branch-cancel'));
    fireEvent.keyDown(screen.getByTestId('wt-create-branch-dialog'), { key: 'Escape' });
    expect(onCloseRequested).toHaveBeenCalledTimes(2);
  });
});
