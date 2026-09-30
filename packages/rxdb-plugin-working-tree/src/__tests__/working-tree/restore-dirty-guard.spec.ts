/**
 * @fileoverview T099 红测试：restore 前检测 dirty 工作树；未显式处理未提交变更时**拒绝并
 * 保持原状**；判定口径只有 clean / dirty 两态（FR-014、spec.md 场景 2）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts` 里排在任何持久写入之前的那一道守卫。
 *
 * 这一组防的是四件事：
 *
 * 1. **守卫长出一个「强制恢复」开关。** `restore(target, { force: true })` 看起来只是
 *    把选择权交还用户，实际效果是把用户手写的那批未提交变更与恢复出来的那批**混进同一棵
 *    工作树**——而 v1 的 `commit()` 提交的是全部未提交单元，没有任何入参能把两批再分开
 *    （FR-015 最后一句把这条路也堵死了）。用户于是只有一个出路：把自己刚写的东西一起提交。
 *    FR-014 因此没有给守卫留任何 opt-out，「显式处理」指的是**先 commit 或先 discard**，
 *    不是传一个参数。
 * 2. **判定口径从两态长成三态。** 「只有 remote_sync 来源的条目算不算脏」这类问题一旦
 *    可以被回答成「算半脏」，`status().clean` 与守卫就开始各说各话。FR-014 把口径钉成
 *    两态，而 clean 的定义只有一个来源：有没有未提交条目（硬裁决 6：`remote_sync` 不豁免）。
 * 3. **「拒绝」被实现成「先写后回滚」。** 拒绝必须发生在任何持久写入之前，而不是写完
 *    再撤。后者在事务边界之外（或者进程崩在中间）留下的是半棵恢复出来的工作树，
 *    而用户以为自己的操作被拒绝了。
 * 4. **拒绝顺手建了会话。** 会话是「恢复进行中」的唯一证据；一次被拒的恢复留下一行 active
 *    会话，`status().restoring` 会从此恒为 true，而没有任何一次恢复真的在进行。
 *
 * **本文件不碰的两件事**：CAS 与会话终态（T102）、兼容性预检（T101）。这里的 dirty 判定
 * 发生在三个捕获位都对得上的前提下——顺序本身由 T102 钉死。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  restoreWorkingTree,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult
} from '../../working-tree/restore-command.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
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

/** 造一个两节点历史的场景；`entries` 决定它 clean 还是 dirty。 */
const sceneWith = (
  entries: readonly Partial<{ entityId: string; origin: 'local' | 'remote_sync' }>[]
): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2 });
  seedCommit(scene, OLDER);
  seedCommit(scene, HEAD, [OLDER]);
  for (const entry of entries) scene.addEntry(entry);
  return scene;
};

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

/** 跑一次恢复。 */
const restoreOnce = (scene: WorkingTreeScene): Promise<WorkingTreeRestoreResult> =>
  restoreWorkingTree(scene.probe.executor, scene.context, { commitId: OLDER }, credentialsOf(scene));

/** 取场景里当前的会话行。 */
const sessionRowsOf = (scene: WorkingTreeScene): WorkingTreeRestoreSession[] =>
  scene.probe.rowsOf(WorkingTreeRestoreSession) as WorkingTreeRestoreSession[];

describe('dirty 工作树上 restore 被拒（FR-014、场景 2）', () => {
  it('有一条未提交条目就拒绝', async () => {
    const scene = sceneWith([{ entityId: 'note-mine' }]);

    const result = await restoreOnce(scene);

    if (result.ok) throw new Error(`期望被拒，实际恢复了 ${result.restoredCount} 个单元`);
    expect(result.reason).toBe('dirty_working_tree');
  });

  it('拒绝时工作树逐行保持原状', async () => {
    const scene = sceneWith([{ entityId: 'note-mine' }, { entityId: 'note-mine-2' }]);
    const before = {
      entries: entryRowsOf(scene)
        .map(row => row.entityId)
        .sort(),
      revision: stateRowOf(scene).workingTreeRevision,
      entryCount: stateRowOf(scene).entryCount
    };

    await restoreOnce(scene);

    // 「保持原状」是逐行的，不只是「条数没变」：恢复出来的单元若已经写进去、
    // 再按条数回滚掉两条，留下的很可能是用户自己那两条里的一条加恢复出来的一条。
    expect({
      entries: entryRowsOf(scene)
        .map(row => row.entityId)
        .sort(),
      revision: stateRowOf(scene).workingTreeRevision,
      entryCount: stateRowOf(scene).entryCount
    }).toEqual(before);
  });

  it('拒绝时不建会话，status() 也不报 restoring', async () => {
    const scene = sceneWith([{ entityId: 'note-mine' }]);

    await restoreOnce(scene);
    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 一次被拒的恢复留下 active 会话的话，`status().restoring` 会从此恒为 true，
    // 而没有任何一次恢复真的在进行——用户唯一的出路是手动删库里那一行。
    expect({ sessions: sessionRowsOf(scene).length, restoring: status.restoring }).toEqual({
      sessions: 0,
      restoring: false
    });
  });

  it('clean 工作树上同一次调用能过守卫', async () => {
    const scene = sceneWith([]);

    const result = await restoreOnce(scene);

    // 反面锚点：上面三条若因为别的原因（比如目标 commit 读不到）而「恰好」也被拒，
    // 这一条会同时红，于是能分辨「守卫生效」和「整条路径都不通」。
    expect(result.ok).toBe(true);
  });
});

describe('判定口径只有 clean / dirty 两态（FR-014、硬裁决 6）', () => {
  it('remote_sync 来源的条目照样算 dirty，不豁免', async () => {
    const scene = sceneWith([{ entityId: 'note-synced', origin: 'remote_sync' }]);

    const result = await restoreOnce(scene);

    // 硬裁决 6：`remote_sync` 不豁免。豁免的话，一棵只含同步条目的工作树会被守卫
    // 当成 clean 放行，而恢复出来的单元与同步下来的单元此后共处一棵工作树，
    // 下一次 commit() 把两批一起提交——用户从没打算提交后者。
    if (result.ok) throw new Error('期望 remote_sync 条目也算 dirty，实际放行了');
    expect(result.reason).toBe('dirty_working_tree');
  });

  it('守卫读的口径与 status().clean 是同一个', async () => {
    const dirty = sceneWith([{ entityId: 'note-mine' }]);
    const clean = sceneWith([]);

    const [dirtyStatus, cleanStatus] = [
      await readWorkingTreeStatus(dirty.probe.executor),
      await readWorkingTreeStatus(clean.probe.executor)
    ];
    const [dirtyResult, cleanResult] = [await restoreOnce(dirty), await restoreOnce(clean)];

    // 两个口径分头实现的话，它们迟早在某次改动里分岔，而分岔的症状是
    // 「界面显示干净，恢复却说脏」——用户没有任何手段能查出差在哪。
    expect({ dirtyBlocked: !dirtyResult.ok, cleanPassed: cleanResult.ok }).toEqual({
      dirtyBlocked: !dirtyStatus.clean,
      cleanPassed: cleanStatus.clean
    });
  });
});

describe('守卫没有 opt-out（FR-014、FR-015）', () => {
  it('WorkingTreeRestoreOptions 里没有 force / allowDirty 一类的开关', () => {
    // 键集而不是点名：点名只挡得住 force / allowDirty 这几个想得到的名字。
    // 任何第四个键都是在问「脏的时候怎么办」，而 FR-014 的答案恒为「拒绝」——
    // 这个问题因此没有入参可以承载。「显式处理」指的是先 commit 或先 discard。
    expectTypeOf<keyof WorkingTreeRestoreOptions>().toEqualTypeOf<
      'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision'
    >();
  });

  it('门面上的 restore() 没有第三个参数可以塞开关', () => {
    const scene = createWorkingTreeScene();

    expect(scene.manager.restore).toHaveLength(2);
  });
});
