/**
 * @fileoverview T098 红测试：`restore()` 把可达历史 commit 的内容作为**新的未提交变更**
 * 写回当前工作树；默认**不移动 HEAD、不删历史**；会话持久化；不提供 detached HEAD /
 * checkout 到历史 commit（FR-013、contracts/core-api.md §5、硬裁决 5）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-command.ts` 与门面上的 `restore()` / `restoreSession()`。
 *
 * 这一组防的是四件事：
 *
 * 1. **restore 被实现成 checkout。** 「恢复到某个历史版本」在 git 的肌肉记忆里是移动
 *    HEAD，而硬裁决 5 把这条路直接封死：`listCommits()` 返回的是**数据，不是可切换的位置**。
 *    HEAD 一旦能停在历史节点上，`status()` 的「工作树相对 HEAD」与 `commit()` 的父节点
 *    选择就各自需要回答「相对哪个 HEAD」，而 v1 的调用方捕获型 CAS 全部建立在
 *    「工作树只与当前 HEAD 比」之上。本文件正面钉住：restore 之后 `headCommitId` 与
 *    `headRevision` **逐字节不变**。
 * 2. **restore 顺手把历史「回滚」掉。** 把目标 commit 之后的节点删掉确实能让物化状态
 *    等于目标——代价是用户唯一一份不可变记录没了，而 restore 恰恰是用户最可能手滑的入口。
 *    FR-013 的落点只有工作树；2.4 / 2.7 两张表一行都不动。
 * 3. **恢复结果落在一个「第三态」里。** 见 T100：恢复出来的就是普通 `WorkingTreeEntry`，
 *    与手写变更同表同形。本文件只钉最外层的那一条——恢复完之后工作树是**脏的**，
 *    而且脏在普通条目上，不在某张只有 restore 认识的影子表里。
 * 4. **会话只活在内存里。** 跨标签页与刷新之后，「这次恢复来自哪个 commit」必须还能问出来，
 *    否则 `status().conflicted` 就没有唯一来源（data-model.md §2.8 把这句写死了）。
 *    所以会话是一行库表，不是一个字段。
 *
 * **本文件不碰的三件事**：dirty 守卫（T099）、兼容性预检（T101）、CAS 与会话终态（T102）。
 * 这里的场景一律从 clean 工作树出发，且目标 commit 一律与当前客户端同 fingerprint。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import type { CommitConflict } from '../../working-tree/commit-conflict.js';
import {
  restoreWorkingTree,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult,
  type WorkingTreeRestoreTarget
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

/**
 * 造一个「两节点历史 + clean 工作树」的场景，HEAD 停在 {@link HEAD}。
 *
 * @remarks
 * 两个节点是这一组的最小规模：只有一个节点时 `HEAD~1` 不存在，而「恢复当前 HEAD」
 * 恒等于 no-op（那是 T103 的用例），两者都测不到「HEAD 不动」这句话。
 */
const sceneWithHistory = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2 });
  seedCommit(scene, OLDER);
  seedCommit(scene, HEAD, [OLDER]);
  return scene;
};

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeRestoreOptions> = {}
): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次恢复。 */
const restoreOnce = (
  scene: WorkingTreeScene,
  target: WorkingTreeRestoreTarget = { commitId: OLDER },
  overrides: Partial<WorkingTreeRestoreOptions> = {}
): Promise<WorkingTreeRestoreResult> =>
  restoreWorkingTree(scene.probe.executor, scene.context, target, credentialsOf(scene, overrides));

/** 取成功出口，拿到别的就直接炸，免得后续断言在 undefined 上继续。 */
const expectOk = (result: WorkingTreeRestoreResult): Extract<WorkingTreeRestoreResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次恢复成功，实际拿到：${JSON.stringify(result)}`);
  return result;
};

/** 取场景里当前的会话行。 */
const sessionRowsOf = (scene: WorkingTreeScene): WorkingTreeRestoreSession[] =>
  scene.probe.rowsOf(WorkingTreeRestoreSession) as WorkingTreeRestoreSession[];

describe('恢复写回工作树，而不是移动 HEAD（FR-013、硬裁决 5）', () => {
  it('目标 commit 的单元变成当前工作树里的未提交条目', async () => {
    const scene = sceneWithHistory();

    const result = expectOk(await restoreOnce(scene));

    // 恢复完之后工作树是脏的，而且脏在普通条目上——「恢复了但还没生效」这个中间态
    // 一旦存在，用户就必须回答「我看到的这一批要不要再确认一次」，而 v1 的 commit()
    // 提交的是**全部**未提交单元，没有第二个确认位可以给它。
    expect({ restored: result.restoredCount, entries: entryRowsOf(scene).length }).toEqual({
      restored: 1,
      entries: 1
    });
  });

  it('HEAD 一格都不动', async () => {
    const scene = sceneWithHistory();
    const before = { commitId: refRowOf(scene).headCommitId, revision: refRowOf(scene).headRevision };

    await restoreOnce(scene);

    // 硬裁决 5：没有 detached HEAD。HEAD 停在历史节点上之后，`status()` 的
    // 「相对 HEAD」与 `commit()` 的父节点选择就各自需要回答「相对哪个 HEAD」。
    expect({ commitId: refRowOf(scene).headCommitId, revision: refRowOf(scene).headRevision }).toEqual(before);
  });

  it('历史一行都不删', async () => {
    const scene = sceneWithHistory();
    const before = {
      commits: scene.probe.rowsOf(Commit).length,
      changeSets: scene.probe.rowsOf(CommitChangeSet).length
    };

    await restoreOnce(scene);

    // 「恢复 = 把后面的节点删掉」能让物化状态等于目标，代价是用户唯一一份不可变记录没了——
    // 而 restore 恰恰是最可能手滑的入口。2.4 / 2.7 两张表在 FR-013 里一行都不动。
    expect({
      commits: scene.probe.rowsOf(Commit).length,
      changeSets: scene.probe.rowsOf(CommitChangeSet).length
    }).toEqual(before);
  });

  it('工作树 revision 递增一格', async () => {
    const scene = sceneWithHistory();
    const before = stateRowOf(scene).workingTreeRevision;

    const result = expectOk(await restoreOnce(scene));

    // 恢复写了条目，就是一次真实的工作树变化；不递增的话，另一个 realm 手里那份
    // 捕获的 revision 仍然「有效」，它的 commit() 会连带提交自己从没见过的这一批。
    expect({ result: result.workingTreeRevision, row: stateRowOf(scene).workingTreeRevision }).toEqual({
      result: before + 1,
      row: before + 1
    });
  });
});

describe('会话是一行库表，不是一个内存字段（data-model.md §2.8）', () => {
  it('恢复成功写出恰好一行 active 会话，activeKey 取 branchId', async () => {
    const scene = sceneWithHistory();

    const result = expectOk(await restoreOnce(scene));
    const [session] = sessionRowsOf(scene);

    // `activeKey` 的唯一索引就是「一分支至多一个未结束会话」这句话的全部实现；
    // 非终态时它必须等于 branchId，否则两次 restore 可以并存，而 `status()`
    // 的 restoring / conflicted 两位读的是 `limit: 1` 的第一行——读到哪一行看运气。
    expect({
      rows: sessionRowsOf(scene).length,
      id: session.id,
      target: session.targetCommitId,
      status: session.status,
      activeKey: session.activeKey
    }).toEqual({
      rows: 1,
      id: result.sessionId,
      target: OLDER,
      status: 'active',
      activeKey: SCENE_BRANCH_ID
    });
  });

  it('会话捕获的是这次恢复落盘之后的两个 revision', async () => {
    const scene = sceneWithHistory();
    const before = {
      head: refRowOf(scene).headRevision,
      workingTree: stateRowOf(scene).workingTreeRevision
    };

    await restoreOnce(scene);
    const [session] = sessionRowsOf(scene);

    // 捕获的是「本次恢复完成的那一刻」，不是「恢复开始前」：`status.ts` › `readRestoreBits`
    // 拿这两个数与**当前值**比，相等即 restoring、不等即 conflicted。恢复自己把
    // `workingTreeRevision` 推了一格，捕获恢复前的值等于让会话一出生就与当前值不等——
    // 那与 T102 里「另一个 Tab 写了一次」的场景逐字节相同，于是 conflicted 恒为 true。
    //
    // 这不是「捕获什么都行」：值仍然是逐个钉死的，head 不动、workingTree 恰好 +1。
    // 相等只维持到下一个 writer 推进 revision 为止，而那正是 conflicted 要抓的那一刻。
    expect({ head: session.expectedHeadRevision, workingTree: session.expectedWorkingTreeRevision }).toEqual({
      ...before,
      workingTree: before.workingTree + 1
    });
  });

  it('恢复之后 status() 报 restoring，且不报 conflicted', async () => {
    const scene = sceneWithHistory();

    await restoreOnce(scene);
    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 两位而不是一位：压成一位之后「恢复进行到一半」与「恢复撞上了别人的写」
    // 在界面上长得一模一样，而前者该继续、后者该停下。
    expect({ restoring: status.restoring, conflicted: status.conflicted, clean: status.clean }).toEqual({
      restoring: true,
      conflicted: false,
      clean: false
    });
  });

  it('restoreSession() 在没有会话时给 null，而不是抛错', async () => {
    const scene = sceneWithHistory();

    // 「还没恢复过」是最常见的状态，不是异常；抛错的话每个调用点都要包 try。
    await expect(scene.manager.restoreSession()).resolves.toBeNull();
  });
});

describe('签名里没有 checkout，也没有 detached HEAD（硬裁决 5、contracts/core-api.md §5）', () => {
  it('WorkingTreeRestoreTarget 的键集恰好是 commitId 与可选的 entities', () => {
    // 键集而不是点名：点名只挡得住 detach / checkout 这几个想得到的名字。
    // 这两个之外的任何一个键，都是在问「恢复到哪之后 HEAD 去哪」——而 v1 的答案
    // 恒为「HEAD 不动」，这个问题因此没有入参可以承载。
    expectTypeOf<keyof WorkingTreeRestoreTarget>().toEqualTypeOf<'commitId' | 'entities'>();
  });

  it('WorkingTreeRestoreOptions 的键集恰好是三个捕获位', () => {
    expectTypeOf<keyof WorkingTreeRestoreOptions>().toEqualTypeOf<
      'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision'
    >();
  });

  it('凭据是必填的末位参，不是可选的便利入参', () => {
    // 可选末参等于允许「缺省时由本次调用内部读取 revision」——内部读到的值恒等于
    // 当前值，CAS 于是永远命中。
    expectTypeOf<Parameters<typeof restoreWorkingTree>['length']>().toEqualTypeOf<4>();
    expectTypeOf<Parameters<typeof restoreWorkingTree>[3]>().toEqualTypeOf<WorkingTreeRestoreOptions>();
  });

  it('门面上没有 checkout，也没有任何能停在历史节点上的入口', () => {
    const scene = createWorkingTreeScene();

    // `listCommits()` 返回的是数据，不是可切换的位置。这一条用 in 而不是类型断言：
    // 将来有人加了 `checkout()` 的实现却忘了改类型，类型断言照样绿。
    expect({
      checkout: 'checkout' in scene.manager,
      detach: 'detach' in scene.manager,
      restore: typeof scene.manager.restore
    }).toEqual({ checkout: false, detach: false, restore: 'function' });
  });

  it('门面上的 restore() 收目标与可选项两个位置参数', () => {
    const scene = createWorkingTreeScene();

    // 门面这一层把三个捕获位自己捕获掉（见 working-tree-facade.ts 的 runEnabled），
    // 所以对外只剩契约 §5 的那两个参数。
    expect(scene.manager.restore).toHaveLength(2);
  });
});

describe('冲突出口与 discard 同形（FR-031）', () => {
  it('失败出口靠 reason 判别，而不是靠「哪个字段在」', async () => {
    const scene = sceneWithHistory();

    const result = await restoreOnce(scene, { commitId: OLDER }, { expectedWorkingTreeRevision: 99 });

    // restore 的失败出口不止一种（CAS 冲突、dirty 工作树、schema 不兼容），而 discard 只有一种。
    // 靠「有没有 conflict 字段」来分辨的话，每加一个失败原因，所有旧调用点的 else 分支
    // 都会静默地把新原因当成旧原因处理——判别式把这件事变成一个编译错误。
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.reason).toBe('string');
  });

  it('捕获的工作树 revision 对不上时返回冲突，且一个字节都没落地', async () => {
    const scene = sceneWithHistory();

    const result = await restoreOnce(scene, { commitId: OLDER }, { expectedWorkingTreeRevision: 99 });

    if (result.ok) throw new Error('期望这次恢复返回冲突，实际成功了');
    if (result.reason !== 'conflict') throw new Error(`期望 reason=conflict，实际 ${result.reason}`);
    const conflict: CommitConflict = result.conflict;
    expect({
      kind: conflict.kind,
      expected: conflict.expected,
      entries: entryRowsOf(scene).length,
      sessions: sessionRowsOf(scene).length
    }).toEqual({ kind: 'working_tree_revision', expected: 99, entries: 0, sessions: 0 });
  });
});
