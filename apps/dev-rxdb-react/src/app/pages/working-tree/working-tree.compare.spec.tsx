import { WorktreeTableSet } from '@aiao/rxdb';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkingTreePage from './index';

const harness = vi.hoisted(() => {
  const status = {
    branchId: 'main',
    activationRevision: 1,
    headRevision: 1,
    workingTreeRevision: 1,
    clean: false,
    entryCount: 1,
    restoring: false,
    conflicted: false,
    byOrigin: { remote_sync: 0 }
  };
  const entry = {
    namespace: 'public',
    entity: 'Todo',
    entityId: 't1',
    operation: 'update',
    patch: { title: 'dirty' },
    inversePatch: { title: 'base' }
  };
  const comparison = (title: string) => ({
    fromBranchId: 'main',
    toBranchId: 'feature',
    entries: [
      {
        namespace: 'public',
        entity: 'Todo',
        entityId: 't1',
        operation: 'UPDATE',
        patch: { title: 'feature' },
        inversePatch: { title }
      }
    ]
  });
  const compareBranches = vi.fn<() => Promise<ReturnType<typeof comparison>>>();
  const tree = {
    isEnabledState: { phase: 'success', value: true },
    statusState: { phase: 'success', value: status },
    diffState: { phase: 'success', value: { entries: [entry] } },
    listCommitsState: { phase: 'empty', value: { entries: [] } },
    commitState: { phase: 'idle' },
    commitChangesState: { phase: 'idle' },
    isEnabled: vi.fn(async () => true),
    status: vi.fn(async () => status),
    diff: vi.fn(async () => ({ entries: [entry] })),
    listCommits: vi.fn(async () => ({ entries: [] })),
    commitChanges: vi.fn(),
    discard: vi.fn(async () => undefined)
  };
  const database = { versionManager: { compareBranches } };
  return { tree, database, comparison, compareBranches, mountWorktree: vi.fn(async () => undefined) };
});

vi.mock('@aiao/rxdb-plugin-working-tree', () => ({
  CommitValidationError: class extends Error {},
  WorkingTreeDirtyError: class extends Error {}
}));
vi.mock('@aiao/rxdb-plugin-working-tree-react', () => ({
  useWorkingTree: () => harness.tree,
  useWorktrees: () => ({
    list: vi.fn().mockResolvedValue([]),
    mount: harness.mountWorktree,
    listState: {
      phase: 'success',
      value: [
        {
          id: 'linked',
          name: 'Linked',
          branchId: 'feature',
          mode: 'writable',
          state: 'ready',
          tableSetSuffix: 'wt_linked'
        }
      ]
    },
    mounted: WorktreeTableSet.MAIN
  })
}));
vi.mock('@aiao/rxdb-react', () => ({
  useRxDB: () => harness.database,
  useFindAll: () => ({
    value: [
      { id: 'main', activated: true, activeKey: '*active*' },
      { id: 'feature', activated: false, activeKey: null }
    ]
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
  harness.tree.status.mockResolvedValue(harness.tree.statusState.value);
  harness.compareBranches.mockResolvedValue(harness.comparison('dirty'));
});

afterEach(cleanup);

const openComparison = async (): Promise<void> => {
  render(
    <MemoryRouter>
      <WorkingTreePage />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTestId('wt-tab-history'));
  fireEvent.change(screen.getByTestId('wt-compare-select'), { target: { value: 'feature' } });
  await waitFor(() => expect(screen.getByTestId('wt-branch-diff-item').textContent).toContain('dirty'));
};

const expectRefreshedComparison = async (): Promise<void> => {
  await waitFor(() => expect(screen.getByTestId('wt-branch-diff-item').textContent).toContain('base'));
  expect(screen.getByTestId('wt-branch-diff-item').textContent).not.toContain('dirty');
  expect(screen.getByTestId<HTMLSelectElement>('wt-compare-select').value).toBe('feature');
};

describe('WorkingTreePage 的分支对比刷新', () => {
  it('换挂检出位清除旧分支对比并重读 Changes 和 History', async () => {
    await openComparison();
    fireEvent.click(screen.getByTestId('wt-worktree-menu'));
    const linked = screen.getAllByTestId('wt-worktree-item').find(row => row.dataset.worktreeId === 'linked');
    if (linked === undefined) throw new Error('missing worktree');
    await act(async () => fireEvent.click(linked));
    expect(harness.mountWorktree).toHaveBeenCalledWith('linked');
    expect(screen.queryByTestId('wt-compare-view')).toBeNull();
    expect(harness.tree.diff).toHaveBeenCalled();
    expect(harness.tree.listCommits).toHaveBeenCalled();
  });

  it('丢弃当前工作树后，History 保留对比分支并显示丢弃后的字段值', async () => {
    await openComparison();
    harness.compareBranches.mockResolvedValue(harness.comparison('base'));

    fireEvent.click(screen.getByTestId('wt-tab-changes'));
    fireEvent.contextMenu(screen.getByTestId('wt-diff-item'));
    fireEvent.click(screen.getByTestId('wt-discard'));
    await act(async () => fireEvent.click(screen.getByTestId('wt-confirm-ok')));
    expect(harness.tree.discard).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('wt-tab-history'));
    await expectRefreshedComparison();
  });

  it('Fetch 会重新读取当前分支对比', async () => {
    await openComparison();
    harness.compareBranches.mockResolvedValue(harness.comparison('base'));
    await act(async () => fireEvent.click(screen.getByTestId('wt-refresh-status')));
    await expectRefreshedComparison();
  });

  it('Fetch 进行中清除对比，迟到的刷新不会重新打开它', async () => {
    await openComparison();
    let finishStatus: (status: typeof harness.tree.statusState.value) => void = () => undefined;
    harness.tree.status.mockReturnValueOnce(new Promise(resolve => (finishStatus = resolve)));
    fireEvent.click(screen.getByTestId('wt-refresh-status'));
    fireEvent.click(screen.getByTestId('wt-compare-clear'));
    await act(async () => finishStatus(harness.tree.statusState.value));

    expect(screen.queryByTestId('wt-compare-view')).toBeNull();
    expect(harness.compareBranches).toHaveBeenCalledTimes(1);
  });
});
