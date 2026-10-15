/**
 * @fileoverview 提交历史的**公开面**：`readCommitLogPage()` 与门面上的 `listCommits()`
 * （FR-012、FR-048，contracts/core-api.md §5、tri-framework-api.md §3）。
 *
 * @remarks
 * 可达性遍历本身是 `commit/list-commits.ts` 的事，由 `commit-graph.spec.ts` 覆盖。
 * 这里只钉三件公开面上的事：
 *
 * 1. **条目是翻译过的，不是 `Commit` 实体本体。** 实体带着 `operationId` 与
 *    `contentFingerprint`——一个是写路径的幂等键，一个是守卫的内容判据，两者都不承诺跨版本
 *    稳定。摆上公开面，第一个拿 `contentFingerprint` 当「内容有没有变」的调用方就把一条
 *    内部不变量焊死成了外部契约。
 * 2. **`listCommits()` 不收 `branchId`。** 与 `status()` / `diff()` 同一条线（FR-048）：
 *    读的恒为 active 分支。别的分支的历史拿回去，既不能在它上面提交也不能丢弃。
 * 3. **一次都没提交过的库，回的是空 `entries` 的一页，不是抛错、也不是 `null`。**
 *    空历史是正常状态，而 `headCommitId: null` 已经把它说清楚了。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { readCommitChangeSetPage, type CommitChangeSetPage } from '../../commit/commit-changes.js';
import { readCommitLogPage, type CommitLogEntry, type CommitLogOptions } from '../../commit/commit-log.js';
import { createWorkingTreeScene, SCENE_BRANCH_ID, seedCommit } from './fixtures/working-tree-scene.js';

/** 造一条 `root → child` 的两节点历史，并把 ref 指到 `child`。 */
const sceneWithHistory = (): ReturnType<typeof createWorkingTreeScene> => {
  const scene = createWorkingTreeScene({ headCommitId: 'commit-child' });
  seedCommit(scene, 'commit-root');
  seedCommit(scene, 'commit-child', ['commit-root']);
  return scene;
};

describe('readCommitLogPage()：历史的公开形状（FR-012）', () => {
  it('回的是当前分支 id、HEAD 与可达父链上的条目', async () => {
    const scene = sceneWithHistory();

    const page = await readCommitLogPage(scene.probe.executor, SCENE_BRANCH_ID);

    expect(page.branchId).toBe(SCENE_BRANCH_ID);
    expect(page.headCommitId).toBe('commit-child');
    expect([...page.entries].map(entry => entry.commitId).sort()).toEqual(['commit-child', 'commit-root']);
  });

  it('条目带着父链关系：第一父单独一位，`parentIds` 保留全部父', async () => {
    const scene = sceneWithHistory();

    const page = await readCommitLogPage(scene.probe.executor, SCENE_BRANCH_ID);
    const child = page.entries.find(entry => entry.commitId === 'commit-child') as CommitLogEntry;
    const root = page.entries.find(entry => entry.commitId === 'commit-root') as CommitLogEntry;

    expect({ parentIds: child.parentIds, firstParentId: child.firstParentId }).toEqual({
      parentIds: ['commit-root'],
      firstParentId: 'commit-root'
    });
    // 根节点没有父：`firstParentId` 是 null，而不是指回自己或一个空串。
    expect({ parentIds: root.parentIds, firstParentId: root.firstParentId }).toEqual({
      parentIds: [],
      firstParentId: null
    });
  });

  // 写路径的幂等键与守卫的内容判据都不是外部契约，摆上去就会被当成内容判据用。
  it('条目的键集是封闭的：没有 operationId，也没有 contentFingerprint', async () => {
    const scene = sceneWithHistory();

    const page = await readCommitLogPage(scene.probe.executor, SCENE_BRANCH_ID);

    expect(Object.keys(page.entries[0] as CommitLogEntry).sort()).toEqual([
      'authorId',
      'changeSetCount',
      'commitId',
      'createdAt',
      'firstParentId',
      'kind',
      'message',
      'parentIds'
    ]);
    expectTypeOf<keyof CommitLogEntry>().toEqualTypeOf<
      'commitId' | 'parentIds' | 'firstParentId' | 'kind' | 'message' | 'authorId' | 'createdAt' | 'changeSetCount'
    >();
  });

  it('一次都没提交过的分支回一页空历史，headCommitId 为 null', async () => {
    const scene = createWorkingTreeScene();

    const page = await readCommitLogPage(scene.probe.executor, SCENE_BRANCH_ID);

    expect({ branchId: page.branchId, headCommitId: page.headCommitId, entries: page.entries }).toEqual({
      branchId: SCENE_BRANCH_ID,
      headCommitId: null,
      entries: []
    });
  });

  it('limit 从 HEAD 端截断，不是随便留两个', async () => {
    const scene = sceneWithHistory();

    const page = await readCommitLogPage(scene.probe.executor, SCENE_BRANCH_ID, { limit: 1 });

    expect(page.entries.map(entry => entry.commitId)).toEqual(['commit-child']);
  });
});

describe('门面上的 listCommits()（FR-048、tri-framework-api.md §3）', () => {
  it('零参可调，读的是 active 分支的历史', async () => {
    const scene = sceneWithHistory();

    const page = await scene.manager.listCommits();

    expect(page.branchId).toBe(SCENE_BRANCH_ID);
    expect(page.headCommitId).toBe('commit-child');
    expect(page.entries).toHaveLength(2);
  });

  it('入参里没有 branchId：读哪条分支由 active 分支唯一决定', () => {
    // 开了这个口子，调用方就能问一个它既不能在其上提交、也不能在其上丢弃的对象。
    expectTypeOf<keyof CommitLogOptions>().toEqualTypeOf<'limit' | 'since' | 'until' | 'entity'>();
  });
});

describe('commitChanges()：commit 明细侧（FR-012）', () => {
  it('回的是该 commit 的全部变更单元：按 sequence 顺序、已过 codec 解码', async () => {
    const scene = sceneWithHistory();

    const page = await scene.manager.commitChanges('commit-child');

    expect(page.commitId).toBe('commit-child');
    expect(page.entries).toHaveLength(1);
    // 种子单元是 `app.Note` 上的一次 update；`patch` 是解码态而不是 `$rxdbChangeValue` 信封
    expect(page.entries[0]).toMatchObject({
      unitId: 'commit-child-unit',
      entity: 'Note',
      operation: 'update',
      patch: { title: '改后' },
      inversePatch: { title: '改前' }
    });
    expectTypeOf<keyof CommitChangeSetPage>().toEqualTypeOf<'commitId' | 'entries'>();
  });

  it('入参只有 commitId：明细侧只回答「它写了什么」，不回答「它在不在当前分支的历史里」', () => {
    const scene = sceneWithHistory();
    expectTypeOf(scene.manager.commitChanges).parameter(0).toEqualTypeOf<string>();
  });

  it('不存在的 commit 抛错，而不是返回一页空的明细', async () => {
    const scene = sceneWithHistory();

    await expect(scene.manager.commitChanges('no-such-commit')).rejects.toThrow(/does not exist/);
    await expect(readCommitChangeSetPage(scene.probe.executor, scene.context.codec, 'no-such-commit')).rejects.toThrow(
      /does not exist/
    );
  });

  it('零变更单元的 commit 是一页空明细（entries 为空数组），不是异常', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'commit-empty' });
    seedCommit(scene, 'commit-empty', [], []);

    const page = await scene.manager.commitChanges('commit-empty');

    expect(page.commitId).toBe('commit-empty');
    expect(page.entries).toEqual([]);
  });
});
