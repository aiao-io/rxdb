/**
 * @fileoverview US-310 AC#7：`listWorktrees()`——全部行、active 标记与 `rxdb_branch.activated` 同口径。
 *
 * @remarks
 * `active` 不存在任何一张 worktree 自己的表里：「当前 checkout 是谁」的唯一真相是
 * `rxdb_branch.activated`（`activation-state.ts` 的「没有第二份 active branch ID」）。
 * 所以从分支菜单直接切走之后，列表里的勾选必须跟着走，而不需要谁去改 worktree 行。
 *
 * 次序是 `(createdAt, branchId)`：SQLite 的 `CURRENT_TIMESTAMP` 只到秒，同秒建的两行只靠 `createdAt`
 * 排不出确定次序。探针只按第一列排，第二列的确定性由 capture conformance 在真后端上测。
 */

import { describe, expect, it } from 'vitest';
import { WorktreeCapabilityDisabledError } from '../../working-tree/working-tree-facade.js';
import { createWorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

describe('listWorktrees', () => {
  it('零行是合法态：返回空数组，不是错误', async () => {
    const scene = createWorktreeContextsScene();

    await expect(scene.manager.listWorktrees()).resolves.toEqual([]);
  });

  it('每行带 id / branchId / label / active / createdAt，active 只落在 active 分支那一行', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    const createdAt = new Date('2026-10-13T08:00:00.000Z');
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId, createdAt });
    scene.addWorktree({
      id: 'wt-x',
      branchId: 'feature-x',
      label: 'Feature X',
      createdAt: new Date('2026-10-13T09:00:00.000Z')
    });

    const list = await scene.manager.listWorktrees();

    expect(list).toEqual([
      { id: 'wt-main', branchId: scene.branchId, label: null, active: true, createdAt },
      {
        id: 'wt-x',
        branchId: 'feature-x',
        label: 'Feature X',
        active: false,
        createdAt: new Date('2026-10-13T09:00:00.000Z')
      }
    ]);
  });

  it('从分支菜单直接切走之后，勾选跟着 rxdb_branch.activated 走', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x', createdAt: new Date('2026-10-13T09:00:00.000Z') });

    // 走场景的假 `versionManager`：等价于用户在分支菜单里直接切走，worktree 行一个字都没动。
    await scene.switchBranch('feature-x');
    const list = await scene.manager.listWorktrees();

    expect(list.map(info => [info.id, info.active])).toEqual([
      ['wt-main', false],
      ['wt-x', true]
    ]);
  });

  it('active 分支没有行时，没有任何一行是 active（「无行 active」是合法态）', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addWorktree({ id: 'wt-x', branchId: 'feature-x' });

    const list = await scene.manager.listWorktrees();

    expect(list.map(info => info.active)).toEqual([false]);
  });

  it('按 createdAt 升序，与插入顺序无关', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-a');
    scene.addBranch('feature-b');
    scene.addWorktree({ id: 'wt-b', branchId: 'feature-b', createdAt: new Date('2026-10-13T10:00:00.000Z') });
    scene.addWorktree({ id: 'wt-a', branchId: 'feature-a', createdAt: new Date('2026-10-13T09:00:00.000Z') });

    const list = await scene.manager.listWorktrees();

    expect(list.map(info => info.id)).toEqual(['wt-a', 'wt-b']);
  });

  it('未启用能力：commit_capability_disabled', async () => {
    const scene = createWorktreeContextsScene({ enabled: false });

    await expect(scene.manager.listWorktrees()).rejects.toBeInstanceOf(WorktreeCapabilityDisabledError);
  });
});
