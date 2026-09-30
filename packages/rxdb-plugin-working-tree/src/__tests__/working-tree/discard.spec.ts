/**
 * @fileoverview T075 红测试：`discardWorkingTree()` 把当前分支工作树整体回到当前 HEAD；
 * 已 clean 时是 no-op；同样校验三个捕获位（FR-016/031、data-model.md §5、场景 21）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/discard-command.ts` 与门面上的 `discard()`。
 *
 * 这一组防的是四件事：
 *
 * 1. **discard 长出 selection 入参。** 「只丢弃这几个单元」看起来比全量丢弃友好得多，
 *    而它正是硬裁决 1 在 discard 一侧的同一个口子：留下的那一半立刻成为残量，
 *    于是又需要 rebase 与依赖闭包。FR-016 把范围写死成「当前分支工作树**整体**」。
 * 2. **no-op 被实现成「照常走一遍」。** 干净工作树上 discard 若照样把 revision +1，
 *    另一个 realm 手里那份刚读到的 revision 就凭空作废了——它什么都没做，却让别人的
 *    commit 失败。data-model.md §5 脚注写死：**语义 no-op 一律不递增 revision，
 *    判定发生在写 2.6 之前**，不是写完再回滚。
 * 3. **no-op 顺带成了 CAS 的绕过口。** 「反正没东西可丢」听起来可以跳过校验，
 *    但「有没有东西可丢」这个判断本身读的就是可能已经被别人改过的那一行。
 *    所以本文件正面钉住顺序：**先比三个捕获位，再判 no-op**。
 * 4. **discard 顺手把 HEAD 也退一格。** discard 不是 reset --hard HEAD~1。
 *    FR-016 的落点是工作树，2.5 一列都不动，也不写任何提交历史。
 *
 * **一条被本文件明确划死的边界：v1 的 discard 只回滚「逻辑工作树」，不在本命令内重写业务投影。**
 * spec.md 的写入口语义矩阵把两件事分成两行——「restore/discard」那行说的是*写入或重算本地工作树*，
 * 「branch switch、baseline/restore **物化**」那行才是底层投影重写，而 discard **不在**后者里；
 * data-model.md §5 给 discard 列出的效果也恰好是三条簿记（`2.6 revision +1、删条目、entryCount 归零`）。
 * 物理上也走不通：投影重写只能经 `mergeChanges` / `switchBranch` 两个原语，而
 * `WorkingTreeCaptureRuntime.#requireEntrance()` 对没有意图声明的调用**直接拒绝**，
 * 而 `TRUSTED_CALLSITE_REGISTRY` 里没有 `discard-command.ts` 的登记行，`TrustedWriteIntent` 里
 * 也没有「丢弃」这一项——这个调用点没有可声明的意图。
 * 哪天 v1 改主意要在同一事务里连投影一起回滚，要同时改的是
 * epic-006「受信调用点登记表」、`TRUSTED_CALLSITE_REGISTRY`、`TrustedWriteIntent` 与 T055 的漂移用例——
 * 本文件那条 `mergeChanges` 断言就是逼着人去改那四处，而不是在这里偷偷加一句 `declareTrustedWrite()`。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { Commit } from '../../commit/commit.entity.js';
import type { CommitConflict } from '../../working-tree/commit-conflict.js';
import {
  discardWorkingTree,
  type WorkingTreeDiscardOptions,
  type WorkingTreeDiscardResult
} from '../../working-tree/discard-command.js';
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

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeDiscardOptions> = {}
): WorkingTreeDiscardOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次丢弃。 */
const discardOnce = (
  scene: WorkingTreeScene,
  overrides: Partial<WorkingTreeDiscardOptions> = {}
): Promise<WorkingTreeDiscardResult> => discardWorkingTree(scene.probe.executor, credentialsOf(scene, overrides));

/** 取成功出口，拿到别的就直接炸，免得后续断言在 undefined 上继续。 */
const expectOk = (result: WorkingTreeDiscardResult): Extract<WorkingTreeDiscardResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次丢弃成功，实际拿到冲突：${JSON.stringify(result.conflict)}`);
  return result;
};

/** 取冲突出口。 */
const expectConflict = (result: WorkingTreeDiscardResult): CommitConflict => {
  if (result.ok) throw new Error(`期望这次丢弃返回冲突，实际丢掉了 ${result.discardedCount} 个单元`);
  return result.conflict;
};

describe('范围是整棵工作树，签名里没有 selection（FR-016）', () => {
  it('WorkingTreeDiscardOptions 的键集恰好是三个捕获位', () => {
    // 键集而不是点名：点名只挡得住 units / entities / only 这几个想得到的名字。
    // 这三个之外的任何一个字段，要么是选择范围（硬裁决 1 的口子），要么是
    // authorId / operationId——而 discard **不写 commit**，给它作者与幂等键
    // 等于暗示库里会留下一条「某人丢弃过什么」的记录，那条记录不存在。
    expectTypeOf<keyof WorkingTreeDiscardOptions>().toEqualTypeOf<
      'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision'
    >();
  });

  it('凭据是必填的末位参，不是可选的便利入参', () => {
    // 元组长度恰好是 2：可选末参会让它变成 `1 | 2`，而「可选」等于允许
    // 「缺省时由本次调用内部读取 revision」——内部读到的值恒等于当前值，
    // CAS 于是永远命中，FR-031 对 discard 的那半句当场失效。
    expectTypeOf<Parameters<typeof discardWorkingTree>['length']>().toEqualTypeOf<2>();
    expectTypeOf<Parameters<typeof discardWorkingTree>[1]>().toEqualTypeOf<WorkingTreeDiscardOptions>();
  });

  it('门面上的 discard() 恰好收一个位置参数', () => {
    const scene = createWorkingTreeScene();

    expect(scene.manager.discard).toHaveLength(1);
  });

  it('三个单元一次全丢，不留残量', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-a' });
    scene.addEntry({ entityId: 'note-b' });
    scene.addEntry({ entityId: 'note-c' });

    const result = expectOk(await discardOnce(scene));

    // 留下任何一条都意味着此后需要回答「剩下的那条相对谁」——而 v1 只有
    // `HEAD ↔ 工作树` 一条 diff 轴，没有第二个参照物可以描述残量。
    expect({ discarded: result.discardedCount, left: entryRowsOf(scene).length }).toEqual({ discarded: 3, left: 0 });
  });

  it('WorkingTreeDiscardResult 的成功出口只有三个键', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });
    scene.addEntry();

    const result = expectOk(await discardOnce(scene));

    // 没有 `noop: boolean`：`discardedCount === 0` 就是 no-op，多一个布尔位
    // 就是第二份真相，而两份真相里迟早有一份是旧的。
    expect(Object.keys(result).sort()).toEqual(['discardedCount', 'ok', 'workingTreeRevision']);
  });
});

describe('脏工作树：条目清空、entryCount 归零、revision +1（data-model.md §5）', () => {
  it('条目行与冗余列一起归零', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    // 两者分家的那一刻，`status()` 的常数时间判据就开始撒谎：冗余列说还有两条，
    // 表里一条都没有，而 `status()` 只读冗余列。
    expect({ rows: entryRowsOf(scene).length, entryCount: stateRowOf(scene).entryCount }).toEqual({
      rows: 0,
      entryCount: 0
    });
  });

  it('workingTreeRevision 恰好推进一格，返回值与库里那一行一致', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    const result = expectOk(await discardOnce(scene));

    expect({ returned: result.workingTreeRevision, row: stateRowOf(scene).workingTreeRevision }).toEqual({
      returned: 6,
      row: 6
    });
  });

  it('丢弃之后 status() 报 clean', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ origin: 'local' });
    scene.addEntry({ origin: 'remote_sync' });

    expectOk(await discardOnce(scene));
    const status = await readWorkingTreeStatus(scene.probe.executor);

    // 远端同步写进来的单元照样被丢掉：`remote_sync` 不豁免（硬裁决 6）。
    // 按来源留一半的话，「整体回到 HEAD」就成了「回到 HEAD 加上远端那部分」。
    expect({ clean: status.clean, entryCount: status.entryCount, byOrigin: status.byOrigin }).toEqual({
      clean: true,
      entryCount: 0,
      byOrigin: { local: 0, remote_sync: 0 }
    });
  });

  it('HEAD 一列都不动——discard 不是 reset 到 HEAD~1', async () => {
    const scene = createWorkingTreeScene({ headRevision: 3, headCommitId: 'commit-head' });
    // HEAD 得真有一条 commit 行：discard 在动工前要过一遍提交图守卫（T084），
    // 只在 ref 上写个 id、历史里没有对应节点的场景会以 `commit_graph_corrupted` 拒绝，
    // 于是这条用例想盯的「HEAD 一列都不动」根本没跑到。
    seedCommit(scene, 'commit-head');
    scene.addEntry();

    expectOk(await discardOnce(scene));

    expect({
      headRevision: refRowOf(scene).headRevision,
      headCommitId: refRowOf(scene).headCommitId,
      baseHeadCommitId: stateRowOf(scene).baseHeadCommitId
    }).toEqual({ headRevision: 3, headCommitId: 'commit-head', baseHeadCommitId: 'commit-head' });
  });

  it('不写任何提交历史', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    // 「丢弃前先偷偷存一份」是最容易被当成贴心的那个设计：它让历史里出现用户
    // 从未提交过的节点，而每一个都推进了 headRevision。
    expect({ commits: scene.probe.rowsOf(Commit), changeSets: scene.probe.rowsOf(CommitChangeSet) }).toEqual({
      commits: [],
      changeSets: []
    });
  });

  it('只丢当前分支的条目，隔壁分支的未提交变更原样留着', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ entityId: 'note-mine' });
    scene.addEntry({ id: 'entry-foreign', branchId: 'feature-x', entityId: 'note-theirs' });

    const result = expectOk(await discardOnce(scene));

    // 不带 branchId 的 DELETE 在单分支的库上永远绿，在真实用户的库上一次就把
    // 另一条分支的工作成果抹掉——而那条分支此刻甚至不是 active，没人在看。
    const left = entryRowsOf(scene);
    expect({ discarded: result.discardedCount, leftIds: left.map(row => row.id) }).toEqual({
      discarded: 1,
      leftIds: ['entry-foreign']
    });
  });
});

describe('clean 时是 no-op：一格 revision 都不涨（data-model.md §5 脚注）', () => {
  it('干净工作树上返回 ok，discardedCount 为 0', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    const result = expectOk(await discardOnce(scene));

    // no-op 不是失败：调用方「让工作树回到 HEAD」这个诉求已经满足了。
    expect(result.discardedCount).toBe(0);
  });

  it('revision 不递增，返回的也是原值', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    const result = expectOk(await discardOnce(scene));

    // 平白 +1 会让另一个 realm 手里那份刚读到的 revision 凭空作废：
    // 这次 discard 什么都没做，却让别人的 commit 失败一次。
    expect({ returned: result.workingTreeRevision, row: stateRowOf(scene).workingTreeRevision }).toEqual({
      returned: 4,
      row: 4
    });
  });

  it('判定发生在写之前，不是写完再回滚：一条写语句都没发出去', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });

    expectOk(await discardOnce(scene));

    // 「先 +1 再发现没东西可丢、于是回滚」在单机上看不出区别，在一个把
    // revision 序列当水位线读的订阅端上是一次实打实的抖动。
    expect(scene.probe.saved).toEqual([]);
    expect(scene.probe.statements.filter(sql => /\b(update|delete)\b/i.test(sql))).toEqual([]);
  });

  it('连着丢两次：第二次是 no-op，revision 只涨了一格', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });
    scene.addEntry();

    expectOk(await discardOnce(scene));
    const second = expectOk(await discardOnce(scene));

    // 幂等性正来自「no-op 不递增」：否则重试一次失败的调用会让 revision
    // 走得比实际发生过的变更还快。
    expect({ discarded: second.discardedCount, revision: stateRowOf(scene).workingTreeRevision }).toEqual({
      discarded: 0,
      revision: 5
    });
  });
});

describe('三个捕获位同样要比，且比在 no-op 判定之前（FR-031/034）', () => {
  it('工作树 revision 不匹配 → working_tree_revision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    const conflict = expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    expect(conflict).toEqual({
      kind: 'working_tree_revision',
      expected: 4,
      actual: 5,
      branchId: SCENE_BRANCH_ID
    });
  });

  it('head revision 不匹配 → head_revision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2 });
    scene.addEntry();

    const conflict = expectConflict(await discardOnce(scene, { expectedHeadRevision: 1 }));

    // discard 不动 HEAD，所以「只比工作树那一个就够了」很像成立。它不成立：
    // 用户按下丢弃时看到的是「相对 HEAD 有这些改动」，HEAD 变了，
    // 他要丢的那份 diff 已经不是眼前这份了。
    expect(conflict).toEqual({ kind: 'head_revision', expected: 1, actual: 2, branchId: SCENE_BRANCH_ID });
  });

  it('activation revision 不匹配 → activation_revision', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 7 });
    scene.addEntry();

    const conflict = expectConflict(
      await discardOnce(scene, { expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 6 } })
    );

    expect(conflict).toEqual({ kind: 'activation_revision', expected: 6, actual: 7, branchId: SCENE_BRANCH_ID });
  });

  it('捕获的分支不是当前 active 分支 → activation_revision，且不落到那条分支上', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 3 });
    scene.addEntry();

    const conflict = expectConflict(
      await discardOnce(scene, { expectedBranch: { branchId: 'feature-x', activationRevision: 3 } })
    );

    // 事务内重新读一次 active 分支再把这次丢弃归过去，等于在用户以为自己站在
    // feature-x 上时抹掉 main 的工作树。
    expect(conflict.kind).toBe('activation_revision');
    expect(entryRowsOf(scene)).toHaveLength(1);
  });

  it('干净工作树上凭据过期，仍然是冲突而不是 no-op', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });

    const conflict = expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    // 这条是本组的重点：「反正没东西可丢」听起来可以跳过校验，可「有没有东西可丢」
    // 读的正是那一行可能已经被别人改过的状态——别人刚 commit 完，工作树确实空了，
    // 而调用方手里那份 revision 早就过期。先判 no-op 的实现在这里会返回成功，
    // 并让调用方以为自己丢掉的是他看过的那些改动。
    expect(conflict.kind).toBe('working_tree_revision');
  });

  it('冲突是返回值不是异常，且一个字节都不落地', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();
    scene.addEntry();

    const result = await discardOnce(scene, { expectedWorkingTreeRevision: 4 });

    expect(result.ok).toBe(false);
    expect({
      rows: entryRowsOf(scene).length,
      entryCount: stateRowOf(scene).entryCount,
      revision: stateRowOf(scene).workingTreeRevision,
      saved: scene.probe.saved
    }).toEqual({ rows: 2, entryCount: 2, revision: 5, saved: [] });
  });

  it('不自动重试：CAS 失败后不再发第二次写语句', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await discardOnce(scene, { expectedWorkingTreeRevision: 4 }));

    // 自动重试第二次读到的是**新**的 revision，于是必然成功——用户丢掉的
    // 是他没看过的那份工作树，而且不可撤销。
    expect(scene.probe.statements.filter(sql => /\b(update|delete)\b/i.test(sql))).toEqual([]);
  });
});

describe('v1 的 discard 只回滚逻辑工作树（spec.md 写入口语义矩阵）', () => {
  it('不经 mergeChanges 重写业务投影', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    // 见文件头：投影重写只能经 mergeChanges / switchBranch 两个原语，而这两个原语
    // 都要求调用点在 TRUSTED_CALLSITE_REGISTRY 里——discard-command.ts 没有登记行，
    // 意图枚举里也没有「丢弃」。
    // 要跨这条线，就得连同 epic-006「受信调用点登记表」、登记表、意图枚举与 T055 的漂移用例
    // 一起改；这条断言的作用是让那件事必须被显式做掉，而不是在这里加一句声明了事。
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
  });

  it('删的是工作树条目表，不是业务实体表', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await discardOnce(scene));

    const entryReads = scene.probe.finds.filter(call => call.entity === 'WorkingTreeEntry');
    expect(entryReads.length).toBeGreaterThan(0);
    expect(scene.probe.rowsOf(WorkingTreeEntry)).toEqual([]);
  });
});

describe('损坏分支上拒绝丢弃（FR-051、T084 的 discard 半边）', () => {
  it('分支已被标记 corrupted_read_only 时以 commit_graph_corrupted 拒绝', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'commit-head', headRevision: 1 });
    scene.addEntry();
    refRowOf(scene).status = 'corrupted_read_only';
    refRowOf(scene).corruptedAt = new Date('2026-01-02T00:00:00.000Z');

    const error = await discardOnce(scene).then(
      () => null,
      (caught: unknown) => caught
    );

    // 守卫用 T038 那一份，不在 discard 里另写判定：三入口拒绝码相同才让
    // 调用方有一个稳定的 catch 分支。
    expect((error as { code?: unknown }).code).toBe(CommitErrorCode.commit_graph_corrupted);
  });

  it('拒绝时保留原 ref、不删任何条目', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'commit-head', headRevision: 1 });
    scene.addEntry();
    scene.addEntry();
    refRowOf(scene).status = 'corrupted_read_only';
    refRowOf(scene).corruptedAt = new Date('2026-01-02T00:00:00.000Z');

    await discardOnce(scene).catch(() => undefined);

    // 「反正这个分支坏了，顺手清干净」会让用户在唯一还能导出诊断的时刻失去
    // 未提交的那部分数据。
    expect({
      rows: entryRowsOf(scene).length,
      headCommitId: refRowOf(scene).headCommitId,
      status: refRowOf(scene).status
    }).toEqual({ rows: 2, headCommitId: 'commit-head', status: 'corrupted_read_only' });
  });
});

describe('门面上的 discard()（contracts/core-api.md §3）', () => {
  it('返回值与直接调 discardWorkingTree() 一致', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 4 });
    scene.addEntry();

    const viaFacade = await scene.manager.discard(credentialsOf(scene));

    expect(viaFacade).toEqual({ ok: true, discardedCount: 1, workingTreeRevision: 5 });
  });

  it('未启用的库上零参调用被门禁拒绝，而不是先抱怨缺参数', async () => {
    const scene = createWorkingTreeScene();
    (scene.probe.rowsOf(CommitCapabilityState)[0] as CommitCapabilityState).enabled = false;

    const error = await (scene.manager.discard as () => Promise<unknown>)().then(
      () => null,
      (caught: unknown) => caught
    );

    // 参数校验必须写在 runEnabled() 的 run 回调里：写在外面的话，未启用的库
    // 会先回答「expectedBranch 不能为空」——一个在这个库上根本无从谈起的问题。
    expect((error as { code?: unknown }).code).toBe(CommitErrorCode.commit_capability_disabled);
  });
});
