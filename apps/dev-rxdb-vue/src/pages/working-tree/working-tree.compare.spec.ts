import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkingTreePage from '../WorkingTreePage.vue';

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
    isEnabledState: { value: { phase: 'success', value: true } },
    statusState: { value: { phase: 'success', value: status } },
    diffState: { value: { phase: 'success', value: { entries: [entry] } } },
    listCommitsState: { value: { phase: 'empty', value: { entries: [] } } },
    commitState: { value: { phase: 'idle' } },
    commitChangesState: { value: { phase: 'idle' } },
    isEnabled: vi.fn(async () => true),
    status: vi.fn(async () => status),
    diff: vi.fn(async () => ({ entries: [entry] })),
    listCommits: vi.fn(async () => ({ entries: [] })),
    discard: vi.fn(async () => undefined)
  };
  return { tree, comparison, compareBranches, database: { versionManager: { compareBranches } } };
});

vi.mock('@aiao/rxdb', () => ({ RxDBBranch: class {}, MAIN_BRANCH_ID: 'main' }));
vi.mock('@aiao/rxdb-plugin-working-tree', () => ({
  CommitValidationError: class extends Error {},
  WorkingTreeDirtyError: class extends Error {}
}));
vi.mock('@aiao/rxdb-plugin-working-tree-vue', () => ({ useWorkingTree: () => harness.tree }));
vi.mock('@aiao/rxdb-vue', () => ({
  useRxDB: () => harness.database,
  useFindAll: () => ({
    value: [
      { id: 'main', activated: true },
      { id: 'feature', activated: false }
    ]
  })
}));

let wrapper: VueWrapper | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  harness.tree.status.mockResolvedValue(harness.tree.statusState.value.value);
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
    let finishStatus: (status: typeof harness.tree.statusState.value.value) => void = () => undefined;
    harness.tree.status.mockReturnValueOnce(new Promise(resolve => (finishStatus = resolve)));
    await page().get('[data-testid="wt-refresh-status"]').trigger('click');
    await page().get('[data-testid="wt-compare-clear"]').trigger('click');
    finishStatus(harness.tree.statusState.value.value);
    await flushPromises();

    expect(page().find('[data-testid="wt-compare-view"]').exists()).toBe(false);
    expect(harness.compareBranches).toHaveBeenCalledTimes(1);
  });
});
