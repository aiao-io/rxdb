import { WorktreeTableSet } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkingTreeWorktreeMenu } from './WorktreeMenu';

const linkedTables = WorktreeTableSet.of('wt_linked', []);
const linked = (id: string, name: string): Worktree =>
  ({
    id,
    mode: 'writable',
    branchId: id === 'wt-feature' ? 'feature' : 'topic',
    name,
    tableSetSuffix: linkedTables.suffix,
    kind: 'branch',
    owner: 'persistent',
    state: 'ready'
  }) as Worktree;

const renderMenu = (open = true) => {
  const handlers = {
    onCreateRequest: vi.fn(),
    onDeleteRequest: vi.fn(),
    onMenuOpenChange: vi.fn(),
    onMountRequest: vi.fn(),
    onRenameRequest: vi.fn()
  };
  render(
    <WorkingTreeWorktreeMenu
      activeBranch='main'
      menuOpen={open}
      mounted={linkedTables}
      popupWidth={320}
      worktrees={[linked('wt-feature', 'Feature work')]}
      {...handlers}
    />
  );
  return handlers;
};

afterEach(cleanup);

describe('WorkingTreeWorktreeMenu', () => {
  it('按 Main/Linked 分组，当前链接检出位带 aria-current', () => {
    renderMenu();

    expect(screen.getAllByText('Main worktree').length).toBeGreaterThan(0);
    expect(screen.getByText('Linked worktrees (1)')).toBeTruthy();
    const current = screen
      .getAllByTestId('wt-worktree-item')
      .find(element => element.getAttribute('data-worktree-id') === 'wt-feature');
    expect(current?.getAttribute('aria-current')).toBe('true');
  });

  it('键盘可达 New worktree、改名与删除，主检出位没有改名/删除入口', () => {
    const handlers = renderMenu();

    fireEvent.click(screen.getByTestId('wt-worktree-create'));
    fireEvent.click(screen.getByTestId('wt-worktree-rename-wt-feature'));
    fireEvent.click(screen.getByTestId('wt-worktree-delete-wt-feature'));
    expect(handlers.onCreateRequest).toHaveBeenCalledOnce();
    expect(handlers.onRenameRequest).toHaveBeenCalledOnce();
    expect(handlers.onDeleteRequest).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('wt-worktree-rename-main')).toBeNull();
    expect(screen.queryByTestId('wt-worktree-delete-main')).toBeNull();
  });

  it('选择主检出位或链接检出位分别转发 mount 请求', () => {
    const handlers = renderMenu();

    const main = screen
      .getAllByTestId('wt-worktree-item')
      .find(element => element.getAttribute('data-worktree-id') === 'main');
    if (main === undefined) throw new Error('main worktree row is missing');
    fireEvent.click(main);
    expect(handlers.onMountRequest).toHaveBeenCalledWith(null);
  });
});
