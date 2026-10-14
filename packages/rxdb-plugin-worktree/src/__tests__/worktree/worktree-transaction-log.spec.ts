/**
 * @fileoverview worktree 四个命令开的受管事务都不记日志（`transactionLog: false`）。
 *
 * @remarks
 * 四个命令体只读，或只写 `log: false` 的 `rxdb_worktree`，一条变更日志都不会产生；而记日志的事务在
 * SQLite 族上每笔都要为每个记日志实体重建两轮触发器。其余受管成员（`status()` 等）照旧走默认。
 */

import { describe, expect, it } from 'vitest';
import { createWorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

describe('worktree 命令的事务不记日志', () => {
  it('listWorktrees / createWorktree / switchWorktree / removeWorktree 都传 transactionLog: false', async () => {
    const scene = createWorktreeContextsScene();
    scene.addBranch('feature-x');
    scene.addBranch('feature-y');
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });

    await scene.manager.listWorktrees();
    const created = await scene.manager.createWorktree('feature-x');
    await scene.manager.switchWorktree('wt-main');
    await scene.manager.removeWorktree(created.id);

    expect(scene.transactionLogs).toEqual([false, false, false, false]);
  });

  it('其余受管成员照旧走默认的记日志事务', async () => {
    const scene = createWorktreeContextsScene();

    await scene.manager.status();

    expect(scene.transactionLogs).toEqual([undefined]);
  });
});
