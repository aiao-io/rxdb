import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeSwitchBranchDialog } from './SwitchBranchDialog';

/**
 * @fileoverview 带着未提交改动切分支时的确认对话框（GitHub Desktop 的「Switch branch」，Angular / Vue 端同名 spec 的移植）。
 */

/** 搭一个开着的对话框；组件交出来的事件记在返回的 mock 上。 */
const renderDialog = (switching = false) => {
  const handlers = { onCloseRequested: vi.fn(), onConfirmRequested: vi.fn() };
  render(
    <WorkingTreeSwitchBranchDialog
      activeBranch='feature/x'
      dialog={{ targetBranchId: 'main' }}
      switching={switching}
      {...handlers}
    />
  );
  return handlers;
};

describe('WorkingTreeSwitchBranchDialog', () => {
  it('关着时什么都不画', () => {
    render(
      <WorkingTreeSwitchBranchDialog
        activeBranch='feature/x'
        dialog={null}
        onCloseRequested={vi.fn()}
        onConfirmRequested={vi.fn()}
        switching={false}
      />
    );

    expect(screen.queryByTestId('wt-switch-dialog')).toBeNull();
  });

  it('问改动怎么办：只有「留在当前分支」一个选项，已选中；对话框以标题命名', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Switch branch' });
    expect(dialog.querySelector('legend')?.textContent).toBe(
      'You have changes on this branch. What would you like to do with them?'
    );
    expect(screen.getByTestId<HTMLInputElement>('wt-switch-leave').checked).toBe(true);
    expect(screen.getByTestId('wt-switch-leave-option').textContent).toBe(
      'Leave my changes on feature/x Your in-progress work will stay on this branch for you to return to later'
    );
  });

  it('确认交出请求；Cancel 与 Escape 都请求关闭', () => {
    const { onCloseRequested, onConfirmRequested } = renderDialog();

    fireEvent.click(screen.getByTestId('wt-switch-confirm'));
    expect(onConfirmRequested).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('wt-switch-cancel'));
    fireEvent.keyDown(screen.getByTestId('wt-switch-dialog'), { key: 'Escape' });
    expect(onCloseRequested).toHaveBeenCalledTimes(2);
  });

  it('切换进行中：确认按钮置灰，连点不会切两次', () => {
    renderDialog(true);

    const confirm = screen.getByTestId<HTMLButtonElement>('wt-switch-confirm');
    expect([confirm.disabled, confirm.textContent]).toEqual([true, 'Switching…']);
  });
});
