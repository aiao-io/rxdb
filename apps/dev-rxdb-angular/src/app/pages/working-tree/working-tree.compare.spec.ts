import { RxDB, WorktreeTableSet } from '@aiao/rxdb';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkingTreePage from './working-tree.page';

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
    isEnabledState: () => ({ phase: 'success', value: true }),
    statusState: () => ({ phase: 'success', value: status }),
    diffState: () => ({ phase: 'empty', value: { entries: [] } }),
    listCommitsState: () => ({ phase: 'empty', value: { entries: [] } }),
    isEnabled: vi.fn(async () => true),
    status: vi.fn(async () => status),
    diff: vi.fn(async () => ({ entries: [] })),
    listCommits: vi.fn(async () => ({ entries: [] })),
    discard: vi.fn(async () => undefined)
  };
  return { tree, comparison, compareBranches, database: { versionManager: { compareBranches } } };
});

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({
    value: () => [
      { id: 'main', activated: true, activeKey: '*active*' },
      { id: 'feature', activated: false, activeKey: null }
    ]
  })
}));
vi.mock('@aiao/rxdb-plugin-working-tree-angular', () => ({
  useWorkingTree: () => harness.tree,
  useWorktrees: () => ({ mounted: () => WorktreeTableSet.MAIN })
}));

beforeEach(async () => {
  vi.clearAllMocks();
  harness.tree.status.mockResolvedValue(harness.tree.statusState().value);
  harness.compareBranches.mockResolvedValue(harness.comparison('dirty'));
  await TestBed.configureTestingModule({
    imports: [WorkingTreePage],
    providers: [{ provide: RxDB, useValue: harness.database }]
  })
    .overrideComponent(WorkingTreePage, { set: { template: '', imports: [] } })
    .compileComponents();
});

afterEach(() => TestBed.resetTestingModule());

const openComparison = async (): Promise<WorkingTreePage> => {
  const fixture = TestBed.createComponent(WorkingTreePage);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.componentInstance;
  page.compareWith('feature');
  await Promise.resolve();
  expect(page.$historyCompare()?.comparison).toEqual({ phase: 'success', value: harness.comparison('dirty') });
  return page;
};

describe('WorkingTreePage 的分支对比刷新', () => {
  it('丢弃当前工作树后，保留对比分支并重读字段值', async () => {
    const page = await openComparison();
    harness.compareBranches.mockResolvedValue(harness.comparison('base'));
    page.requestDiscard();
    await page.confirmRequest();

    expect(harness.tree.discard).toHaveBeenCalledOnce();
    expect(page.$historyCompare()).toEqual({
      branchId: 'feature',
      comparison: { phase: 'success', value: harness.comparison('base') }
    });
  });

  it('Fetch 会重新读取当前分支对比', async () => {
    const page = await openComparison();
    harness.compareBranches.mockResolvedValue(harness.comparison('base'));
    await page.runFetch();

    expect(page.$historyCompare()).toEqual({
      branchId: 'feature',
      comparison: { phase: 'success', value: harness.comparison('base') }
    });
  });

  it('Fetch 进行中清除对比，迟到的刷新不会重新打开它', async () => {
    const page = await openComparison();
    let finishStatus: (status: Awaited<ReturnType<typeof harness.tree.status>>) => void = () => undefined;
    harness.tree.status.mockReturnValueOnce(new Promise(resolve => (finishStatus = resolve)));
    const refreshing = page.runFetch();
    page.clearCompare();
    finishStatus(harness.tree.statusState().value);
    await refreshing;

    expect(page.$historyCompare()).toBeNull();
    expect(harness.compareBranches).toHaveBeenCalledTimes(1);
  });
});
