/**
 * @fileoverview US-319：合并提交（多父）上的遍历——历史列表、导出、restore、提交视图与从提交建分支各自怎么走。
 *
 * @remarks
 * 实现目标是 `src/commit/list-commits.ts`（拓扑序）、`src/commit/commit-ancestry.ts`（全部父链 / 第一父链两种可达）、
 * `src/commit/commit-exchange.ts`（导出）、`src/working-tree/restore-command.ts` 与 `src/working-tree/branch-from-commit.ts`。
 *
 * 合并提交只由导入写下，每个提交的 ChangeSet 是相对**第一父**的增量。由此分出两种「从 HEAD 到某个提交」：
 *
 * - **「它在不在历史里」走全部父链**：历史列表、导出、从提交建分支、损坏守卫。漏看第二父那一侧，被合并进来的提交就从历史里消失了。
 * - **「从这条分支的数据退回它要撤销哪些 ChangeSet」只走第一父链**：restore 与提交视图。侧枝提交的 ChangeSet 从没直接落到
 *   本分支的业务表上，撤它们就是撤第二遍；侧枝上的目标因此是一个单独的拒绝原因（`side_branch_target`），不并进「不可达」。
 *
 * 图（第一父链 ROOT → A → B → C → M，M 的第二父是侧枝的 S1）：
 *
 * ```
 * ROOT ── A ── B ── C ── M      （第一父链）
 *   └──────── S1 ───────┘      （侧枝：从 ROOT 分出的一个任务分支提交，是 M 的第二父）
 * ```
 *
 * 逐层回溯的发现序是 M; C, S1; B, ROOT; A——长主线并进一条从老基线分出来的短侧枝：ROOT 在第二层就被侧枝那条边发现，
 * 而它在主线上的子 A 要到第三层才出现。不修正的话祖先排在了它的子前面。
 */

import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { CommitChangeUnitContent } from '../../commit/change-unit.js';
import { resolveFirstParentReplayPath } from '../../commit/commit-ancestry.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { readCommitExportPage } from '../../commit/commit-exchange.js';
import { CommitForkPoint } from '../../commit/commit-fork-point.entity.js';
import type { CommitKind } from '../../commit/commit.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { listCommits } from '../../commit/list-commits.js';
import { buildCommitRows } from '../../commit/write-commit.js';
import { planBranchFromCommit } from '../../working-tree/branch-from-commit.js';
import { restoreWorkingTree, type WorkingTreeRestoreResult } from '../../working-tree/restore-command.js';
import { selectRestoreReplayPath } from '../../working-tree/restore-precheck.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  SceneNote,
  stateRowOf,
  type WorkingTreeScene
} from '../working-tree/fixtures/working-tree-scene.js';

const NOTE = getEntityMetadata(SceneNote);

/** 一个只改一行的单元；每个提交改自己那一行，撤销路径上读到了哪些提交一眼看得出来。 */
const unitOf = (commitId: string): CommitChangeUnitContent => ({
  unitId: `unit-${commitId}`,
  transactionId: null,
  namespace: NOTE.namespace,
  entity: NOTE.name,
  entityId: `note-${commitId}`,
  operation: 'insert',
  patch: { title: commitId },
  inversePatch: null,
  origin: 'local'
});

/** 往场景里塞一个自洽的提交；时间按顺序递增，与图的先后一致。 */
const seed = (scene: WorkingTreeScene, id: string, parentIds: readonly string[], order: number): Commit => {
  const kind: CommitKind =
    parentIds.length === 0 ? 'baseline'
    : parentIds.length > 1 ? 'merge'
    : 'normal';
  const system = kind === 'baseline';
  const { commit, changeSets } = buildCommitRows(scene.database.entityManager, {
    id,
    kind,
    parentIds: [...parentIds],
    message: system ? '基线' : `提交 ${id}`,
    author: system ? null : 'alice',
    operationId: `00000000-0000-4000-8000-${String(order).padStart(12, '0')}`,
    units: system ? [] : [unitOf(id)],
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, order))
  });
  scene.probe.seed(Commit, [commit]);
  scene.probe.seed(CommitChangeSet, changeSets);
  return commit;
};

/** 上面那张图，HEAD 停在 M，工作树 clean。 */
const mergedScene = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: 'M', headRevision: 5 });
  seed(scene, 'ROOT', [], 0);
  seed(scene, 'A', ['ROOT'], 1);
  seed(scene, 'S1', ['ROOT'], 2);
  seed(scene, 'B', ['A'], 3);
  seed(scene, 'C', ['B'], 4);
  seed(scene, 'M', ['C', 'S1'], 5);
  return scene;
};

const idsOf = (commits: readonly { readonly id: string }[]): string[] => commits.map(commit => commit.id);

describe('listCommits()：合并图上子先于父（US-319 AC#6）', () => {
  it('每个可达提交恰好一次，任何祖先都不排在它的子前面', async () => {
    const scene = mergedScene();

    const order = idsOf(await listCommits(scene.probe.executor, { branchId: SCENE_BRANCH_ID }));

    // 发现序是 M, C, S1, B, ROOT, A：ROOT 排在了它的子 A 前面
    expect(order).toEqual(['M', 'C', 'S1', 'B', 'A', 'ROOT']);
    const position = new Map(order.map((id, index) => [id, index]));
    for (const commit of scene.probe.rowsOf(Commit) as Commit[]) {
      for (const parentId of commit.parentIds) expect(position.get(commit.id)!).toBeLessThan(position.get(parentId)!);
    }
  });

  it('带 limit：见过合并就走完全图再截断，截出来的仍是拓扑序的前缀', async () => {
    const scene = mergedScene();

    const order = idsOf(await listCommits(scene.probe.executor, { branchId: SCENE_BRANCH_ID, limit: 5 }));

    // 只按发现序截断的话，第五个会是 ROOT（第二层就被侧枝那条边发现了），而它的子 A 还没列出来
    expect(order).toEqual(['M', 'C', 'S1', 'B', 'A']);
  });

  it('线性历史：顺序与带 limit 的提前收兵都不变', async () => {
    const scene = createWorkingTreeScene({ headCommitId: 'C', headRevision: 3 });
    seed(scene, 'ROOT', [], 0);
    seed(scene, 'A', ['ROOT'], 1);
    seed(scene, 'B', ['A'], 2);
    seed(scene, 'C', ['B'], 3);

    const order = idsOf(await listCommits(scene.probe.executor, { branchId: SCENE_BRANCH_ID, limit: 2 }));

    expect(order).toEqual(['C', 'B']);
    // 两层就够了：没见过合并，不为了排序去走完整条链
    expect(scene.probe.finds.filter(find => find.entity === 'Commit')).toHaveLength(2);
  });
});

describe('第一父链与全部父链：两种「从 HEAD 到它」（US-319 AC#6）', () => {
  it('第一父链上的目标交回撤销路径，HEAD 在前、不含目标，侧枝不在路上', async () => {
    const scene = mergedScene();

    expect(await resolveFirstParentReplayPath(scene.probe.executor, 'M', 'A')).toEqual({
      kind: 'path',
      path: ['M', 'C', 'B']
    });
    expect(await resolveFirstParentReplayPath(scene.probe.executor, 'M', 'M')).toEqual({ kind: 'path', path: [] });
    // 公开的 `selectRestoreReplayPath` 是同一份判定，只是把侧枝与不可达都收成 `undefined`
    expect(await selectRestoreReplayPath(scene.probe.executor, 'M', 'A')).toEqual(['M', 'C', 'B']);
  });

  it('只在侧枝上的目标是 side_branch，不在图里的是 unreachable', async () => {
    const scene = mergedScene();

    expect(await resolveFirstParentReplayPath(scene.probe.executor, 'M', 'S1')).toEqual({ kind: 'side_branch' });
    expect(await resolveFirstParentReplayPath(scene.probe.executor, 'M', 'nowhere')).toEqual({ kind: 'unreachable' });
    expect(await resolveFirstParentReplayPath(scene.probe.executor, null, 'A')).toEqual({ kind: 'unreachable' });
    expect(await selectRestoreReplayPath(scene.probe.executor, 'M', 'S1')).toBeUndefined();
  });
});

describe('restore()：沿第一父链撤销，侧枝上的目标单独拒绝（US-319 AC#6）', () => {
  const credentialsOf = (scene: WorkingTreeScene) => ({
    expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
    expectedHeadRevision: refRowOf(scene).headRevision,
    expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
  });

  const restoreTo = (scene: WorkingTreeScene, commitId: string): Promise<WorkingTreeRestoreResult> =>
    restoreWorkingTree(scene.probe.executor, scene.context, { commitId }, credentialsOf(scene));

  it('恢复到第一父链上的 A：只撤 M、C、B 三个提交的增量，侧枝 S1 不撤', async () => {
    const scene = mergedScene();

    const result = await restoreTo(scene, 'A');

    expect(result).toMatchObject({ ok: true, restoredCount: 3 });
    // 每个提交插了自己那一行：撤销 = 删掉那一行。侧枝提交的行从没落到本分支的业务表上，撤它就是撤第二遍
    expect(
      entryRowsOf(scene)
        .map(entry => [entry.entityId, entry.operation])
        .sort()
    ).toEqual([
      ['note-B', 'delete'],
      ['note-C', 'delete'],
      ['note-M', 'delete']
    ]);
  });

  it('恢复到侧枝上的 S1：side_branch_target，一个字节都没写', async () => {
    const scene = mergedScene();

    const result = await restoreTo(scene, 'S1');

    expect(result).toEqual({ ok: false, reason: 'side_branch_target' });
    expect(scene.probe.trace.filter(step => ['saveMany', 'query', 'mergeChanges'].includes(step))).toEqual([]);
  });
});

describe('从提交建分支：可达性走全部父链，数据由分叉点给出（US-319）', () => {
  it('侧枝提交有分叉点（它是在本库某条分支上提交的）：能建', async () => {
    const scene = mergedScene();
    const forkPoint = scene.database.entityManager.instantiate(CommitForkPoint);
    Object.assign(forkPoint, {
      id: 'S1',
      branchId: SCENE_BRANCH_ID,
      changeId: null,
      revertedCount: 0,
      maxRevertChangeId: null
    });
    scene.probe.seed(CommitForkPoint, [forkPoint]);

    expect(await planBranchFromCommit(scene.probe.executor, 'S1')).toMatchObject({ ok: true });
  });

  it('导入进来、只作为侧枝入库的提交没有分叉点：fork_point_unknown，而不是 unreachable_target', async () => {
    const scene = mergedScene();

    expect(await planBranchFromCommit(scene.probe.executor, 'S1')).toEqual({ ok: false, reason: 'fork_point_unknown' });
    expect(await planBranchFromCommit(scene.probe.executor, 'nowhere')).toEqual({
      ok: false,
      reason: 'unreachable_target'
    });
  });
});

describe('导出：某个提交之后的提交，父先于子、落库形态（US-319 导出侧）', () => {
  it('不给 afterCommitId：整条可达历史，含根与侧枝，最后一个是 HEAD', async () => {
    const scene = mergedScene();

    const page = await readCommitExportPage(scene.probe.executor, SCENE_BRANCH_ID);

    expect(page).toMatchObject({ branchId: SCENE_BRANCH_ID, headCommitId: 'M', headRevision: 5 });
    // 就是历史列表的倒序：每个提交的父都排在它前面，可以原样交给另一台设备导入
    expect(page.commits.map(record => record.commitId)).toEqual(['ROOT', 'A', 'B', 'S1', 'C', 'M']);
  });

  it('afterCommitId：只要它不可达的那一段（after..HEAD），侧枝上它够不到的也在里面', async () => {
    const scene = mergedScene();

    const page = await readCommitExportPage(scene.probe.executor, SCENE_BRANCH_ID, { afterCommitId: 'B' });

    expect(page.commits.map(record => record.commitId)).toEqual(['S1', 'C', 'M']);
  });

  it('记录逐字是库里那一份：父链、种类、消息、作者、时间、内容指纹与落库形态的单元', async () => {
    const scene = mergedScene();
    const stored = (scene.probe.rowsOf(Commit) as Commit[]).find(commit => commit.id === 'M')!;

    const page = await readCommitExportPage(scene.probe.executor, SCENE_BRANCH_ID, { afterCommitId: 'C' });

    expect(page.commits.map(record => record.commitId)).toEqual(['S1', 'M']);
    expect(page.commits[1]).toEqual({
      commitId: 'M',
      parentIds: ['C', 'S1'],
      kind: 'merge',
      message: stored.message,
      authorId: 'alice',
      createdAt: stored.createdAt,
      contentFingerprint: stored.contentFingerprint,
      units: [unitOf('M')]
    });
  });

  it('afterCommitId 就是 HEAD：空页；本库里没有的提交：抛错，而不是从头导出', async () => {
    const scene = mergedScene();

    expect((await readCommitExportPage(scene.probe.executor, SCENE_BRANCH_ID, { afterCommitId: 'M' })).commits).toEqual(
      []
    );
    await expect(
      readCommitExportPage(scene.probe.executor, SCENE_BRANCH_ID, { afterCommitId: 'nowhere' })
    ).rejects.toThrow(/Commit 'nowhere' does not exist/);
  });
});
