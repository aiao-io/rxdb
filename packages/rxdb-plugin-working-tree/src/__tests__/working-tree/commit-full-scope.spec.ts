/**
 * @fileoverview T071 红测试：`commit()` **没有 selection 入参**，提交范围恒为当前分支
 * 工作树的全部未提交单元（FR-011/041、硬裁决 1）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/commit-command.ts` 与门面上的 `commit()`。
 *
 * v1 没有暂存区这件事，在签名上只表现为「少一个参数」，于是它最容易被当成
 * 「签名还没写完」而被补上。补上之后，`commit(msg, { units: [...] })` 会安静地工作，
 * 而工作树里剩下没被选中的那一半就成了残量——紧接着就需要 rebase、需要依赖闭包、
 * 需要环检测，硬裁决 1 与 2 一起失守。所以这里同时从三个角度钉：
 *
 * 1. **类型层**：`CommitOptions` 的键集是封闭的，不含任何形如「选哪些」的字段。
 * 2. **运行期**：`commit.length === 2`，第三个位置参数不存在。
 * 3. **语义层**：库里有三条单元时，提交后工作树是**空的**，而不是剩两条。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from '../../working-tree/commit-command.js';
import { readWorkingTreeStatus } from '../../working-tree/status.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 一组对得上场景初值的捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): CommitOptions => ({
  authorId: 'alice',
  operationId: 'op-1',
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次提交。 */
const commitOnce = (
  scene: WorkingTreeScene,
  message: string,
  overrides: Partial<CommitOptions> = {}
): Promise<CommitResult> =>
  commitWorkingTree(scene.probe.executor, scene.database.entityManager, message, credentialsOf(scene, overrides));

/** 取成功出口，拿到别的就直接炸，免得后续断言在 undefined 上继续。 */
const expectOk = (result: CommitResult): Extract<CommitResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次提交成功，实际拿到冲突：${JSON.stringify(result.conflict)}`);
  return result;
};

describe('签名里没有 selection 入参（硬裁决 1）', () => {
  it('CommitOptions 的键集是封闭的，不含任何「提交哪些」的字段', () => {
    // 键集而不是点名：点名只能挡住 units / paths / selection / only 这几个想得到的名字。
    expectTypeOf<keyof CommitOptions>().toEqualTypeOf<
      'authorId' | 'operationId' | 'expectedBranch' | 'expectedHeadRevision' | 'expectedWorkingTreeRevision'
    >();
  });

  it('门面上的 commit() 恰好收两个位置参数', async () => {
    const scene = createWorkingTreeScene();

    // `Function.length` 不算可选参数与剩余参数；等于 2 就意味着 message 与 options
    // 都是必填，而第三个位置上什么都没有。
    expect(scene.manager.commit).toHaveLength(2);
  });

  it('CommitOptions 是必填的末位参，不是可选的便利入参', () => {
    // 元组长度恰好是 4：可选末参会让它变成 `3 | 4`，而「可选」等于允许
    // 「缺省时由本次调用内部读取 revision」——那正是 FR-031 禁止的放宽。
    // 内部读到的值恒等于当前值，CAS 于是永远命中，「提交我看过的东西」当场失效。
    expectTypeOf<Parameters<typeof commitWorkingTree>['length']>().toEqualTypeOf<4>();
    expectTypeOf<Parameters<typeof commitWorkingTree>[3]>().toEqualTypeOf<CommitOptions>();
  });

  it('运行期塞进去的 selection 形状不被认领：三条单元一条不落地全提交', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-a' });
    scene.addEntry({ unitId: 'unit-b' });
    scene.addEntry({ unitId: 'unit-c' });

    const polluted = { ...credentialsOf(scene), units: ['unit-a'], selection: ['unit-a'] } as CommitOptions;
    const result = expectOk(
      await commitWorkingTree(scene.probe.executor, scene.database.entityManager, '全量提交', polluted)
    );

    expect(result.changeSetCount).toBe(3);
  });
});

describe('提交范围恒为全部未提交单元（FR-011）', () => {
  it('三条单元写成三条 CommitChangeSet', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-a', entityId: 'note-a' });
    scene.addEntry({ unitId: 'unit-b', entityId: 'note-b' });
    scene.addEntry({ unitId: 'unit-c', entityId: 'note-c' });

    expectOk(await commitOnce(scene, '一次提交三条'));

    const changeSets = scene.probe.rowsOf(CommitChangeSet) as CommitChangeSet[];
    expect(changeSets.map(row => row.unitId).sort()).toEqual(['unit-a', 'unit-b', 'unit-c']);
  });

  it('remote_sync 来源的单元一并提交，不因来源被跳过（硬裁决 6）', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-local', origin: 'local' });
    scene.addEntry({ unitId: 'unit-remote', origin: 'remote_sync' });

    expectOk(await commitOnce(scene, '含远端同步'));

    const changeSets = scene.probe.rowsOf(CommitChangeSet) as CommitChangeSet[];
    // 跳过 remote_sync 会留下永不消失的残量：它既不会被提交，也不会被 discard 之外的
    // 任何东西清掉，而 status() 会一直报「有未提交变更」。
    expect(changeSets.map(row => row.origin).sort()).toEqual(['local', 'remote_sync']);
  });

  it('只提交当前分支的单元，隔壁分支的不进来', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-mine' });
    scene.addEntry({ id: 'entry-foreign', unitId: 'unit-theirs', branchId: 'feature-x' });

    const result = expectOk(await commitOnce(scene, '只提交本分支'));

    expect(result.changeSetCount).toBe(1);
    expect(entryRowsOf(scene).map(row => row.unitId)).toEqual(['unit-theirs']);
  });

  it('干净分支上提交被拒绝，而不是造一个空 commit', async () => {
    const scene = createWorkingTreeScene();

    const error = await commitOnce(scene, '没东西可提交').then(
      () => null,
      (caught: unknown) => caught
    );

    // 空 commit 会让历史里出现一串什么都没做的节点，而每一个都推进了 headRevision，
    // 于是别的 Tab 手里的捕获型凭据凭空过期。
    expect((error as { reason?: unknown }).reason).toBe('empty_commit');
  });
});

describe('提交成功后工作树回 clean，并以新 commit 为基线（FR-041）', () => {
  it('全部条目被清除，entryCount 归零', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();

    expectOk(await commitOnce(scene, '清空'));

    expect(entryRowsOf(scene)).toEqual([]);
    expect(stateRowOf(scene).entryCount).toBe(0);
  });

  it('status() 随即报 clean', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();

    expectOk(await commitOnce(scene, '清空'));

    const status = await readWorkingTreeStatus(scene.probe.executor);
    expect({ clean: status.clean, entryCount: status.entryCount }).toEqual({ clean: true, entryCount: 0 });
  });

  it('工作树基线推到新 commit 上——不存在残量，也就没有 rebase 可言', async () => {
    const scene = createWorkingTreeScene({ headCommitId: null });
    scene.addEntry();

    const result = expectOk(await commitOnce(scene, '推基线'));

    const [commit] = scene.probe.rowsOf(Commit) as Commit[];
    expect(result.commitId).toBe(commit.id);
    // 基线不跟着走的话，下一次 diff 会拿新工作树去比一个已经不是 HEAD 的 commit，
    // 而那正是「残量 + rebase」这条路的第一步。
    expect(stateRowOf(scene).baseHeadCommitId).toBe(commit.id);
  });

  it('workingTreeRevision 与 headRevision 各推进一格', async () => {
    const scene = createWorkingTreeScene({ headRevision: 2, workingTreeRevision: 5 });
    scene.addEntry();

    const result = expectOk(await commitOnce(scene, '推 revision'));

    expect({
      headRevision: result.headRevision,
      refHeadRevision: refRowOf(scene).headRevision,
      workingTreeRevision: stateRowOf(scene).workingTreeRevision
    }).toEqual({ headRevision: 3, refHeadRevision: 3, workingTreeRevision: 6 });
  });

  it('changeSetCount 与实际写进去的 CommitChangeSet 行数一致', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry();
    scene.addEntry();
    scene.addEntry();

    const result = expectOk(await commitOnce(scene, '计数自洽'));

    const [commit] = scene.probe.rowsOf(Commit) as Commit[];
    expect({
      result: result.changeSetCount,
      onCommit: commit.changeSetCount,
      rows: scene.probe.rowsOf(CommitChangeSet).length
    }).toEqual({
      result: 3,
      onCommit: 3,
      rows: 3
    });
  });
});
