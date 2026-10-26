/**
 * @fileoverview 从提交建分支的判定（US-314 阶段 A）：能不能建、建不了是哪一种成因，以及本地查重。
 *
 * @remarks
 * 可达性、损坏、分叉点的读取与核对换成替身，只验本模块的编排与成因的先后；分叉点本身的口径见
 * `commit/commit-fork-point.spec.ts`，真后端上的整条路径由 `worktreeConformanceSuite` 验。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitForkPoint } from '../../commit/commit-fork-point.entity.js';
import { isForkPointLineageRewritten, readCommitForkPoint } from '../../commit/commit-fork-point.js';
import { assertCommitGraphIntact } from '../../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../../commit/list-commits.js';
import { assertBranchIdFreeLocally, planBranchFromCommit } from '../../working-tree/branch-from-commit.js';
import { readActiveBranchToken } from '../../working-tree/capture-runtime.js';
import { selectRestoreReplayPath } from '../../working-tree/restore-precheck.js';

vi.mock('../../working-tree/capture-runtime.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/capture-runtime.js')>()),
  readActiveBranchToken: vi.fn()
}));
vi.mock('../../commit/commit-graph-guard.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../commit/commit-graph-guard.js')>()),
  assertCommitGraphIntact: vi.fn()
}));
vi.mock('../../commit/list-commits.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../commit/list-commits.js')>()),
  readCommitBranchRef: vi.fn()
}));
vi.mock('../../working-tree/restore-precheck.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/restore-precheck.js')>()),
  selectRestoreReplayPath: vi.fn()
}));
vi.mock('../../commit/commit-fork-point.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../commit/commit-fork-point.js')>()),
  readCommitForkPoint: vi.fn(),
  isForkPointLineageRewritten: vi.fn()
}));

const FORK_POINT = {
  id: 'c1',
  branchId: 'main',
  changeId: 7,
  revertedCount: 0,
  maxRevertChangeId: null
} as unknown as CommitForkPoint;

/** 判定只经替身读库；本地查重那条用自己的执行器。 */
const executor = {} as TransactionExecutor;

beforeEach(() => {
  vi.mocked(readActiveBranchToken).mockResolvedValue({ branchId: 'main', activationRevision: 1 });
  vi.mocked(assertCommitGraphIntact).mockResolvedValue(undefined);
  vi.mocked(readCommitBranchRef).mockResolvedValue({ headCommitId: 'c3' } as never);
  vi.mocked(selectRestoreReplayPath).mockResolvedValue(['c3', 'c2']);
  vi.mocked(readCommitForkPoint).mockResolvedValue(FORK_POINT);
  vi.mocked(isForkPointLineageRewritten).mockResolvedValue(false);
});

afterEach(() => vi.clearAllMocks());

describe('planBranchFromCommit', () => {
  it('可达、有分叉点、谱系没被改过：交回分叉点', async () => {
    await expect(planBranchFromCommit(executor, 'c1')).resolves.toEqual({ ok: true, forkPoint: FORK_POINT });
    expect(vi.mocked(selectRestoreReplayPath)).toHaveBeenCalledWith(executor, 'c3', 'c1');
  });

  it('不在 HEAD 可达父链上：unreachable_target，不读分叉点', async () => {
    vi.mocked(selectRestoreReplayPath).mockResolvedValue(undefined);

    await expect(planBranchFromCommit(executor, 'c1')).resolves.toEqual({ ok: false, reason: 'unreachable_target' });
    expect(vi.mocked(readCommitForkPoint)).not.toHaveBeenCalled();
  });

  it('提交没有分叉点记录：fork_point_unknown', async () => {
    vi.mocked(readCommitForkPoint).mockResolvedValue(undefined);

    await expect(planBranchFromCommit(executor, 'c1')).resolves.toEqual({ ok: false, reason: 'fork_point_unknown' });
    expect(vi.mocked(isForkPointLineageRewritten)).not.toHaveBeenCalled();
  });

  it('提交之后的撤销 / 重做改过那段谱系：history_rewritten', async () => {
    vi.mocked(isForkPointLineageRewritten).mockResolvedValue(true);

    await expect(planBranchFromCommit(executor, 'c1')).resolves.toEqual({ ok: false, reason: 'history_rewritten' });
  });

  it('当前分支的提交图已损坏：照原样抛，不判可达', async () => {
    const corrupted = new RxDBError('graph corrupted');
    vi.mocked(assertCommitGraphIntact).mockRejectedValue(corrupted);

    await expect(planBranchFromCommit(executor, 'c1')).rejects.toBe(corrupted);
    expect(vi.mocked(selectRestoreReplayPath)).not.toHaveBeenCalled();
  });
});

describe('assertBranchIdFreeLocally', () => {
  const executorWith = (existing: readonly { id: string }[]) =>
    ({ getRepository: () => ({ find: vi.fn(async () => existing) }) }) as unknown as TransactionExecutor;

  it('本地已有同名分支：抛错，文案与 createBranch 相同', async () => {
    await expect(assertBranchIdFreeLocally(executorWith([{ id: 'main' }]), 'main')).rejects.toThrow(
      'Branch id (main) already exists'
    );
  });

  it('没有同名分支：放行', async () => {
    await expect(assertBranchIdFreeLocally(executorWith([]), 'feature')).resolves.toBeUndefined();
  });
});
