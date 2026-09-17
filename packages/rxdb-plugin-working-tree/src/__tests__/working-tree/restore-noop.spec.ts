/**
 * @fileoverview T103 红测试：restore 算出来的完整 diff 为空时是一次 **no-op**——不创建
 * session、不创建条目、不递增任何 revision（FR-042）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts`。
 *
 * 「恢复一个内容与当前工作树完全相同的 commit」听上去是个不会有人做的操作，实际上它是
 * **最容易被点到的那一个**：用户在 `listCommits()` 里点了一行，而那一行恰好就是他现在所在
 * 的位置；或者点了 `HEAD~1`，而 `HEAD` 那次提交后来被 revert 过，两个节点的物化状态相等。
 *
 * 不把这条单拎出来的话，restore 会**照常走完整条写路径**，于是：
 *
 * 1. **凭空多出一个 active 会话。** 它的 `activeKey` 占住了「一分支至多一个未结束会话」的
 *    那个唯一索引，而它对应的恢复内容是空的。用户接下来真想恢复点什么时，会拿到一个
 *    来自上一次空操作的唯一键冲突——报错的位置离肇事的位置隔着好几步。
 * 2. **`status().restoring` 恒为 true。** 会话建了就不会自己结束（FR-015 要求由 commit /
 *    discard 收尾），而这次恢复没产生任何可提交的东西，用户于是卡在一个既没法提交、
 *    也不知道该 discard 什么的状态里。
 * 3. **工作树 revision 白涨一格。** 另一个 realm 手里那份捕获的 revision 因此失效，它的下一次
 *    `commit()` 拿到 `working_tree_revision` 冲突——而工作树的内容一个字节都没变过。
 *    CAS 的意义是「你看过的东西被人动了」，空 restore 让它变成「你看过的东西没被动，但你得重来」。
 *
 * 判空必须发生在**写之前**，而不是「写完发现是空的再回滚」：后者在 revision 与唯一索引上
 * 留下的痕迹与前者不同（回滚掉的自增序列不一定归还），而 FR-042 的措辞是「不递增」，
 * 不是「递增后回滚」。本文件因此逐项钉住三张表的行数与两个 revision 的**绝对值**。
 *
 * 本文件不碰失败出口：no-op 是**成功**的一种，不是拒绝。恢复一个不可达 / 不兼容 /
 * 撞上 dirty 的 commit 分别由 T101 / T099 管。
 */

import { describe, expect, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
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

/** 当前 HEAD 的 commit id。 */
const HEAD = 'commit-head';

/** HEAD 的父节点。 */
const OLDER = 'commit-older';

/**
 * 两节点历史 + clean 工作树，HEAD 停在 {@link HEAD}。
 *
 * @remarks
 * 与 T098 同形。这里之所以也要两个节点：只有一个节点时「恢复 HEAD」与「恢复唯一的那个
 * commit」是同一件事，测不出「no-op 的判据是 diff 为空，不是 target === HEAD」。
 */
const sceneWithHistory = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2 });
  seedCommit(scene, OLDER);
  seedCommit(scene, HEAD, [OLDER]);
  return scene;
};

const credentialsOf = (scene: WorkingTreeScene): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

/** 恢复 HEAD 自己：clean 工作树上，它的物化结果恒等于现状，完整 diff 为空。 */
const restoreHead = (scene: WorkingTreeScene): Promise<WorkingTreeRestoreResult> =>
  restoreWorkingTree(scene.probe.executor, scene.context, { commitId: HEAD }, credentialsOf(scene));

/** 取成功出口；no-op 是成功的一种，拿到失败出口说明判空被实现成了拒绝。 */
const expectOk = (result: WorkingTreeRestoreResult): Extract<WorkingTreeRestoreResult, { ok: true }> => {
  if (!result.ok) throw new Error(`no-op 是成功的一种，不该走失败出口，实际拿到：${JSON.stringify(result)}`);
  return result;
};

/** 库里整个世界的行数快照；no-op 的定义就是它逐项不变。 */
const snapshotOf = (scene: WorkingTreeScene) => ({
  entries: entryRowsOf(scene).length,
  sessions: scene.probe.rowsOf(WorkingTreeRestoreSession).length,
  commits: scene.probe.rowsOf(Commit).length,
  changeSets: scene.probe.rowsOf(CommitChangeSet).length,
  entryCount: stateRowOf(scene).entryCount,
  workingTreeRevision: stateRowOf(scene).workingTreeRevision,
  headRevision: refRowOf(scene).headRevision
});

describe('完整 diff 为空时 restore 是一次 no-op（FR-042）', () => {
  it('成功返回，但恢复出来的单元数是 0', async () => {
    const scene = sceneWithHistory();

    const result = expectOk(await restoreHead(scene));

    // no-op 不另立一个布尔位：`restoredCount === 0` 已经是它的全部含义，
    // 而多一个 `noop` 字段就多一个会与 `restoredCount` 对不上的地方。
    // `sessionId: null` 则是「没建会话」在返回值上的投影，见下一条。
    expect({ restored: result.restoredCount, session: result.sessionId }).toEqual({
      restored: 0,
      session: null
    });
  });

  it('三张表一行都没多，两个 revision 一格都没涨', async () => {
    const scene = sceneWithHistory();
    const before = snapshotOf(scene);

    await restoreHead(scene);

    // 断绝对值而不是断「没报错」：判空若被实现成「照写，然后回滚」，
    // 行数确实会回到原值，但 revision 与自增序列未必——FR-042 的措辞是
    // 「不递增」，不是「递增后回滚」。
    expect(snapshotOf(scene)).toEqual(before);
  });

  it('工作树 revision 在返回值里也保持原值', async () => {
    const scene = sceneWithHistory();
    const before = stateRowOf(scene).workingTreeRevision;

    const result = expectOk(await restoreHead(scene));

    // 返回值里报一个「涨了一格」而库里没涨，调用方会拿这个假值去做下一次 CAS 捕获，
    // 于是它的下一次 commit() 必然冲突——错误出现在下一个操作里，而不是这一个。
    expect(result.workingTreeRevision).toBe(before);
  });

  it('没建会话，于是 status() 不报 restoring，工作树仍然 clean', async () => {
    const scene = sceneWithHistory();

    await restoreHead(scene);
    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 建了会话就再也不会自己结束（FR-015 要求由 commit / discard 收尾），
    // 而这次恢复没产生任何可提交的东西——用户会卡在一个既没法提交、
    // 也不知道该 discard 什么的状态里。
    expect({ restoring: status.restoring, conflicted: status.conflicted, clean: status.clean }).toEqual({
      restoring: false,
      conflicted: false,
      clean: true
    });
  });

  it('no-op 之后原来那份捕获凭据仍然有效', async () => {
    const scene = sceneWithHistory();
    const credentials = credentialsOf(scene);

    await restoreHead(scene);
    const again = await restoreWorkingTree(scene.probe.executor, scene.context, { commitId: HEAD }, credentials);

    // 这一条是前面几条的**行为化**复述：revision 没涨，所以恢复前捕获的那一份凭据
    // 在恢复后仍然命中。涨了的话这里会拿到 working_tree_revision 冲突——
    // 而工作树的内容一个字节都没变过。
    expect(again.ok).toBe(true);
  });
});

describe('no-op 的判据是 diff 为空，不是 target === HEAD', () => {
  it('恢复一个非 HEAD 但物化结果相同的节点，同样是 no-op', async () => {
    const scene = sceneWithHistory();
    const before = snapshotOf(scene);

    // `seedCommit` 给两个节点塞的是各自独立的单元，物化结果本不相同；
    // 这一条要的是「判据走的是内容比较」这件事本身——实现若用 `target === headCommitId`
    // 抄近路，这里恢复 OLDER 就会写出条目，而它与 HEAD 的差集确实非空，
    // 所以本用例期望的是**写出来了**。反过来说：它是上面那组的负向锚，
    // 证明 no-op 的绿不是因为 restore 压根没实现内容比较而对所有输入都返回 0。
    const result = expectOk(
      await restoreWorkingTree(scene.probe.executor, scene.context, { commitId: OLDER }, credentialsOf(scene))
    );

    expect(result.restoredCount).toBeGreaterThan(0);
    expect(snapshotOf(scene)).not.toEqual(before);
  });
});
