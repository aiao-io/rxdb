/**
 * @fileoverview T100 红测试：恢复结果写成**普通** `WorkingTreeEntry`，与用户手写的变更
 * 同形、同表、同 revision 轴；不存在「已恢复但未暂存」这一额外状态；`commit()` 不接受任何
 * 只提交恢复结果子集的参数（FR-015）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts` 的写路径。
 *
 * 这一组防的是四件事：
 *
 * 1. **恢复结果落进一张自己的表。** 「`rxdb_working_tree_restored_entry`」这张表一旦存在，
 *    `status()` / `diff()` / `commit()` / `discard()` 四条入口就都要各自记得再读一次它——
 *    而漏掉的那一条会在某个版本里悄悄地把恢复出来的变更丢掉，或者提交一批用户以为已经
 *    丢弃了的东西。FR-015 的落点是**同一张表**。
 * 2. **同表但多一列。** `isRestored` / `stagedAt` 这类列就是「已恢复但未暂存」这个第三态的
 *    物理载体：列一旦存在，界面迟早会据它分组，而分组就意味着用户可以只提交其中一组——
 *    那正是硬裁决 1 被封死的那条路。本文件因此逐字段比对恢复行与手写行的形状。
 * 3. **恢复走的是另一条 revision 轴。** 恢复若不动 `workingTreeRevision`（或者动的是另一个
 *    计数器），另一个 realm 手里那份捕获的 revision 在恢复之后仍然「有效」，它的 `commit()`
 *    会连带提交自己从没见过的那一批恢复结果。
 * 4. **`commit()` 长出「只提交恢复的那部分」。** FR-015 最后一句是一条独立要求，不是
 *    硬裁决 1 的复述：恢复这个场景给了 selection 入参一个听起来最正当的理由
 *    （「我只是想把恢复的内容落下来」），所以这里再钉一次。
 *
 * **本文件不碰的两件事**：会话生命周期（T102）、`commit()` 与 session `committed` 转换的
 * 原子性（T107 / 由 T102 覆盖）。这里只看落在工作树里的那批行长什么样。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CommitOptions } from '../../working-tree/commit-command.js';
import { readWorkingTreeDiff } from '../../working-tree/diff.js';
import { restoreWorkingTree, type WorkingTreeRestoreOptions } from '../../working-tree/restore-command.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 目标 commit 的 id；`HEAD~1` 那一个。 */
const OLDER = 'commit-older';

/** 当前 HEAD 的 commit id。 */
const HEAD = 'commit-head';

/** 造一个两节点历史 + clean 工作树的场景。 */
const sceneWithHistory = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2 });
  seedCommit(scene, OLDER);
  seedCommit(scene, HEAD, [OLDER]);
  return scene;
};

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

/** 跑一次恢复，返回落进工作树的那批行。 */
const restoreAndRead = async (scene: WorkingTreeScene): Promise<WorkingTreeEntry[]> => {
  const result = await restoreWorkingTree(
    scene.probe.executor,
    scene.context,
    { commitId: OLDER },
    credentialsOf(scene)
  );
  if (!result.ok) throw new Error(`期望这次恢复成功，实际拿到：${JSON.stringify(result)}`);
  return entryRowsOf(scene);
};

describe('恢复结果就是普通工作树条目（FR-015）', () => {
  it('落在 WorkingTreeEntry 这张表里，没有第二张表', async () => {
    const scene = sceneWithHistory();

    const rows = await restoreAndRead(scene);

    // 探针按实体类分桶；恢复结果若落进别的类，这里读到的就是 0 行。
    // 第二张表存在的话，四条入口都要各自记得再读一次它，而漏掉的那条会悄悄丢数据。
    expect(rows).toHaveLength(1);
  });

  it('字段集与手写条目逐字段同形，没有 isRestored / stagedAt 一类的标记列', async () => {
    const manual = sceneWithHistory();
    const manualRow = manual.addEntry({ entityId: 'note-by-hand' });

    const restored = sceneWithHistory();
    const [restoredRow] = await restoreAndRead(restored);

    // 键集比对而不是点名：点名只挡得住想得到的那几个列名。多出来的任何一列都是
    // 「已恢复但未暂存」这个第三态的物理载体，而它一旦存在，界面迟早据它分组，
    // 分组就意味着用户可以只提交其中一组——硬裁决 1 封死的正是那条路。
    expect(Object.keys(restoredRow).sort()).toEqual(Object.keys(manualRow).sort());
  });

  it('origin 记的是 local，不是某个只有 restore 认识的第三种来源', async () => {
    const scene = sceneWithHistory();

    const [row] = await restoreAndRead(scene);

    // `WriteEntryOrigin` 只有 local / remote_sync 两个值（硬裁决 6）。给恢复加第三个值
    // 等于让 `status().byOrigin` 多一个桶，而那个桶的唯一用途就是在界面上把恢复结果
    // 单独列出来——又回到可以只提交一组。
    expect(row.origin).toBe('local');
  });

  it('diff() 把恢复出来的条目与手写条目一样摊出来', async () => {
    const scene = sceneWithHistory();
    await restoreAndRead(scene);

    const diff = await readWorkingTreeDiff(scene.probe.executor, SCENE_BRANCH_ID);

    // diff 是用户提交前唯一的复核界面。恢复结果若不在里面，用户就会提交一批
    // 自己在 diff 里从没见过的变更。
    expect(diff.entries).toHaveLength(1);
  });

  it('status() 把恢复之后的工作树报成 dirty，而不是某个第三态', async () => {
    const scene = sceneWithHistory();
    await restoreAndRead(scene);

    const status = await readWorkingTreeStatus(scene.probe.executor);

    // clean 只有两态。「恢复完了但还没暂存」若能让 clean 为 true，
    // 用户关掉页面时不会收到任何未保存提示。
    expect({ clean: status.clean, entryCount: status.entryCount }).toEqual({ clean: false, entryCount: 1 });
  });
});

describe('走的是同一条 revision 轴（FR-015）', () => {
  it('恢复递增的是 workingTreeRevision 本身', async () => {
    const scene = sceneWithHistory();
    const before = stateRowOf(scene).workingTreeRevision;

    await restoreAndRead(scene);

    // 另开一个计数器的话，别人捕获的 workingTreeRevision 在恢复之后仍然「有效」，
    // 他的 commit() 会连带提交自己从没见过的那批恢复结果。
    expect(stateRowOf(scene).workingTreeRevision).toBe(before + 1);
  });

  it('entryCount 冗余列跟着恢复一起收敛', async () => {
    const scene = sceneWithHistory();

    await restoreAndRead(scene);

    // 冗余列与真实行数分岔的症状是 `status()` 报干净而表里有行——
    // 而 discard 的 no-op 判据恰好读的是行数，于是那批行永远删不掉。
    expect(stateRowOf(scene).entryCount).toBe(entryRowsOf(scene).length);
  });
});

describe('commit() 不接受只提交恢复结果子集的参数（FR-015 末句）', () => {
  it('CommitOptions 的键集恰好是三个捕获位加 authorId / operationId', () => {
    // 恢复这个场景给了 selection 入参一个听起来最正当的理由——「我只是想把恢复的
    // 内容落下来」。FR-015 末句因此是一条独立要求，不是硬裁决 1 的复述。
    expectTypeOf<keyof CommitOptions>().toEqualTypeOf<
      'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision' | 'authorId' | 'operationId'
    >();
  });

  it('门面上的 commit() 不因为存在恢复会话而多收一个参数', () => {
    const scene = createWorkingTreeScene();

    // 签名是静态的；「有会话时多收一个参数」只能靠运行时判断实现，而那意味着
    // 同一个调用在两种状态下语义不同。
    expect(scene.manager.commit).toHaveLength(2);
  });
});
