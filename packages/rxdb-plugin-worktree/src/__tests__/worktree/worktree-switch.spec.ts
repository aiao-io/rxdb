/**
 * @fileoverview US-310 AC#8 / #10：`switchWorktree(id, options?)`——读行，提交之后委托 `switchBranch()`。
 *
 * @remarks
 * 本故事对切换语义**一个字都不重写**：脏工作树要不要拒（`requireClean`）、激活代际过没过期
 * （`expectedActivationRevision`）、切当前分支是不是 no-op，全是 `VersionManager.switchBranch()` 与
 * 本插件 `prepareBranchSwitch` 的判定。这里只钉三件事：
 *
 * 1. 第二参**原样**透传（同一个对象），不拆、不补默认值——补一个 `requireClean: true` 就等于把
 *    git worktree「切走时未提交改动留在原处」的核心价值关掉了；
 * 2. 切换跑在读行事务**之外**（嵌套事务死锁）；
 * 3. `switchBranch()` 抛什么就原样抛什么，行不动。
 *
 * 真实的 `requireClean` / `expectedActivationRevision` 判定由 capture conformance 在真后端上走一遍。
 */

import { RxDBError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { WorktreeDirtyError } from '../../working-tree/switch-branch-options.js';
import { WorktreeCapabilityDisabledError } from '../../working-tree/working-tree-facade.js';
import { WorktreeNotFoundError } from '../../worktree/worktree-errors.js';
import { createWorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

describe('switchWorktree', () => {
  it('切到行所钉的分支，切换发生在读行事务之外', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    await scene.manager.switchWorktree('wt-x');

    expect(scene.switchCalls).toEqual([{ branchId: 'feature-x', options: undefined, transactionDepth: 0 }]);
    expect(scene.activeBranchId()).toBe('feature-x');
  });

  it('第二参原样透传给 switchBranch（同一个对象，不补默认值）', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });
    const options = { requireClean: true, expectedActivationRevision: 7 };

    await scene.manager.switchWorktree('wt-x', options);

    expect(scene.switchCalls[0]?.options).toBe(options);
  });

  it('switchBranch 拒绝（例如 requireClean 撞上脏工作树）：原错误原样上抛，行不动', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });
    const dirty = new WorktreeDirtyError(scene.branchId, 2);
    scene.switchBranch.mockRejectedValueOnce(dirty);

    await expect(scene.manager.switchWorktree('wt-x', { requireClean: true })).rejects.toBe(dirty);

    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-x']);
    expect(scene.activeBranchId()).toBe(scene.branchId);
  });

  it('切当前 worktree：照样交给 switchBranch，由它按同分支早退', async () => {
    const scene = createWorktreeContextsScene();
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });

    await scene.manager.switchWorktree('wt-main');

    expect(scene.switchCalls.map(call => call.branchId)).toEqual([scene.branchId]);
    expect(scene.activeBranchId()).toBe(scene.branchId);
  });

  it('行不存在：WorktreeNotFoundError，未切换', async () => {
    const scene = createWorktreeContextsScene();

    const error = await scene.manager.switchWorktree('wt-nope').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WorktreeNotFoundError);
    expect(error).toBeInstanceOf(RxDBError);
    expect({
      name: (error as WorktreeNotFoundError).name,
      code: (error as WorktreeNotFoundError).code,
      worktreeId: (error as WorktreeNotFoundError).worktreeId
    }).toEqual({ name: 'WorktreeNotFoundError', code: 'worktree_not_found', worktreeId: 'wt-nope' });
    expect(scene.switchCalls).toEqual([]);
  });

  it('未启用能力：门禁拒绝，未切换', async () => {
    const scene = createWorktreeContextsScene({ enabled: false });
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    await expect(scene.manager.switchWorktree('wt-x')).rejects.toBeInstanceOf(WorktreeCapabilityDisabledError);
    expect(scene.switchCalls).toEqual([]);
  });

  it('没装历史插件：明确报缺插件', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });
    Object.defineProperty(scene.database, 'versionManager', { value: undefined, configurable: true });

    await expect(scene.manager.switchWorktree('wt-x')).rejects.toThrow(/rxDBPluginHistory/);
  });
});
