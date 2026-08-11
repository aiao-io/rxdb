import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBranchManager } from './AppBranchManager';

const mocks = vi.hoisted(() => ({
  switchBranch: vi.fn(),
  createBranch: vi.fn(),
  useFindAll: vi.fn()
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

const branches = (active: 'main' | 'feature') => [
  { id: 'main', activated: active === 'main' },
  { id: 'feature', activated: active === 'feature' }
];

describe('AppBranchManager', () => {
  beforeEach(() => {
    mocks.switchBranch.mockReset();
    mocks.createBranch.mockReset();
    mocks.useFindAll.mockReturnValue({ value: branches('main') });
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

  it('卸载时取消待执行的 popover 聚焦', () => {
    vi.useFakeTimers();
    const { unmount } = render(<AppBranchManager />);

    fireEvent.click(screen.getByTitle('创建分支'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
