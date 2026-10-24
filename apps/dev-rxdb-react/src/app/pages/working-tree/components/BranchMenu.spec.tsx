import { WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeBranchMenu } from './BranchMenu';

/**
 * @fileoverview 分支下拉认当前分支（US-314 C2.1，Angular / Vue 端同名 spec 的移植）：挂在可写检出位上时，当前分支是那套表持有的分支，
 * 它的 `activated` 是假；主检出位停着的那条 `activated` 为真，却不是这里的当前分支。
 */

const shadow = WorktreeTableSet.of('wt_x', []);

const branch = (id: string, activeKey: string | null): RxDBBranch =>
  ({
    id,
    activeKey,
    activated: activeKey === WorktreeTableSet.MAIN.holderKey,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  }) as unknown as RxDBBranch;

/** 搭一个展开着的分支下拉：挂在检出位上，当前分支是 feature（`activated` 为假）。 */
const renderMenu = () => {
  const handlers = { onMenuOpenChange: vi.fn(), onSwitchBranch: vi.fn() };
  const { container } = render(
    <WorkingTreeBranchMenu
      activeBranch='feature'
      branches={[branch('main', WorktreeTableSet.MAIN.holderKey), branch('feature', shadow.holderKey)]}
      menuOpen
      popupWidth={320}
      onCreateRequest={vi.fn()}
      onMenuRequest={vi.fn()}
      onMergeRequest={vi.fn()}
      {...handlers}
    />
  );
  const rowOf = (id: string): HTMLElement => {
    const row = container.querySelector<HTMLElement>(`[data-testid="wt-branch-item"][data-branch-id="${id}"]`);
    if (row === null) throw new Error(`找不到分支行 ${id}`);
    return row;
  };
  return { handlers, rowOf };
};

describe('WorkingTreeBranchMenu：当前分支（US-314 C2.1）', () => {
  it('挂在检出位上：持有分支那一行带 aria-current，主检出位停着的那一行不带', () => {
    const { rowOf } = renderMenu();

    expect(rowOf('feature').getAttribute('aria-current')).toBe('true');
    expect(rowOf('main').getAttribute('aria-current')).toBeNull();
  });

  it('点当前分支那一行只收起，不切换；点主检出位停着的那一行照常切换', () => {
    const { handlers, rowOf } = renderMenu();

    fireEvent.click(rowOf('feature'));
    expect(handlers.onSwitchBranch).not.toHaveBeenCalled();
    expect(handlers.onMenuOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(rowOf('main'));
    expect(handlers.onSwitchBranch).toHaveBeenCalledWith('main');
  });
});
