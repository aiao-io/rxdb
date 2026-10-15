/**
 * @fileoverview T072 红测试：commit 校验 **三个** 调用方捕获的凭据——active branch token、
 * expected head revision、expected working tree revision——任一不匹配即全量回滚并返回
 * `CommitConflict`（FR-031、SC-008、conformance-suites.md §2.3）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/commit-command.ts` 与 `src/working-tree/commit-conflict.ts`。
 *
 * 这一组防的是**同一个退化的三种写法**：
 *
 * 1. 只校验 head revision。commit 推进的是 HEAD，所以「只比 head」看起来足够。可它测不到
 *    另一个 Tab 在 `status()` 与 `commit()` 之间做的那一次 `save()`——那次 `save()` 只动
 *    工作树、不动 HEAD。用户于是提交了他没看过的变更（SC-008 点名的正是这条）。
 * 2. 期望值缺省时「由本次调用内部读取」。内部读到的恒等于当前值，CAS 永远命中。
 *    这比不校验更糟：它看起来校验过了。
 * 3. 冲突时抛异常 / 自动重试一次。契约 §4.1 两条都禁止：`CommitConflict` 是**返回值**，
 *    而自动重试等于提交调用方没看过的变更。
 *
 * `CommitConflict.kind` 的三个取值不是描述性文案，它是**三个必须各自存在的比较**的证据。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { COMMIT_ERROR_CODES } from '../../commit/commit-error-codes.js';
import { Commit } from '../../commit/commit.entity.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from '../../working-tree/commit-command.js';
import type { CommitConflict, CommitConflictKind } from '../../working-tree/commit-conflict.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 与场景初值完全对得上的一组凭据。 */
const credentialsOf = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): CommitOptions => ({
  authorId: 'alice',
  operationId: 'op-cas',
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

const commitWith = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): Promise<CommitResult> =>
  commitWorkingTree(scene.probe.executor, scene.context, '提交我看过的东西', credentialsOf(scene, overrides));

/** 取冲突出口。 */
const expectConflict = (result: CommitResult): CommitConflict => {
  if (result.ok) throw new Error(`期望这次提交返回冲突，实际提交成功：${result.commitId}`);
  return result.conflict;
};

describe('三个捕获位各自有一次比较（FR-031）', () => {
  it('CommitConflict.kind 恰好是三个取值，对应三次比较', () => {
    expectTypeOf<CommitConflictKind>().toEqualTypeOf<
      'working_tree_revision' | 'head_revision' | 'activation_revision'
    >();
  });

  it('工作树 revision 不匹配 → working_tree_revision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    const conflict = expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    expect(conflict).toEqual({
      kind: 'working_tree_revision',
      expected: 4,
      actual: 5,
      branchId: SCENE_BRANCH_ID
    });
  });

  it('head revision 不匹配 → head_revision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    const conflict = expectConflict(await commitWith(scene, { expectedHeadRevision: 1 }));

    expect(conflict).toEqual({ kind: 'head_revision', expected: 1, actual: 2, branchId: SCENE_BRANCH_ID });
  });

  it('activation revision 不匹配 → activation_revision', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 7 });
    scene.addEntry();

    const conflict = expectConflict(
      await commitWith(scene, { expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 6 } })
    );

    expect(conflict).toEqual({ kind: 'activation_revision', expected: 6, actual: 7, branchId: SCENE_BRANCH_ID });
  });

  it('捕获的分支 id 不是当前 active 分支 → 同样是 activation_revision，且不落到那条分支上', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 3 });
    scene.addEntry();

    const conflict = expectConflict(
      await commitWith(scene, { expectedBranch: { branchId: 'feature-x', activationRevision: 3 } })
    );

    // 在事务里重新读一次 active 分支再把这笔提交归过去，是明令禁止的形态：
    // 那样永远不会失败，代价是用户在 feature-x 上看到的变更被写进 main 的历史。
    expect(conflict.kind).toBe('activation_revision');
    expect(scene.probe.rowsOf(Commit)).toEqual([]);
  });

  it('三者都对得上时提交成功', async () => {
    const scene = createWorkingTreeScene({ activationRevision: 7, headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    const result = await commitWith(scene, {
      expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 7 },
      expectedHeadRevision: 2,
      expectedWorkingTreeRevision: 5
    });

    expect(result.ok).toBe(true);
  });
});

describe('不得放宽为只校验 head（SC-008）', () => {
  it('另一个 Tab 在 status() 与 commit() 之间 save() 过：head 没动，提交仍被拒', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    // 用户看到的那一刻。
    const seen = await readWorkingTreeStatus(scene.probe.executor);

    // 另一个 Tab 的一次 save()：只动工作树，HEAD 一格没动。
    scene.addEntry({ entityId: 'note-from-another-tab' });
    stateRowOf(scene).workingTreeRevision += 1;

    const conflict = expectConflict(
      await commitWith(scene, {
        expectedBranch: { branchId: seen.branchId, activationRevision: seen.activationRevision },
        expectedHeadRevision: seen.headRevision,
        expectedWorkingTreeRevision: seen.workingTreeRevision
      })
    );

    // 只比 head 的实现在这里会**提交成功**，而且顺手把另一个 Tab 那条单元一起提交了。
    expect(conflict.kind).toBe('working_tree_revision');
  });

  it('SC-008 的代价是这一次失败，不是重新引入暂存区：重新 status() 再提交即可成功', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();
    const seen = await readWorkingTreeStatus(scene.probe.executor);
    scene.addEntry({ entityId: 'note-from-another-tab' });
    stateRowOf(scene).workingTreeRevision += 1;
    expectConflict(
      await commitWith(scene, {
        expectedBranch: { branchId: seen.branchId, activationRevision: seen.activationRevision },
        expectedHeadRevision: seen.headRevision,
        expectedWorkingTreeRevision: seen.workingTreeRevision
      })
    );

    // 正确的恢复动作：重新 status() → 复核 → 重新 commit()。
    const recheck = await readWorkingTreeStatus(scene.probe.executor);
    const result = await commitWith(scene, {
      operationId: 'op-cas-retry',
      expectedBranch: { branchId: recheck.branchId, activationRevision: recheck.activationRevision },
      expectedHeadRevision: recheck.headRevision,
      expectedWorkingTreeRevision: recheck.workingTreeRevision
    });

    expect(result.ok).toBe(true);
  });
});

describe('冲突是返回值，不是异常，也没有自动重试（contracts/core-api.md §4.1）', () => {
  it('CAS 失败时不抛，返回 ok:false', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    const result = await commitWith(scene, { expectedWorkingTreeRevision: 4 });

    expect(result.ok).toBe(false);
  });

  it('commit_conflict 不在错误码表里——它不是异常', () => {
    expect([...COMMIT_ERROR_CODES]).not.toContain('commit_conflict');
  });

  it('CommitConflict 的键集恰好是契约里那四个，不长出会漂移的第五个', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    const conflict = expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    // 多一个字段就多一处可以被写进某张表的东西，而契约明确说它**不入库**、
    // 也不需要「清除冲突」的 API。
    expect(Object.keys(conflict).sort()).toEqual(['actual', 'branchId', 'expected', 'kind']);
  });

  it('不自动重试：CAS 失败后一次都没再打 CAS 语句', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    // 自动重试等于提交调用方没看过的变更：第二次读到的是**新**的 revision，
    // 于是那一次必然成功——用户对此一无所知。
    const casStatements = scene.probe.statements.filter(sql => sql.toLowerCase().includes('update'));
    expect(casStatements).toEqual([]);
  });
});

describe('冲突时全量回滚：一个字节都不落地', () => {
  it('不写 Commit 行', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    expect(scene.probe.rowsOf(Commit)).toEqual([]);
  });

  it('不写 CommitChangeSet 行', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    expect(scene.probe.rowsOf(CommitChangeSet)).toEqual([]);
  });

  it('不清工作树条目，也不动 entryCount', async () => {
    const scene = createWorkingTreeScene({ workingTreeRevision: 5 });
    scene.addEntry();
    scene.addEntry();

    expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    // 「半清空的工作树」是 SC-007 点名的那个绝不允许出现的中间态。
    expect({ rows: entryRowsOf(scene).length, entryCount: stateRowOf(scene).entryCount }).toEqual({
      rows: 2,
      entryCount: 2
    });
  });

  it('不推进 headRevision，也不推进 workingTreeRevision', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    expectConflict(await commitWith(scene, { expectedWorkingTreeRevision: 4 }));

    expect({
      headRevision: refRowOf(scene).headRevision,
      workingTreeRevision: stateRowOf(scene).workingTreeRevision
    }).toEqual({ headRevision: 2, workingTreeRevision: 5 });
  });

  it('凭据比较先于任何写入——三个比较都在写 Commit 之前发生', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5, activationRevision: 7 });
    scene.addEntry();

    // 三个都错：无论实现按什么顺序比，都必须在第一处不匹配上就停下。
    expectConflict(
      await commitWith(scene, {
        expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 1 },
        expectedHeadRevision: 1,
        expectedWorkingTreeRevision: 1
      })
    );

    expect(scene.probe.saved).toEqual([]);
  });
});
