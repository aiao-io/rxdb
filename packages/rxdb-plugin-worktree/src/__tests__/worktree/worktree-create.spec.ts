/**
 * @fileoverview US-310 AC#5 / #6 / #10：`createWorktree(branchId, label?)`——钉住并切换。
 *
 * @remarks
 * 唯一判据是「这条分支上已经有没有一行」，不是「这条分支是不是 active」：单 checkout 模型里没有
 * 第二个槽位，active 但没行的分支（从分支菜单直接切过去的）照样可以钉。
 *
 * **两阶段**：落行在 `runEnabled()` 的事务里，切换在事务**提交之后**——`switchBranch()` 自己开事务，
 * 嵌套进来会死锁。场景替身记下每次切换被调时还压着几层事务，用例断言它恒为 0。
 *
 * 切换失败时行保留、原错上抛：worktree 已经建好了，没切过去是另一件事，`switchWorktree()` 可以重试。
 * 不做补偿删除——补偿自己也可能失败，那时候盖掉的是用户真正需要看到的那个错误。
 */

import { RxDBError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { WorktreeCapabilityDisabledError } from '../../working-tree/working-tree-facade.js';
import {
  WorktreeBranchNotFoundError,
  WorktreeBranchPinnedError,
  WorktreeLabelError
} from '../../worktree/worktree-errors.js';
import { createWorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

describe('createWorktree：钉住并切换', () => {
  it('落一行、切过去，返回的视图 active 为真', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');

    const info = await scene.manager.createWorktree('feature-x', 'Feature X');

    const [row, ...rest] = scene.worktreeRows();
    expect(rest).toEqual([]);
    expect({ branchId: row?.branchId, label: row?.label }).toEqual({ branchId: 'feature-x', label: 'Feature X' });
    expect(info).toEqual(
      expect.objectContaining({ id: row?.id, branchId: 'feature-x', label: 'Feature X', active: true })
    );
    expect(scene.switchCalls.map(call => call.branchId)).toEqual(['feature-x']);
    expect(scene.activeBranchId()).toBe('feature-x');
  });

  it('切换发生在落行事务提交之后，且不带任何前置条件（创建即切换）', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');

    await scene.manager.createWorktree('feature-x');

    // 嵌套事务会死锁：switchBranch 自己开事务，而队列并发度是 1。
    expect(scene.switchCalls).toEqual([{ branchId: 'feature-x', options: undefined, transactionDepth: 0 }]);
  });

  it('不给 label 时落 null（UI 回退显示 branchId）', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');

    const info = await scene.manager.createWorktree('feature-x');

    expect(info.label).toBeNull();
    expect(scene.worktreeRows()[0]?.label).toBeNull();
  });

  it('当前 active 但还没钉住的分支可以钉（单 checkout 没有第二个槽位）', async () => {
    const scene = createWorktreeContextsScene();

    const info = await scene.manager.createWorktree(scene.branchId);

    expect({ branchId: info.branchId, active: info.active }).toEqual({ branchId: scene.branchId, active: true });
    expect(scene.worktreeRows()).toHaveLength(1);
  });

  it('同一分支已经钉过：WorktreeBranchPinnedError，不落行、不切换', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-existing', branchId: 'feature-x' });

    const error = await scene.manager.createWorktree('feature-x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeBranchPinnedError);
    expect(error).toBeInstanceOf(RxDBError);
    expect({
      name: (error as WorktreeBranchPinnedError).name,
      code: (error as WorktreeBranchPinnedError).code,
      branchId: (error as WorktreeBranchPinnedError).branchId,
      worktreeId: (error as WorktreeBranchPinnedError).worktreeId
    }).toEqual({
      name: 'WorktreeBranchPinnedError',
      code: 'worktree_branch_pinned',
      branchId: 'feature-x',
      worktreeId: 'wt-existing'
    });
    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-existing']);
    expect(scene.switchCalls).toEqual([]);
  });

  it('分支不存在：WorktreeBranchNotFoundError，不落行、不切换', async () => {
    const scene = createWorktreeContextsScene();

    const error = await scene.manager.createWorktree('nope').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeBranchNotFoundError);
    expect({
      code: (error as WorktreeBranchNotFoundError).code,
      branchId: (error as WorktreeBranchNotFoundError).branchId
    }).toEqual({ code: 'worktree_branch_not_found', branchId: 'nope' });
    expect(scene.worktreeRows()).toEqual([]);
    expect(scene.switchCalls).toEqual([]);
  });

  it.each(['', '   ', '\t\n'])('空白 label %j：WorktreeLabelError，不落行（没有回退成 null 的兜底）', async label => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');

    const error = await scene.manager.createWorktree('feature-x', label).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeLabelError);
    expect({
      code: (error as WorktreeLabelError).code,
      label: (error as WorktreeLabelError).label
    }).toEqual({ code: 'worktree_label_invalid', label });
    expect(scene.worktreeRows()).toEqual([]);
    expect(scene.switchCalls).toEqual([]);
  });

  it('label 原样落库，不替用户 trim', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');

    await scene.manager.createWorktree('feature-x', ' 修 bug ');

    expect(scene.worktreeRows()[0]?.label).toBe(' 修 bug ');
  });

  it('未启用能力：commit_capability_disabled，零写入、未切换', async () => {
    const scene = createWorktreeContextsScene({ enabled: false });
    scene.addBranch('feature-x');

    const error = await scene.manager.createWorktree('feature-x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeCapabilityDisabledError);
    expect((error as WorktreeCapabilityDisabledError).code).toBe(CommitErrorCode.commit_capability_disabled);
    expect(scene.worktreeRows()).toEqual([]);
    expect(scene.switchCalls).toEqual([]);
  });

  it('没装历史插件：明确报缺插件，且不落行（否则先落一行孤行）', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    Object.defineProperty(scene.database, 'versionManager', { value: undefined, configurable: true });

    const error = await scene.manager.createWorktree('feature-x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBError);
    expect((error as Error).message).toMatch(/rxDBPluginHistory/);
    expect(scene.worktreeRows()).toEqual([]);
  });

  it('切换阶段失败：原错误原样上抛，worktree 行保留（可用 switchWorktree 重试）', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    const failure = new RxDBError('目标分支提交图损坏');
    scene.switchBranch.mockRejectedValueOnce(failure);

    await expect(scene.manager.createWorktree('feature-x')).rejects.toBe(failure);

    expect(scene.worktreeRows().map(row => row.branchId)).toEqual(['feature-x']);
    expect(scene.activeBranchId()).toBe(scene.branchId);
  });
});
