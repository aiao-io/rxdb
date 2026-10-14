/**
 * @fileoverview 首次启用时补钉主 worktree：零 active 分支的老库启用之后，与新库、升级库形状相同。
 *
 * @remarks
 * 新库建库时就有主 worktree，升级上来、恰有一条 active 分支的库由 `0005-worktrees` 补；零 active 的老库
 * 两处都落空（R2：0005 不落行），active 分支要到首次启用时才由启用迁移建出来。于是首次启用的那一笔事务里，
 * 库里一个 worktree 都没有就把 active 分支钉上。
 *
 * 两个条件缺一不可：**这一次真的翻了能力位**（重复调用 `enable()` 不替用户钉一条没钉住的分支），
 * 且**表里一行都没有**（新库首次启用时已经有主 worktree，再钉一行会撞唯一索引）。
 */

import { ENTITY_LOCAL_CREATE_EVENT, type EntityLocalCreatedEvent } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { createWorktreeContextsScene } from './fixtures/worktree-contexts-scene.js';

describe('首次启用时补钉主 worktree', () => {
  it('未启用、一个 worktree 都没有：enable() 把 active 分支钉成主 worktree，并报一次 INSERT', async () => {
    const scene = createWorktreeContextsScene({ enabled: false });
    const created: EntityLocalCreatedEvent[] = [];
    scene.database.addEventListener(ENTITY_LOCAL_CREATE_EVENT, event => created.push(event));

    await scene.manager.enable();

    expect(scene.worktreeRows().map(row => [row.branchId, row.label])).toEqual([[scene.branchId, null]]);
    expect(created.flatMap(event => event.entities.map(data => data.entity))).toEqual(['Worktree']);
  });

  it('未启用、已有 worktree（新库建库时就钉了 main）：enable() 一行都不加', async () => {
    const scene = createWorktreeContextsScene({ enabled: false });
    scene.addWorktree({ id: 'wt-main', branchId: scene.branchId });

    await scene.manager.enable();

    expect(scene.worktreeRows().map(row => row.id)).toEqual(['wt-main']);
  });

  it('已启用的库再调 enable()：不替用户钉上当前分支', async () => {
    // 从分支菜单切到一条没钉住的分支、再把最后一个 worktree 删掉，表就是空的——这时重调 enable()
    // 是「把库收敛到已启用该有的形状」，不是「替我选一个主 worktree」。
    const scene = createWorktreeContextsScene();

    await scene.manager.enable();

    expect(scene.worktreeRows()).toEqual([]);
  });

  it('enableIfEmpty() 在空库上启用时同样补钉；库不空、按规则不启用时一行都不写', async () => {
    const empty = createWorktreeContextsScene({ enabled: false });
    await expect(empty.manager.enableIfEmpty()).resolves.toMatchObject({ kind: 'enabled' });
    expect(empty.worktreeRows().map(row => row.branchId)).toEqual([empty.branchId]);

    const alreadyEnabled = createWorktreeContextsScene();
    await expect(alreadyEnabled.manager.enableIfEmpty()).resolves.toMatchObject({ kind: 'already_enabled' });
    expect(alreadyEnabled.worktreeRows()).toEqual([]);
    expect((alreadyEnabled.probe.rowsOf(CommitCapabilityState) as CommitCapabilityState[])[0].enabled).toBe(true);
  });
});
