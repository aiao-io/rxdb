/**
 * @fileoverview US-310 AC#9 / #10 / #11：`removeWorktree(id)`——只删这一行，别的一概不动。
 *
 * @remarks
 * 移除 worktree 不是删分支：分支、它的未提交改动、它的提交图都还在，删后这条分支回到「没钉住」，
 * 随时可以再钉。两道拒绝都照 `git worktree remove`：
 *
 * - **active 行**：那是当前 checkout，删了之后「我现在在哪个 worktree」就没有答案；
 * - **有未提交改动**：删行本身不丢数据，但这些改动从此只能经分支菜单找回——git 在这里拒绝，
 *   用户要的是「别让我把正在干的活随手扔进看不见的地方」。判据与切换守卫同一列
 *   （`WorkingTreeState.entryCount`），复用 `WorktreeDirtyError` 原类原码。
 *
 * metadata-only 的远端分支（`createWorktree()` 切换阶段失败留下的）没有工作树状态行，
 * 也就不可能有未提交改动：它必须能删，否则那一行永远清不掉。
 */

import { RxDBError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { removeBranchCommitRows } from '../../commit/branch-commit-rows.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { WorktreeDirtyError } from '../../working-tree/switch-branch-options.js';
import { WorktreeCapabilityDisabledError } from '../../working-tree/working-tree-facade.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { WorktreeActiveError, WorktreeNotFoundError } from '../../worktree/worktree-errors.js';
import { createWorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

describe('removeWorktree', () => {
  it('删掉非 active 的那一行；分支、工作树状态与 ref 原样都在', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    await scene.manager.removeWorktree('wt-x');

    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-main']);
    expect((scene.probe.rowsOf(WorkingTreeState) as WorkingTreeState[]).map(state => state.id)).toContain('feature-x');
    expect((scene.probe.rowsOf(CommitBranchRef) as CommitBranchRef[]).map(ref => ref.id)).toContain('feature-x');
    expect(scene.switchCalls).toEqual([]);
  });

  it('删后同一分支可以再钉', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    await scene.manager.removeWorktree('wt-x');
    const info = await scene.manager.createWorktree('feature-x', 'again');

    expect(scene.worktreeRows().map(row => [row.id, row.label])).toEqual([[info.id, 'again']]);
  });

  it('active 行：WorktreeActiveError，行还在', async () => {
    const scene = createWorktreeContextsScene();
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });

    const error = await scene.manager.removeWorktree('wt-main').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeActiveError);
    expect({
      name: (error as WorktreeActiveError).name,
      code: (error as WorktreeActiveError).code,
      worktreeId: (error as WorktreeActiveError).worktreeId,
      branchId: (error as WorktreeActiveError).branchId
    }).toEqual({
      name: 'WorktreeActiveError',
      code: 'worktree_active',
      worktreeId: 'wt-main',
      branchId: scene.branchId
    });
    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-main']);
  });

  it('所钉分支有未提交改动：WorktreeDirtyError（原类原码），行还在', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x', { entryCount: 3 });
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    const error = await scene.manager.removeWorktree('wt-x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeDirtyError);
    expect({
      code: (error as WorktreeDirtyError).code,
      branchId: (error as WorktreeDirtyError).branchId,
      entryCount: (error as WorktreeDirtyError).entryCount
    }).toEqual({ code: 'working_tree_dirty', branchId: 'feature-x', entryCount: 3 });
    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-x']);
  });

  it('脏拒的提示只指向那条分支本身：照着做不会动到当前分支', async () => {
    // commit() / discard() 只作用在当前分支上，而被拒的必然是另一条分支——提示若写「先 commit()」，
    // 照做的用户提交或丢弃的是当前分支的改动，移除仍然失败。
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x', { entryCount: 3 });
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    const error = await scene.manager.removeWorktree('wt-x').catch((caught: unknown) => caught);

    expect((error as WorktreeDirtyError).message).toBe(
      '分支 feature-x 上还有 3 条未提交改动：在该分支上 commit() 或 discard() 之后再试。'
    );
  });

  it('所钉的本地分支缺工作树状态行：响亮失败，不按 0 条改动删掉', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x', { missingState: true });
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    const error = await scene.manager.removeWorktree('wt-x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBError);
    expect((error as RxDBError).message).toContain('工作树状态行缺失');
    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-x']);
  });

  it('所钉的是 metadata-only 远端分支（没有工作树状态行）：可以删', async () => {
    const scene = createWorktreeContextsScene();
    scene.addMetadataOnlyBranch('origin-only');
    scene.addWorktree({ id: 'wt-remote', branchId: 'origin-only' });

    await scene.manager.removeWorktree('wt-remote');

    expect(scene.worktreeRows()).toEqual([]);
  });

  it('行不存在：WorktreeNotFoundError', async () => {
    const scene = createWorktreeContextsScene();

    await expect(scene.manager.removeWorktree('wt-nope')).rejects.toBeInstanceOf(WorktreeNotFoundError);
  });

  it('未启用能力：门禁拒绝，行还在', async () => {
    const scene = createWorktreeContextsScene({ enabled: false });
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    await expect(scene.manager.removeWorktree('wt-x')).rejects.toBeInstanceOf(WorktreeCapabilityDisabledError);
    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-x']);
  });
});

describe('删分支连带删掉钉在它上面的 worktree 行（AC#11）', () => {
  it('removeBranchRows 显式删本分支那一行，别的分支的行不动', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    // 不指望外键级联：它生不生效摊在六个后端各自的 `PRAGMA foreign_keys` 上。漏删的后果是
    // 同名重建的分支被一行旧 worktree 自动钉住（ABA）。
    await removeBranchCommitRows(scene.probe.executor, 'feature-x');

    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-main']);
  });
});
