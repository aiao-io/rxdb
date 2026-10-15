/**
 * @fileoverview T102 红测试：恢复会话上的 CAS 与 commit / discard 一样是**调用方捕获型**；
 * 冲突时两边的状态都原样保留，由 expected / actual revision 派生 `conflicted`，
 * **不自动选择任一 writer 的状态**（FR-034）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts` 与 `src/working-tree/restore-session-transitions.ts`。
 *
 * 会话把 CAS 的时间跨度从「一次调用」拉长到「一段用户交互」——restore 建立会话，用户看一眼，
 * 然后 commit 或 discard。这中间的每一秒，另一个 Tab 都可能在写同一个工作树。三个退化写法
 * 因此各自对应一个真实的数据损失：
 *
 * 1. **会话把「我期望的 revision」存成恢复后的值。** 那样 `status()` 里 `intact` 的比较
 *    永远成立，`conflicted` 恒为 false（`status.ts` › `readRestoreBits` 就是拿会话行上这
 *    两个数与当前值比）。冲突于是永远不显示，用户在一个已经被别人改过的工作树上按下提交。
 * 2. **冲突时自动挑一边。** 「保留恢复结果、丢弃对方的写」和「保留对方的写、丢弃恢复结果」
 *    都是**替用户做的决定**，而用户此刻正看着屏幕。v1 的答案是两份都留着、把冲突这一位
 *    亮出来，让下一步由人来选。
 * 3. **会话上的 commit 自己去读当前 revision。** 读到的恒等于当前值，CAS 于是永远命中——
 *    比不校验更糟，因为它看起来校验过了。会话不改变这条：commit 仍然要调用方把自己
 *    **看过**的那个 revision 递进来。
 *
 * `rowsAffected: 0` 是本文件制造 CAS 未命中的唯一手段：场景的探针把它固定成 `query()` 的
 * 返回值，于是「带 `WHERE revision = ?` 的那条 UPDATE 一行都没更新」这件事被精确复现，
 * 而不需要真起两个连接。
 *
 * 本文件不碰 dirty 守卫的**判据**（T099）与兼容性预检（T101）；这里只借 dirty 场景验证
 * 一件事：拒绝发生在建会话**之前**。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { commitWorkingTree, type CommitOptions } from '../../working-tree/commit-command.js';
import {
  restoreWorkingTree,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult
} from '../../working-tree/restore-command.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene,
  type WorkingTreeSceneOptions
} from './fixtures/working-tree-scene.js';

const HEAD = 'commit-head';
const OLDER = 'commit-older';

/** 两节点历史；`rowsAffected` 拨 0 即制造一次 CAS 未命中。 */
const sceneWithHistory = (options: WorkingTreeSceneOptions = {}): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2, ...options });
  seedCommit(scene, OLDER);
  seedCommit(scene, HEAD, [OLDER]);
  return scene;
};

const credentialsOf = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeRestoreOptions> = {}
): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

const restoreOnce = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeRestoreOptions> = {}
): Promise<WorkingTreeRestoreResult> =>
  restoreWorkingTree(scene.probe.executor, scene.context, { commitId: OLDER }, credentialsOf(scene, overrides));

const sessionRowsOf = (scene: WorkingTreeScene): WorkingTreeRestoreSession[] =>
  scene.probe.rowsOf(WorkingTreeRestoreSession) as WorkingTreeRestoreSession[];

const activationRowOf = (scene: WorkingTreeScene): WorkingTreeActivationState =>
  scene.probe.rowsOf(WorkingTreeActivationState)[0] as WorkingTreeActivationState;

describe('初次 restore：clean 前置 + 只动工作树 revision（FR-034）', () => {
  it('成功只递增 workingTreeRevision，head 与 activation 两个 revision 都不动', async () => {
    const scene = sceneWithHistory();
    const before = {
      head: refRowOf(scene).headRevision,
      activation: activationRowOf(scene).activationRevision
    };

    const result = await restoreOnce(scene);

    // 三个 revision 各管一件事：head 管提交推进、activation 管分支切换、
    // workingTree 管未提交内容。restore 只写了未提交内容，动另外两个中的任何一个，
    // 都会让所有**别的** realm 手里那份与 restore 无关的捕获凭据一起失效。
    expect(result.ok).toBe(true);
    expect({
      head: refRowOf(scene).headRevision,
      activation: activationRowOf(scene).activationRevision
    }).toEqual(before);
  });

  it('dirty 工作树上拒绝，且拒绝发生在建会话之前', async () => {
    const scene = sceneWithHistory();
    scene.addEntry();

    const result = await restoreOnce(scene);

    // 「先建会话、再检查、不过就删」与「先检查、过了再建」在最终行数上看不出区别，
    // 直到删除那一步因为别的原因失败——那时留下的是一个指向从未发生过的恢复的 active
    // 会话，它占住 activeKey 的唯一索引，而没有任何入口能结束它。
    expect({ ok: result.ok, sessions: sessionRowsOf(scene).length }).toEqual({ ok: false, sessions: 0 });
  });
});

describe('CAS 未命中：全部回滚，且一个会话都不建', () => {
  it('捕获的 workingTreeRevision 对不上时，条目、会话、revision 三样都没动', async () => {
    const scene = sceneWithHistory();
    const before = {
      entries: entryRowsOf(scene).length,
      revision: stateRowOf(scene).workingTreeRevision,
      entryCount: stateRowOf(scene).entryCount
    };

    const result = await restoreOnce(scene, { expectedWorkingTreeRevision: 99 });

    expect(result.ok).toBe(false);
    expect({
      entries: entryRowsOf(scene).length,
      revision: stateRowOf(scene).workingTreeRevision,
      entryCount: stateRowOf(scene).entryCount,
      sessions: sessionRowsOf(scene).length
    }).toEqual({ ...before, sessions: 0 });
  });

  it('UPDATE 一行都没命中时（rowsAffected=0）同样零变化、零会话', async () => {
    // 前一条测的是「读到的值与捕获值不等」，这一条测的是「值相等，但真正那条
    // 带 WHERE 的 UPDATE 还是没命中」——两个 realm 在读与写之间交叉时的实际形态。
    // 只实现前者的话，比较通过之后写入照常进行，而那次写入落在别人的 revision 上。
    const scene = sceneWithHistory({ rowsAffected: 0 });

    const result = await restoreOnce(scene);

    expect({
      ok: result.ok,
      entries: entryRowsOf(scene).length,
      sessions: sessionRowsOf(scene).length
    }).toEqual({ ok: false, entries: 0, sessions: 0 });
  });

  it('CAS 失败不留下 restoring 位', async () => {
    const scene = sceneWithHistory();

    await restoreOnce(scene, { expectedWorkingTreeRevision: 99 });
    const status = await readWorkingTreeStatus(scene.probe.executor);

    expect({ restoring: status.restoring, conflicted: status.conflicted }).toEqual({
      restoring: false,
      conflicted: false
    });
  });
});

describe('已有会话时的 commit CAS 失败：两边都保留，conflicted 由 revision 派生', () => {
  /** 建一个会话，然后让工作树 revision 在会话背后前进一格——另一个 Tab 写了一次。 */
  const sceneWithDivergedSession = (): WorkingTreeScene => {
    const scene = sceneWithHistory();
    scene.addRestoreSession({
      targetCommitId: OLDER,
      expectedHeadRevision: refRowOf(scene).headRevision,
      expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
      status: 'active'
    });
    scene.addEntry();
    stateRowOf(scene).workingTreeRevision += 1;
    return scene;
  };

  it('conflicted 由会话捕获值与当前值的比较派生，不由某个写死的状态列派生', async () => {
    const scene = sceneWithDivergedSession();

    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 会话行的 `status` 仍然是 `'active'`——`conflicted` **不读它**，读的是两个
    // revision 的比较（`status.ts` › `readRestoreBits`）。读状态列的话，冲突只有在
    // 某次写入**成功地**把它改成 'conflicted' 之后才显示，而冲突恰恰意味着那次写入没成功。
    expect({ restoring: status.restoring, conflicted: status.conflicted }).toEqual({
      restoring: false,
      conflicted: true
    });
    expect(sessionRowsOf(scene)[0].status).toBe('active');
  });

  it('会话上的 commit CAS 失败时，工作树与会话都原样留着', async () => {
    const scene = sceneWithDivergedSession();
    const before = {
      entries: entryRowsOf(scene).length,
      sessions: sessionRowsOf(scene).length,
      sessionStatus: sessionRowsOf(scene)[0].status
    };

    const result = await commitWorkingTree(scene.probe.executor, scene.context, '提交恢复结果', {
      authorId: 'alice',
      operationId: 'op-restore-commit',
      expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
      expectedHeadRevision: refRowOf(scene).headRevision,
      // 调用方捕获的是**会话建立时**那个 revision——他看到的就是那一份。
      expectedWorkingTreeRevision: sessionRowsOf(scene)[0].expectedWorkingTreeRevision
    });

    // 「自动挑一边」的两种写法——丢弃恢复结果、或丢弃对方的写——都会让这里的行数变。
    // v1 两份都留着，把选择权交回给正在看屏幕的那个人。
    expect(result.ok).toBe(false);
    expect({
      entries: entryRowsOf(scene).length,
      sessions: sessionRowsOf(scene).length,
      sessionStatus: sessionRowsOf(scene)[0].status
    }).toEqual(before);
  });

  it('CommitOptions 上没有任何「选一边」的开关', () => {
    // 键集而不是点名：`force` / `theirs` / `ours` / `strategy` 只是几个想得到的名字。
    // 这五个之外的任何一个键，都是在问「冲突时听谁的」——而 v1 的答案是「听用户的，
    // 而用户不在这个函数的参数表里」。
    expectTypeOf<keyof CommitOptions>().toEqualTypeOf<
      'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision' | 'authorId' | 'operationId'
    >();
  });

  it('会话在场时 commit 的凭据仍然是必填的调用方捕获位', () => {
    // 会话把「期望的 revision」记进了库，于是「commit 直接读会话行就好」变得很顺手。
    // 那等于让被测系统自己提供期望值：读到的恒等于当前值，CAS 永远命中。
    // 会话记的是**诊断**用的捕获快照，不是 CAS 的输入源。
    expectTypeOf<Parameters<typeof commitWorkingTree>[3]>().toEqualTypeOf<CommitOptions>();
    expectTypeOf<Parameters<typeof commitWorkingTree>['length']>().toEqualTypeOf<4>();
  });
});
