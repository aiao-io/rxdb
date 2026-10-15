/**
 * @fileoverview T107 红测试：恢复会话的**终态转换**——`commit()` 与会话的 `committed`
 * 转换原子提交，`discard()` 对称地把会话与恢复产生的条目一并清除，而新 commit
 * **不改写**被恢复的历史节点（FR-015、US-307 AC4/AC5、data-model.md §2.8）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-session-transitions.ts`，以及它在
 * `commit-command.ts` › `finishCommit` 与 `discard-command.ts` 上的两个接线点。
 *
 * 会话是一行**库表**，不是一个内存标记（data-model.md §2.8）。于是「恢复结束了」这件事
 * 必须自己落一次盘，而落盘的时机只有一个正确答案：与结束它的那次写入同一个事务。
 * 四种退化写法各自对应一种在真实使用里看得见的坏账：
 *
 * 1. **提交成功了，会话还留在 `active`。** 它占住 `activeKey` 的唯一索引，下一次 restore
 *    直接撞唯一约束；更早一步，`status()` 会立刻把 `conflicted` 亮起来——因为提交刚刚
 *    推进了两个 revision，而会话捕获的还是提交前那一对（`status.ts` › `readRestoreBits`
 *    比的正是这两个数）。用户看到的是「我刚提交成功，然后它说我冲突了」。
 * 2. **会话在提交之外单独结束。** 「先提交、再发一条 UPDATE 收尾」在单机顺利路径上看不出
 *    区别，直到收尾那条失败或进程在两者之间退出——留下的正是第 1 条那个状态，而这一次
 *    没有任何入口会再去修它。
 * 3. **`status` 与 `activeKey` 分两条语句改。** 两者中间那一刻，库里要么是「已 committed
 *    但仍占着 activeKey」，要么是「还 active 却已经让出唯一键」——前者挡住下一次 restore，
 *    后者让两个会话同时活着。两列必须在**同一条** UPDATE 里走，与
 *    `working-tree-state-sql.ts` 对 `workingTreeRevision` / `entryCount` 的要求同一条理由。
 * 4. **discard 把会话也标成 `committed`。** 那是一句假话：什么都没提交。US-307
 *    「discard 成功后删除 session」给的是删除，而不是第四种状态——状态枚举里没有
 *    `discarded`，硬塞进 `committed` 会让「这个分支上提交过几次恢复」永远数不对。
 *
 * **本文件不碰的两件事**：初次 restore 的 CAS 与会话创建（T102，`restore-session-cas.spec.ts`），
 * 以及恢复条目的字段形状（T100，`restore-entry-shape.spec.ts`）。这里一律从「会话已经存在」
 * 出发，只盯它怎么结束。
 */

import { getEntityColumnName, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from '../../working-tree/commit-command.js';
import { discardWorkingTree, type WorkingTreeDiscardResult } from '../../working-tree/discard-command.js';
import { readActiveRestoreSession, restoreWorkingTree } from '../../working-tree/restore-command.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import { normalizeSql, setClauseOf } from '../commit/fixtures/commit-graph-probe.js';
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

/** 恢复目标：`HEAD~1` 那一个。 */
const OLDER = 'commit-older';

/** 当前 HEAD。 */
const HEAD = 'commit-head';

/** 本组用例共用的操作 id；幂等重放那一支要靠它复用同一个键。 */
const OPERATION_ID = 'op-restore-commit';

/** 两节点历史 + clean 工作树。 */
const sceneWithHistory = (options: WorkingTreeSceneOptions = {}): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 2, ...options });
  seedCommit(scene, OLDER);
  seedCommit(scene, HEAD, [OLDER]);
  return scene;
};

/** 当前分支上的会话行。 */
const sessionRowsOf = (scene: WorkingTreeScene): WorkingTreeRestoreSession[] =>
  scene.probe.rowsOf(WorkingTreeRestoreSession) as WorkingTreeRestoreSession[];

/** 跑一次真恢复：产出条目 + 一行 `active` 会话。 */
const restoreOnce = (scene: WorkingTreeScene): Promise<unknown> =>
  restoreWorkingTree(
    scene.probe.executor,
    scene.context,
    { commitId: OLDER },
    {
      expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
      expectedHeadRevision: refRowOf(scene).headRevision,
      expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
    }
  );

/**
 * 造一个「会话已经存在」的场景，但**不经过** `restoreWorkingTree()`。
 *
 * @remarks
 * `rowsAffected: 0` 的那一支必须用它：那个拨钮会让 restore 自己的 CAS 先失败，
 * 于是想测的 commit 路径一次都跑不到。
 */
const sceneWithSeededSession = (options: WorkingTreeSceneOptions = {}): WorkingTreeScene => {
  const scene = sceneWithHistory(options);
  scene.addEntry();
  scene.addRestoreSession({
    targetCommitId: OLDER,
    expectedHeadRevision: refRowOf(scene).headRevision,
    expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
    status: 'active'
  });
  return scene;
};

/** 用当前行上的真实值当捕获位，跑一次提交。 */
const commitOnce = (
  scene: WorkingTreeScene,
  message = '提交恢复结果',
  overrides: Partial<CommitOptions> = {}
): Promise<CommitResult> =>
  commitWorkingTree(scene.probe.executor, scene.context, message, {
    authorId: 'alice',
    operationId: OPERATION_ID,
    expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
    expectedHeadRevision: refRowOf(scene).headRevision,
    expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
    ...overrides
  });

/** 用当前行上的真实值当捕获位，跑一次丢弃。 */
const discardOnce = (
  scene: WorkingTreeScene,
  overrides: Partial<{ expectedWorkingTreeRevision: number }> = {}
): Promise<WorkingTreeDiscardResult> =>
  discardWorkingTree(scene.probe.executor, {
    expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
    expectedHeadRevision: refRowOf(scene).headRevision,
    expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
    ...overrides
  });

/** 拿到失败出口就直接炸，免得后续断言在一个没发生的转换上继续。 */
const expectOk = <T extends { ok: boolean }>(result: T): T => {
  if (!result.ok) throw new Error(`期望这次操作成功，实际拿到：${JSON.stringify(result)}`);
  return result;
};

/** 打在某张表上的 UPDATE 语句。 */
const updatesAgainst = (scene: WorkingTreeScene, tableName: string): string[] =>
  scene.probe.statements
    .map(normalizeSql)
    .filter(sql => sql.startsWith('update') && new RegExp(`\\b${tableName}\\b`).test(sql));

/** 会话表上的 UPDATE。 */
const sessionUpdatesOf = (scene: WorkingTreeScene): string[] =>
  updatesAgainst(scene, getEntityMetadata(WorkingTreeRestoreSession).tableName);

/** 取会话表某个字段的真实列名（小写，便于与归一化后的 SQL 比）。 */
const sessionColumn = (field: string): string => {
  const columnName = getEntityColumnName(getEntityMetadata(WorkingTreeRestoreSession), field);
  if (!columnName) throw new Error(`WorkingTreeRestoreSession 元数据里没有 '${field}' 对应的列`);
  return columnName.toLowerCase();
};

/** 把历史两张表拍成可比对的字符串快照。 */
const historySnapshotOf = (scene: WorkingTreeScene): string =>
  JSON.stringify({
    commits: scene.probe.rowsOf(Commit),
    changeSets: scene.probe.rowsOf(CommitChangeSet)
  });

/** 只挑目标那一个节点与它的变更集。 */
const targetNodeSnapshotOf = (scene: WorkingTreeScene): string =>
  JSON.stringify({
    commit: (scene.probe.rowsOf(Commit) as Commit[]).filter(row => row.id === OLDER),
    changeSets: (scene.probe.rowsOf(CommitChangeSet) as CommitChangeSet[]).filter(row => row.commitId === OLDER)
  });

describe('commit 把会话推进终态，且与提交同一次写入（FR-015、US-307 AC4）', () => {
  it('提交成功后会话转成 committed 并让出 activeKey', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);

    expectOk(await commitOnce(scene));

    // 留在 active 的会话会立刻让 `status()` 亮起 conflicted——提交刚刚推进了两个
    // revision，而会话捕获的还是提交前那一对。用户看到的是「我刚提交成功，然后它说我冲突了」。
    const [session] = sessionRowsOf(scene);
    expect({ status: session.status, activeKey: session.activeKey }).toEqual({
      status: 'committed',
      activeKey: null
    });
  });

  it('会话表上只发一条 UPDATE，且它同时改 status 与 activeKey', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);

    expectOk(await commitOnce(scene));

    // 拆成两条就等于承认「中间那一刻它们可以不一致」：要么已 committed 却还占着唯一键
    // （挡住下一次 restore），要么还 active 却已经让出唯一键（两个会话同时活着）。
    const updates = sessionUpdatesOf(scene);
    const setClause = setClauseOf(updates[0] ?? '');
    expect({
      count: updates.length,
      status: setClause.includes(sessionColumn('status')),
      activeKey: setClause.includes(sessionColumn('activeKey'))
    }).toEqual({ count: 1, status: true, activeKey: true });
  });

  it('提交之后 restoring / conflicted 两位都灭，restoreSession() 也读不到会话', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);

    expectOk(await commitOnce(scene));
    const status = await readWorkingTreeStatus(scene.probe.executor);
    const active = await readActiveRestoreSession(scene.probe.executor, SCENE_BRANCH_ID);

    // 终态行必须从「active 会话」的口径里彻底退出去：`readRestoreBits` 与
    // `readActiveRestoreSession` 认的都是 `activeKey` 非空，只改 `status` 一列救不了。
    expect({ restoring: status.restoring, conflicted: status.conflicted, active }).toEqual({
      restoring: false,
      conflicted: false,
      active: null
    });
  });

  it('本来就没有会话时，一条会话语句都不发', async () => {
    const scene = sceneWithHistory();
    scene.addEntry();

    expectOk(await commitOnce(scene));

    // 「反正 WHERE 匹配不到，无脑发一条」把每一次普通提交都加上一次不必要的往返，
    // 而普通提交才是绝大多数。会话在不在，读一次就知道——那一次读本来就要做，
    // 内存里的行得跟着一起改。
    expect(sessionUpdatesOf(scene)).toEqual([]);
  });

  it('提交的 CAS 没命中时，会话一个字都不动', async () => {
    // `rowsAffected: 0` 让 ref 上那条 CAS 落空，`writeCommit` 回 head_revision_conflict。
    const scene = sceneWithSeededSession({ rowsAffected: 0 });
    const before = sessionRowsOf(scene).map(row => ({ status: row.status, activeKey: row.activeKey }));

    const result = await commitOnce(scene);

    // 会话的终态转换必须排在「提交确实落库了」之后。反过来先结束会话再写 commit，
    // CAS 落空时留下的是一个指向从未发生过的提交的终态会话，而恢复结果还在工作树里。
    expect(result.ok).toBe(false);
    expect({
      sessions: sessionRowsOf(scene).map(row => ({ status: row.status, activeKey: row.activeKey })),
      updates: sessionUpdatesOf(scene)
    }).toEqual({ sessions: before, updates: [] });
  });

  it('幂等重放（reused）不清条目、不推 revision，也不结束会话', async () => {
    const scene = sceneWithHistory();
    scene.addEntry();
    const entries = [...entryRowsOf(scene)];
    expectOk(await commitOnce(scene, '第一次'));

    // 同一批条目、同一个 operationId 再来一次——`writeCommit` 认出重放，回 reused。
    scene.probe.seed(WorkingTreeEntry, entries);
    stateRowOf(scene).entryCount = entries.length;
    const session = scene.addRestoreSession({
      targetCommitId: OLDER,
      expectedHeadRevision: refRowOf(scene).headRevision,
      expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
      status: 'active'
    });
    const revisionBefore = stateRowOf(scene).workingTreeRevision;

    expectOk(await commitOnce(scene, '第一次'));

    // reused 说的是「这次调用什么都没写」。顺手把会话结束掉的话，结束它的是一次
    // 并未发生的状态转移——而真正结束它的那次提交早已在自己的事务里做过这件事。
    expect({
      status: session.status,
      activeKey: session.activeKey,
      entries: entryRowsOf(scene).length,
      revision: stateRowOf(scene).workingTreeRevision
    }).toEqual({
      status: 'active',
      activeKey: SCENE_BRANCH_ID,
      entries: entries.length,
      revision: revisionBefore
    });
  });
});

describe('新 commit 只追加，不改写被恢复的历史节点（FR-015）', () => {
  it('目标节点与它的变更集逐字段不变', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);
    const before = targetNodeSnapshotOf(scene);

    expectOk(await commitOnce(scene));

    // 「恢复之后提交」在 git 的肌肉记忆里接近 amend / revert 重写，而 v1 的历史是只追加的：
    // 被恢复的那个节点是用户唯一一份原始记录，改写它等于让这次恢复无法再复现。
    expect(targetNodeSnapshotOf(scene)).toBe(before);
  });

  it('新节点挂在当前 HEAD 之后，而不是挂在被恢复的节点之后', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);
    const commitsBefore = scene.probe.rowsOf(Commit).length;

    const result = expectOk(await commitOnce(scene));
    const created = (scene.probe.rowsOf(Commit) as Commit[]).find(
      row => row.id === (result as Extract<CommitResult, { ok: true }>).commitId
    );

    // 以目标节点为父，等于把它之后的历史整段旁置——`listCommits()` 的父链会绕开
    // 那一段，而那段历史一行都没删。恢复的落点只有工作树（FR-013）。
    expect({ total: scene.probe.rowsOf(Commit).length, parents: created?.parentIds }).toEqual({
      total: commitsBefore + 1,
      parents: [HEAD]
    });
  });
});

describe('discard 对称：会话与恢复产生的条目一并清除（US-307 AC5）', () => {
  it('丢弃成功后会话整行消失，条目也清空', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);

    expectOk(await discardOnce(scene));

    // 删除而不是第四种状态：状态枚举里没有 `discarded`，硬塞进 `committed` 是一句假话——
    // 什么都没提交，而「这个分支上提交过几次恢复」从此永远数不对。
    expect({ sessions: sessionRowsOf(scene).length, entries: entryRowsOf(scene).length }).toEqual({
      sessions: 0,
      entries: 0
    });
  });

  it('丢弃之后 restoring / conflicted 两位都灭', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);

    expectOk(await discardOnce(scene));
    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 会话留着的话，丢弃刚刚推进了 workingTreeRevision，于是 `readRestoreBits` 立刻
    // 派生出 conflicted——用户刚亲手丢掉全部改动，却被告知有冲突要处理。
    expect({ restoring: status.restoring, conflicted: status.conflicted }).toEqual({
      restoring: false,
      conflicted: false
    });
  });

  it('丢弃的 CAS 没命中时，会话与条目都原样留着（FR-034）', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);
    const before = { sessions: sessionRowsOf(scene).length, entries: entryRowsOf(scene).length };

    const result = await discardOnce(scene, { expectedWorkingTreeRevision: 99 });

    // 「反正用户是要丢弃，冲突就顺手丢干净」抹掉的是**别人**在这中间写进来的那一批。
    expect(result.ok).toBe(false);
    expect({ sessions: sessionRowsOf(scene).length, entries: entryRowsOf(scene).length }).toEqual(before);
  });

  it('丢弃一行历史都不动', async () => {
    const scene = sceneWithHistory();
    await restoreOnce(scene);
    const before = historySnapshotOf(scene);

    expectOk(await discardOnce(scene));

    // discard 不是 `reset --hard HEAD~1`：它的落点只有工作树（FR-016）。
    expect(historySnapshotOf(scene)).toBe(before);
  });
});
