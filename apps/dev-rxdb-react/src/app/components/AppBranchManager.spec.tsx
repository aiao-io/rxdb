import { WorktreeTableSet } from '@aiao/rxdb';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBranchManager } from './AppBranchManager';

const mocks = vi.hoisted(() => ({
  switchBranch: vi.fn(),
  createBranch: vi.fn(),
  useFindAll: vi.fn(),
  mounted: undefined as unknown
}));

vi.mock('@aiao/rxdb-react', () => ({
  useRxDB: () => ({
    versionManager: {
      switchBranch: mocks.switchBranch,
      createBranch: mocks.createBranch
    }
  }),
  useFindAll: mocks.useFindAll
}));

vi.mock('@aiao/rxdb-plugin-working-tree-react', () => ({
  useWorktrees: () => ({ mounted: mocks.mounted })
}));

const shadow = WorktreeTableSet.of('wt_x', []);

/** 主检出位停在 `active` 上：那一条持有主检出位的哨兵、`activated` 为真 */
const branches = (active: 'main' | 'feature') => [
  { id: 'main', activated: active === 'main', activeKey: active === 'main' ? WorktreeTableSet.MAIN.holderKey : null },
  {
    id: 'feature',
    activated: active === 'feature',
    activeKey: active === 'feature' ? WorktreeTableSet.MAIN.holderKey : null
  }
];

describe('AppBranchManager', () => {
  beforeEach(() => {
    mocks.switchBranch.mockReset();
    mocks.createBranch.mockReset();
    mocks.useFindAll.mockReturnValue({ value: branches('main') });
    mocks.mounted = WorktreeTableSet.MAIN;
  });

  afterEach(() => vi.useRealTimers());

  it('follows external active branch updates', () => {
    const { rerender } = render(<AppBranchManager />);
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '当前分支' });
    expect(select.value).toBe('main');

    mocks.useFindAll.mockReturnValue({ value: branches('feature') });
    rerender(<AppBranchManager />);

    expect(select.value).toBe('feature');
  });

  it('switches branches and waits for the active branch source', async () => {
    mocks.switchBranch.mockResolvedValue(undefined);
    const { rerender } = render(<AppBranchManager />);
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '当前分支' });

    fireEvent.change(select, { target: { value: 'feature' } });

    await waitFor(() => expect(mocks.switchBranch).toHaveBeenCalledWith('feature'));
    expect(select.value).toBe('main');
    mocks.useFindAll.mockReturnValue({ value: branches('feature') });
    rerender(<AppBranchManager />);
    expect(select.value).toBe('feature');
  });

  it('rolls back the selection and exposes switch failures', async () => {
    mocks.switchBranch.mockRejectedValue(new Error('switch failed'));
    render(<AppBranchManager />);
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '当前分支' });

    fireEvent.change(select, { target: { value: 'feature' } });

    expect((await screen.findByRole('alert')).textContent).toContain('switch failed');
    expect(select.value).toBe('main');
  });

  // US-314 C2.1：挂在可写检出位上时，当前分支是那套表持有的那一条，不是 `activated` 为真的那一条
  it('挂在检出位上选中的是那套表持有的分支；挂回主检出位选中主检出位停着的那条', () => {
    mocks.useFindAll.mockReturnValue({
      value: [
        { id: 'main', activated: true, activeKey: WorktreeTableSet.MAIN.holderKey },
        { id: 'feature', activated: false, activeKey: shadow.holderKey }
      ]
    });
    mocks.mounted = shadow;
    const { rerender } = render(<AppBranchManager />);
    const select = screen.getByTestId<HTMLSelectElement>('app-branch-select');

    expect(select.getAttribute('aria-label')).toBe('当前分支');
    expect(select.value).toBe('feature');

    mocks.mounted = WorktreeTableSet.MAIN;
    rerender(<AppBranchManager />);

    expect(select.value).toBe('main');
  });

  it('卸载时取消待执行的 popover 聚焦', () => {
    vi.useFakeTimers();
    const { unmount } = render(<AppBranchManager />);

    fireEvent.click(screen.getByTitle('创建分支'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
