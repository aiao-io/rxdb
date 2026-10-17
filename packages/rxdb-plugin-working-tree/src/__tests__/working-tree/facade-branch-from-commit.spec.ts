/**
 * @fileoverview 门面的从提交建分支（US-314 阶段 A）：两笔受管事务夹着远端查重的编排。
 *
 * @remarks
 * 判定、本地查重与写分支行换成替身，只验门面这一层的次序：门禁与参数校验在任何查询之前，被拒就不发远端查重、
 * 第二笔事务重判、通过才写、点名的提交原样交下去。判定本身见 `branch-from-commit.spec.ts`，
 * 真后端上的整条路径由 `worktreeConformanceSuite` 验，未启用时的门禁由 `facade-capability-gate.spec.ts` 枚举。
 */

import { InvalidBranchIdError, RxDBBranch, RxDBError } from '@aiao/rxdb';
import { assert_branch_id_free_on_remote, write_new_branch } from '@aiao/rxdb-plugin-history';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitForkPoint } from '../../commit/commit-fork-point.entity.js';
import { assertBranchIdFreeLocally, planBranchFromCommit } from '../../working-tree/branch-from-commit.js';
import { createWorkingTreeScene, type WorkingTreeScene } from './fixtures/working-tree-scene.js';

vi.mock('../../working-tree/branch-from-commit.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/branch-from-commit.js')>()),
  planBranchFromCommit: vi.fn(),
  assertBranchIdFreeLocally: vi.fn()
}));
vi.mock('@aiao/rxdb-plugin-history', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-history')>()),
  assert_branch_id_free_on_remote: vi.fn(),
  write_new_branch: vi.fn()
}));

const FORK_POINT = { id: 'c1', branchId: 'main', changeId: 7 } as unknown as CommitForkPoint;

let scene: WorkingTreeScene;
let created: RxDBBranch;
/** 本场景没装历史插件，远端查重读的 `versionManager` 用一个记得住身份的替身 */
const versionManager = { name: 'version-manager-stub' };

beforeEach(() => {
  scene = createWorkingTreeScene();
  Object.defineProperty(scene.database, 'versionManager', { configurable: true, value: versionManager });
  created = scene.database.entityManager.instantiate(RxDBBranch);
  created.id = 'from-commit';
  vi.mocked(planBranchFromCommit).mockResolvedValue({ ok: true, forkPoint: FORK_POINT });
  vi.mocked(assertBranchIdFreeLocally).mockResolvedValue(undefined);
  vi.mocked(assert_branch_id_free_on_remote).mockResolvedValue(undefined);
  vi.mocked(write_new_branch).mockResolvedValue(created);
});

afterEach(() => vi.clearAllMocks());

describe('checkBranchFromCommit', () => {
  it('能建：只交回 ok，不把分叉点露出去', async () => {
    await expect(scene.manager.checkBranchFromCommit('c1')).resolves.toEqual({ ok: true });
    expect(vi.mocked(write_new_branch)).not.toHaveBeenCalled();
  });

  it('被拒：原样交回成因', async () => {
    vi.mocked(planBranchFromCommit).mockResolvedValue({ ok: false, reason: 'history_rewritten' });

    await expect(scene.manager.checkBranchFromCommit('c1')).resolves.toEqual({
      ok: false,
      reason: 'history_rewritten'
    });
  });
});

describe('createBranchFromCommit', () => {
  it('两笔事务都判过、远端查过之后，在分叉点上写分支行，点名的提交原样交下去', async () => {
    await expect(scene.manager.createBranchFromCommit('from-commit', 'c1')).resolves.toEqual({
      ok: true,
      branch: created
    });

    expect(vi.mocked(planBranchFromCommit)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(assertBranchIdFreeLocally)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(assert_branch_id_free_on_remote)).toHaveBeenCalledWith(versionManager, 'from-commit');
    expect(vi.mocked(write_new_branch)).toHaveBeenCalledWith(scene.database, expect.anything(), {
      branchId: 'from-commit',
      parentId: 'main',
      fromChangeId: 7,
      fromCommitId: 'c1'
    });
  });

  it('第一笔就被拒：交回成因，不发远端查重，不写', async () => {
    vi.mocked(planBranchFromCommit).mockResolvedValue({ ok: false, reason: 'unreachable_target' });

    await expect(scene.manager.createBranchFromCommit('from-commit', 'c1')).resolves.toEqual({
      ok: false,
      reason: 'unreachable_target'
    });
    expect(vi.mocked(assert_branch_id_free_on_remote)).not.toHaveBeenCalled();
    expect(vi.mocked(write_new_branch)).not.toHaveBeenCalled();
  });

  it('远端查重之后库变了、第二笔重判被拒：交回新的成因，不写', async () => {
    vi.mocked(planBranchFromCommit)
      .mockResolvedValueOnce({ ok: true, forkPoint: FORK_POINT })
      .mockResolvedValueOnce({ ok: false, reason: 'history_rewritten' });

    await expect(scene.manager.createBranchFromCommit('from-commit', 'c1')).resolves.toEqual({
      ok: false,
      reason: 'history_rewritten'
    });
    expect(vi.mocked(write_new_branch)).not.toHaveBeenCalled();
  });

  it('分支 id 不可用：在任何查询之前抛', async () => {
    await expect(scene.manager.createBranchFromCommit('*active*', 'c1')).rejects.toBeInstanceOf(InvalidBranchIdError);
    expect(vi.mocked(planBranchFromCommit)).not.toHaveBeenCalled();
  });

  it('远端已有同名分支：抛远端查重的错，不写', async () => {
    const taken = new RxDBError('Branch id (from-commit) already exists on remote');
    vi.mocked(assert_branch_id_free_on_remote).mockRejectedValue(taken);

    await expect(scene.manager.createBranchFromCommit('from-commit', 'c1')).rejects.toBe(taken);
    expect(vi.mocked(write_new_branch)).not.toHaveBeenCalled();
  });
});
