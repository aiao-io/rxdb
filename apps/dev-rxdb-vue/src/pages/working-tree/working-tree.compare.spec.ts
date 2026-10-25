import { WorktreeTableSet } from '@aiao/rxdb';
import type {
  WorkingTreeDiff,
  WorkingTreeDiffEntry,
  WorkingTreeQueryState,
  WorkingTreeStatus
} from '@aiao/rxdb-plugin-working-tree';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef, type ShallowRef } from 'vue';
import WorkingTreePage from '../WorkingTreePage.vue';

const harness = vi.hoisted(() => {
  const status: WorkingTreeStatus = {
    branchId: 'main',
    activationRevision: 1,
    headRevision: 1,
    workingTreeRevision: 1,
    clean: false,
    entryCount: 1,
    restoring: false,
    conflicted: false,
    byOrigin: { local: 1, remote_sync: 0 }
  };
  const entry: WorkingTreeDiffEntry = {
    unitId: 'unit-1',
    transactionId: null,
    origin: 'local',
    namespace: 'public',
    entity: 'Todo',
    entityId: 't1',
    operation: 'update',
    patch: { title: 'dirty' },
    inversePatch: { title: 'base' }
  };
  const diffWith = (entries: readonly WorkingTreeDiffEntry[]): WorkingTreeDiff => ({
    branchId: 'main',
    baseHeadCommitId: null,
    workingTreeRevision: 1,
    granularity: 'entity',
    entries,
    transactions: [],
    nextCursor: null
  });
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
    isEnabledState: { value: { phase: 'success', value: true } },
    statusState: undefined as unknown as ShallowRef<WorkingTreeQueryState<WorkingTreeStatus>>,
    diffState: undefined as unknown as ShallowRef<WorkingTreeQueryState<WorkingTreeDiff>>,
    listCommitsState: { value: { phase: 'empty', value: { entries: [] } } },
    commitState: { value: { phase: 'idle' } },
    commitChangesState: { value: { phase: 'idle' } },
    isEnabled: vi.fn(async () => true),
    status: vi.fn(async () => status),
    diff: vi.fn(async () => diffWith([entry])),
    listCommits: vi.fn(async () => ({ entries: [] })),
    discard: vi.fn(async () => undefined)
  };
  return {
    tree,
    status,
    entry,
    diffWith,
    comparison,
    compareBranches,
    mountWorktree: vi.fn(async () => undefined),
    database: { versionManager: { compareBranches } }
  };
});

vi.mock('@aiao/rxdb-plugin-working-tree', () => ({
  CommitValidationError: class extends Error {},
  WorkingTreeDirtyError: class extends Error {}
}));
vi.mock('@aiao/rxdb-plugin-working-tree-vue', () => ({
  useWorkingTree: () => harness.tree,
  useWorktrees: () => ({
    mounted: { value: WorktreeTableSet.MAIN },
    mount: harness.mountWorktree,
    listState: {
      value: {
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
      }
    }
  })
}));
vi.mock('@aiao/rxdb-vue', () => ({
  useRxDB: () => harness.database,
  useFindAll: () => ({
    value: [
      { id: 'main', activated: true, activeKey: '*active*' },
      { id: 'feature', activated: false, activeKey: null }
    ]
  })
}));

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  harness.tree.statusState = shallowRef({ phase: 'success', value: harness.status });
  harness.tree.diffState = shallowRef({ phase: 'success', value: harness.diffWith([harness.entry]) });
  harness.tree.status.mockResolvedValue(harness.status);
  harness.compareBranches.mockResolvedValue(harness.comparison('dirty'));
});

afterEach(() => wrapper?.unmount());

const page = (): VueWrapper => {
  if (wrapper === undefined) throw new Error('页面尚未挂载');
  return wrapper;
};

const openComparison = async (): Promise<void> => {
  wrapper = mount(WorkingTreePage, { global: { stubs: { RouterLink: true } } });
  await page().get('[data-testid="wt-tab-history"]').trigger('click');
  await page().get('[data-testid="wt-compare-select"]').setValue('feature');
  await flushPromises();
  expect(page().get('[data-testid="wt-branch-diff-item"]').text()).toContain('dirty');
};

const expectRefreshedComparison = (): void => {
  expect(page().get('[data-testid="wt-branch-diff-item"]').text()).toContain('base');
  expect(page().get('[data-testid="wt-branch-diff-item"]').text()).not.toContain('dirty');
  expect(page().get<HTMLSelectElement>('[data-testid="wt-compare-select"]').element.value).toBe('feature');
};

describe('WorkingTreePage 的分支对比刷新', () => {
  it('重读期间保留列表和用户手动选中的 diff，空结果落地后才清空', async () => {
    harness.tree.diffState.value = {
      phase: 'success',
      value: harness.diffWith([harness.entry, { ...harness.entry, unitId: 'unit-2', entityId: 't2' }])
    };
    wrapper = mount(WorkingTreePage, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    await page().findAll('[data-testid="wt-diff-item"]')[1].trigger('click');
    expect(page().get('[data-testid="wt-diff-item"][aria-current="true"]').text()).toContain('t2');

    harness.tree.statusState.value = { phase: 'loading' };
    harness.tree.diffState.value = { phase: 'loading' };
    await flushPromises();
    expect(page().findAll('[data-testid="wt-diff-item"]')).toHaveLength(2);
    expect(page().get('[data-testid="wt-diff-item"][aria-current="true"]').text()).toContain('t2');
    expect(page().get('[data-testid="wt-diff-viewer"]').text()).toContain('dirty');

    harness.tree.diffState.value = { phase: 'empty', value: harness.diffWith([]) };
    await flushPromises();
    expect(page().findAll('[data-testid="wt-diff-item"]')).toHaveLength(0);
  });

  it('换挂检出位清除旧分支对比并重读 Changes 和 History', async () => {
    await openComparison();
    await page().get('[data-testid="wt-worktree-menu"]').trigger('click');
    await page().get('[data-testid="wt-worktree-item"][data-worktree-id="linked"]').trigger('click');
    await flushPromises();
    expect(harness.mountWorktree).toHaveBeenCalledWith('linked');
    expect(page().find('[data-testid="wt-compare-view"]').exists()).toBe(false);
    expect(harness.tree.diff).toHaveBeenCalled();
    expect(harness.tree.listCommits).toHaveBeenCalled();
  });

  it('丢弃当前工作树后，History 保留对比分支并显示丢弃后的字段值', async () => {
    await openComparison();
    harness.compareBranches.mockResolvedValue(harness.comparison('base'));
    await page().get('[data-testid="wt-tab-changes"]').trigger('click');
    await page().get('[data-testid="wt-diff-item"]').trigger('contextmenu');
    await page().get('[data-testid="wt-discard"]').trigger('click');
    await page().get('[data-testid="wt-confirm-ok"]').trigger('click');
    await flushPromises();
    expect(harness.tree.discard).toHaveBeenCalledOnce();
    await page().get('[data-testid="wt-tab-history"]').trigger('click');
    expectRefreshedComparison();
  });

  it('Fetch 会重新读取当前分支对比', async () => {
    await openComparison();
    harness.compareBranches.mockResolvedValue(harness.comparison('base'));
    await page().get('[data-testid="wt-refresh-status"]').trigger('click');
    await flushPromises();
    expectRefreshedComparison();
  });

  it('Fetch 进行中清除对比，迟到的刷新不会重新打开它', async () => {
    await openComparison();
    let finishStatus: (status: WorkingTreeStatus) => void = () => undefined;
    harness.tree.status.mockReturnValueOnce(new Promise(resolve => (finishStatus = resolve)));
    await page().get('[data-testid="wt-refresh-status"]').trigger('click');
    await page().get('[data-testid="wt-compare-clear"]').trigger('click');
    finishStatus(harness.status);
    await flushPromises();

    expect(page().find('[data-testid="wt-compare-view"]').exists()).toBe(false);
    expect(harness.compareBranches).toHaveBeenCalledTimes(1);
  });
});
