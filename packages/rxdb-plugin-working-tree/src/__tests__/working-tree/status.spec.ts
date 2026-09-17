/**
 * @fileoverview T069 红测试：`status()` 的四种状态、常数时间摘要，以及
 * `conflicted` 的**唯一**来源（FR-004，data-model.md §2.6/§2.8）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/status.ts` 与门面上的 `status()`。
 *
 * 这一组断言真正防的是三件事：
 *
 * 1. **四种状态被压成两种**。契约里的 `WorkingTreeStatus` 只有一个 `conflicted: boolean`
 *    时，「恢复中」与「有未提交变更」在返回值上一模一样——界面没法在恢复进行到一半时
 *    拦住用户点提交。所以这里要求 `restoring` 与 `conflicted` 是**两位**，而不是一位。
 * 2. **`conflicted` 长出第二个来源**。`CommitConflict` 是一次性返回值，**不入库**
 *    （contracts/core-api.md §4.1）。哪天有人「顺手」把上一次 CAS 失败记在某处再喂给
 *    `status()`，库里就有了两份互相漂移的冲突真相，而其中一份没有任何人负责清。
 *    本文件因此正面断言：一次失败的 CAS 之后再 `status()`，`conflicted` 仍是 `false`。
 * 3. **`status()` 退化成 `COUNT(*)`**。`entryCount` 冗余列存在的全部理由就是让
 *    「有没有未提交变更」走常数时间（SC-001 的 100 ms 绝对上限）。一旦实现改成扫表，
 *    这条性能预算在单测里不会红——所以这里断言的是**发出去的查询形状**：干净分支上
 *    一条针对条目表的查询都不该有。
 */

import { describe, expect, it } from 'vitest';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { commitWorkingTree } from '../../working-tree/commit-command.js';
import {
  assertWorkingTreeEntryCountIntact,
  readWorkingTreeStatus,
  WorkingTreeEntryCountMismatchError,
  type WorkingTreeStatus
} from '../../working-tree/status.js';
import { createWorkingTreeScene, SCENE_BRANCH_ID, stateRowOf } from './fixtures/working-tree-scene.js';

/** 直接跑 `readWorkingTreeStatus()`，绕开门面只为少一层事务桩。 */
const statusOf = (scene: ReturnType<typeof createWorkingTreeScene>): Promise<WorkingTreeStatus> =>
  readWorkingTreeStatus(scene.probe.executor);

describe('status() 的四种状态（FR-004）', () => {
  it('clean：没有条目时 clean 为 true，其余三位全 false', async () => {
    const scene = createWorkingTreeScene();

    const status = await statusOf(scene);

    expect({
      branchId: status.branchId,
      entryCount: status.entryCount,
      clean: status.clean,
      restoring: status.restoring,
      conflicted: status.conflicted
    }).toEqual({ branchId: SCENE_BRANCH_ID, entryCount: 0, clean: true, restoring: false, conflicted: false });
  });

  it('有未提交变更：clean 翻假，条目数取自冗余列', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    const status = await statusOf(scene);

    expect({ clean: status.clean, entryCount: status.entryCount, restoring: status.restoring }).toEqual({
      clean: false,
      entryCount: 2,
      restoring: false
    });
  });

  it('恢复中：有未结束的恢复会话且捕获的 revision 仍对得上', async () => {
    const scene = createWorkingTreeScene({ headRevision: 3, workingTreeRevision: 7 });
    scene.addRestoreSession({
      targetCommitId: 'commit-a',
      expectedHeadRevision: 3,
      expectedWorkingTreeRevision: 7,
      status: 'active'
    });

    const status = await statusOf(scene);

    // 恢复中 ≠ 冲突：revision 还没分叉，这次恢复仍然可以继续走完。
    expect({ restoring: status.restoring, conflicted: status.conflicted }).toEqual({
      restoring: true,
      conflicted: false
    });
  });

  it('冲突：恢复会话仍在，但它捕获的 workingTreeRevision 已经分叉', async () => {
    const scene = createWorkingTreeScene({ headRevision: 3, workingTreeRevision: 9 });
    scene.addRestoreSession({
      targetCommitId: 'commit-a',
      expectedHeadRevision: 3,
      expectedWorkingTreeRevision: 7,
      status: 'active'
    });

    const status = await statusOf(scene);

    expect({ restoring: status.restoring, conflicted: status.conflicted }).toEqual({
      restoring: false,
      conflicted: true
    });
  });

  it('冲突：恢复会话捕获的 headRevision 已经分叉', async () => {
    const scene = createWorkingTreeScene({ headRevision: 5, workingTreeRevision: 7 });
    scene.addRestoreSession({
      targetCommitId: 'commit-a',
      expectedHeadRevision: 3,
      expectedWorkingTreeRevision: 7,
      status: 'active'
    });

    const status = await statusOf(scene);

    expect(status.conflicted).toBe(true);
  });

  it('已结束的恢复会话不算数：activeKey 为 null 的行既不 restoring 也不 conflicted', async () => {
    const scene = createWorkingTreeScene({ headRevision: 5, workingTreeRevision: 9 });
    // 这一行的两个 expected 都已经对不上了，但它是终态；终态还算数的话，
    // 一个分支的历史里只要有过一次恢复，此后它永远显示冲突。
    scene.addRestoreSession({
      targetCommitId: 'commit-a',
      expectedHeadRevision: 3,
      expectedWorkingTreeRevision: 7,
      status: 'committed'
    });

    const status = await statusOf(scene);

    expect({ restoring: status.restoring, conflicted: status.conflicted }).toEqual({
      restoring: false,
      conflicted: false
    });
  });
});

describe('conflicted 只由恢复会话重建，CAS 失败不留痕（contracts/core-api.md §4.1）', () => {
  it('commit() 的 CAS 失败只返回一次性 CommitConflict，不写任何持久冲突态', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 4 });
    scene.addEntry();

    const result = await commitWorkingTree(scene.probe.executor, scene.context, '提交我看过的东西', {
      authorId: 'alice',
      operationId: 'op-stale',
      expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
      expectedHeadRevision: 2,
      // 另一个 Tab 在 status 与 commit 之间 save() 过：这里拿的是过期值。
      expectedWorkingTreeRevision: 3
    });

    expect(result.ok).toBe(false);

    const status = await statusOf(scene);
    // 「上一次提交失败了」不是这个库的状态，是那一次调用的返回值。存下来的话，
    // 没有任何人负责清它，而契约明确说不需要「清除冲突」的 API。
    expect({ conflicted: status.conflicted, restoring: status.conflicted }).toEqual({
      conflicted: false,
      restoring: false
    });
  });

  it('CAS 失败后 workingTreeRevision 一格都没动', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 4 });
    scene.addEntry();

    await commitWorkingTree(scene.probe.executor, scene.context, '提交', {
      authorId: 'alice',
      operationId: 'op-stale-2',
      expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
      expectedHeadRevision: 0,
      expectedWorkingTreeRevision: 3
    });

    expect(stateRowOf(scene).workingTreeRevision).toBe(4);
  });
});

describe('status() 走常数时间摘要（SC-001）', () => {
  it('干净分支上一条针对条目表的查询都不发', async () => {
    const scene = createWorkingTreeScene();

    await statusOf(scene);

    const entryQueries = scene.probe.finds.filter(call => call.entity === 'WorkingTreeEntry');
    // 扫表在单测里不会因为慢而变红，只会因为「多发了一条查询」而变红——
    // 所以这里断言的是查询形状本身。
    expect(entryQueries).toEqual([]);
  });

  it('条目数取自冗余列而不是 COUNT(*)：把冗余列改大，status() 就跟着报大', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    stateRowOf(scene).entryCount = 41;

    const status = await statusOf(scene);

    // 这条用例故意造一个不自洽的库：它证明 status() 读的是哪一列。
    // 真库里的自洽由 assertWorkingTreeEntryCountIntact() 守（见下一组）。
    expect(status.entryCount).toBe(41);
  });

  it('byOrigin 在干净分支上直接短路成两个 0，不发聚合查询', async () => {
    const scene = createWorkingTreeScene();

    const status = await statusOf(scene);

    expect(status.byOrigin).toEqual({ local: 0, remote_sync: 0 });
    expect(scene.probe.finds.filter(call => call.entity === 'WorkingTreeEntry')).toEqual([]);
  });

  it('byOrigin 在有条目时按来源分组——remote_sync 不豁免（硬裁决 6）', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ origin: 'local' });
    scene.addEntry({ origin: 'remote_sync' });
    scene.addEntry({ origin: 'remote_sync' });

    const status = await statusOf(scene);

    // 远端同步写进来的变更照样弄脏工作树。把它从 status() 里摘掉，
    // 用户会看到一个自称干净、却在 commit 时提交了三个单元的分支。
    expect(status.byOrigin).toEqual({ local: 1, remote_sync: 2 });
    expect(status.clean).toBe(false);
  });
});

describe('entryCount 与实际行数的不变量（data-model.md §2.6）', () => {
  it('一致时静默通过', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    await expect(assertWorkingTreeEntryCountIntact(scene.probe.executor, SCENE_BRANCH_ID)).resolves.toBeUndefined();
  });

  it('冗余列比实际行数大时抛 WorkingTreeEntryCountMismatchError', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    stateRowOf(scene).entryCount = 5;

    const error = await assertWorkingTreeEntryCountIntact(scene.probe.executor, SCENE_BRANCH_ID).then(
      () => null,
      (caught: unknown) => caught
    );

    // 不发明第十个 CommitErrorCode：core-api.md §7 那张表是封闭的，而这条不是
    // 命令的失败出口，是「库里两份真相对不上」的现场——与 cold-replay 的
    // WorkingTreeReplayCorruptionError 同类，判别位给 name 与三个事实字段。
    expect(error).toBeInstanceOf(WorkingTreeEntryCountMismatchError);
    expect({
      name: (error as Error).name,
      branchId: (error as { branchId?: unknown }).branchId,
      expected: (error as { expected?: unknown }).expected,
      actual: (error as { actual?: unknown }).actual
    }).toEqual({
      name: 'WorkingTreeEntryCountMismatchError',
      branchId: SCENE_BRANCH_ID,
      expected: 5,
      actual: 1
    });
  });

  it('冗余列比实际行数小时同样抛——两个方向都是第二份真相', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();
    stateRowOf(scene).entryCount = 1;

    await expect(assertWorkingTreeEntryCountIntact(scene.probe.executor, SCENE_BRANCH_ID)).rejects.toBeInstanceOf(
      WorkingTreeEntryCountMismatchError
    );
  });

  it('不变量断言只查本分支的条目', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry({ id: 'entry-foreign', branchId: 'feature-x' });

    // 不带 branchId 的话，另一条分支的未提交条目会把本分支的计数撑爆，
    // 而这条断言会在一个完全健康的库上开始误报。
    await expect(assertWorkingTreeEntryCountIntact(scene.probe.executor, SCENE_BRANCH_ID)).resolves.toBeUndefined();
  });
});

describe('门面上的 status()（contracts/core-api.md §3）', () => {
  it('零参调用，返回值与直接调 readWorkingTreeStatus() 一致', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 4 });
    scene.addEntry();

    const viaFacade = await scene.manager.status();

    expect(scene.manager.status).toHaveLength(0);
    expect(viaFacade).toEqual(await statusOf(scene));
  });

  it('带回 activationRevision，调用方据此能拼出完整的 ActiveBranchToken', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 6, headRevision: 2, workingTreeRevision: 4 });

    const status = await scene.manager.status();

    // 三个捕获位缺一不可：commit 的 CommitConflict.kind 是
    // 'working_tree_revision' | 'head_revision' | 'activation_revision'，
    // 少给一个，调用方就永远无法构造出不会撞 activation_revision 的那一次提交。
    expect({
      branchId: status.branchId,
      activationRevision: status.activationRevision,
      headRevision: status.headRevision,
      workingTreeRevision: status.workingTreeRevision
    }).toEqual({ branchId: SCENE_BRANCH_ID, activationRevision: 6, headRevision: 2, workingTreeRevision: 4 });
  });

  it('未启用的库上 status() 被门禁拒绝，而不是返回一个空的干净状态', async () => {
    const scene = createWorkingTreeScene();
    (scene.probe.rowsOf(CommitCapabilityState)[0] as CommitCapabilityState).enabled = false;

    const error = await scene.manager.status().then(
      () => null,
      (caught: unknown) => caught
    );

    // 返回 `entryCount: 0` 是把「这个库没开这功能」伪装成「这个库没有未提交变更」。
    expect((error as { code?: unknown }).code).toBe(CommitErrorCode.commit_capability_disabled);
  });
});
