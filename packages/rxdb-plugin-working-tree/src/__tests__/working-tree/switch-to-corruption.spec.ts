/**
 * @fileoverview T117 红测试：switch-to 复用 T038 的**同一份**守卫；可达损坏时返回
 * `commit_graph_corrupted`、不改指针、不删记录，而「切离」损坏分支不受影响（FR-051、SC-013）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/switch-branch-options.ts` 里新增的
 * `assertSwitchTargetIntact(executor, targetBranchId)`（接线归 T118/T120）。
 *
 * **落在 T112 那个模块里，而不是第三个新文件**：它与 `assertSwitchBranchPreconditions()`
 * 是同一次切换的两道前置，接线点也是同一处；两者的**判据来源却必须分开**——前者问的是
 * 「当前分支干不干净」（`WorkingTreeState.entryCount`），后者问的是「目标分支的历史能不能
 * 重放」（可达父链）。合成一个函数的代价正是下面第 4 组要防的那件事。
 *
 * SC-013 要的是「`commit()` / `restore()` / switch-to **三条入口各自**返回
 * `commit_graph_corrupted`」。三条各写一份判定也能让三条用例都绿——绿到某次只改了其中
 * 一份为止。所以这里与 T077 同样从两个方向钉：**行为等价**（四种损坏形态下判别位与直接
 * 调守卫逐字段相同）与**符号同一**（源码里必须 import 那个符号、自己不构造错误、不出现
 * 任何一个 reason 字面量）。
 *
 * 四组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **守卫跑在了当前分支上。** `commit()` / `restore()` / `discard()` 三处的调用都写作
 *    `assertCommitGraphIntact(executor, token.branchId)`，照着抄过来就是这一行——而 switch-to
 *    是这四处里唯一一处「要校验的分支不是当前分支」的。抄过来之后：切到一条坏分支畅通无阻
 *    （投影换成了一份重放不出来的历史），切离一条坏分支反而被拒（用户被锁死在坏分支上）。
 *    第 1 组用「来源健康、目标损坏」钉前半句，第 4 组用「来源损坏、目标健康」钉后半句。
 * 2. **拒绝时顺手把库「修好」**。回退目标分支的 HEAD、清掉坏记录、或者把目标 ref 的
 *    `status` 就地翻成 `ok`，都能让下一次切换看起来正常——代价是用户唯一一次能导出完整
 *    诊断的机会没了。FR-022 要的是相反的：保留原 ref、不删记录、拒绝操作。
 * 3. **拒绝时把分支标成损坏**。校验只读；落标记是另一个符号、另一个事务。写进这个即将
 *    回滚的事务里，标记会跟着一起消失，用户永远诊断不出来。
 * 4. **把「目标损坏」与「当前脏」判进同一个函数。** 合并之后 `requireClean` 这个开关就同时
 *    管住了损坏校验：调用方显式关掉 clean 检查（FR-017 允许，历史子系统的回放路径正是这么
 *    调的）会顺带把损坏守卫一起关掉，于是那条路径可以切进一份重放不出来的历史。
 */

import { RxDBBranch } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { assertCommitGraphIntact, type CommitGraphCorruptionReason } from '../../commit/commit-graph-guard.js';
import { Commit } from '../../commit/commit.entity.js';
import { assertSwitchBranchPreconditions, assertSwitchTargetIntact } from '../../working-tree/switch-branch-options.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { normalizeSql } from '../commit/fixtures/commit-graph-probe.js';
import {
  createWorkingTreeScene,
  SCENE_BRANCH_ID,
  seedCommit,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 要切过去的那条分支。 */
const TARGET_BRANCH_ID = 'feature';

/** 目标分支那条三节点直链的 HEAD。 */
const TARGET_HEAD = 'target-head';

/** 来源（当前）分支的 HEAD；全程健康，第 4 组里才被弄坏。 */
const SOURCE_HEAD = 'source-head';

/** `working-tree/` 下的源码快照；用来证明守卫是**被引用**的，不是被抄了一份。 */
const WORKING_TREE_SOURCES = import.meta.glob<string>('../../working-tree/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true
});

/** 取一份源码；文件还没建时给出的信息要能直接指出缺的是哪个文件。 */
const sourceOf = (fileName: string): string => {
  const source = WORKING_TREE_SOURCES[`../../working-tree/${fileName}`];
  if (source === undefined) throw new Error(`src/working-tree/${fileName} 不存在`);
  return source;
};

/** 取某条分支的 ref 行。 */
const refOf = (scene: WorkingTreeScene, branchId: string): CommitBranchRef => {
  const row = (scene.probe.rowsOf(CommitBranchRef) as CommitBranchRef[]).find(
    candidate => candidate.branchId === branchId
  );
  if (!row) throw new Error(`场景里没有分支 '${branchId}' 的 ref`);
  return row;
};

/** 取场景里某个 commit 行。 */
const commitOf = (scene: WorkingTreeScene, id: string): Commit => {
  const row = (scene.probe.rowsOf(Commit) as Commit[]).find(candidate => candidate.id === id);
  if (!row) throw new Error(`场景里没有 commit '${id}'`);
  return row;
};

/**
 * 把一个 commit 连同它的 changeSet 从场景里抹掉。
 *
 * @remarks
 * 「父链指向不存在的 commit」只能这么造。改 `parentIds` 指向一个编出来的 id 造不出这种
 * 损坏：`parentIds` 本身参与 `contentFingerprint` 的计算，改完先撞上 `fingerprint_mismatch`，
 * 守卫根本走不到取父节点那一步——于是那一格测的其实是上一格。
 */
const dropCommit = (scene: WorkingTreeScene, id: string): void => {
  commitOf(scene, id);
  const commits = scene.probe.rowsOf(Commit) as Commit[];
  commits.splice(
    commits.findIndex(row => row.id === id),
    1
  );
  const changeSets = scene.probe.rowsOf(CommitChangeSet) as CommitChangeSet[];
  const remaining = changeSets.filter(row => row.commitId !== id);
  changeSets.splice(0, changeSets.length, ...remaining);
};

/**
 * 造一个「当前在 main、要切去 feature」的场景：两条分支各有自己的三/二节点直链。
 *
 * @remarks
 * 两条分支的 ref 与 commit 链**都**布上：只布目标分支的话，「守卫跑在了当前分支上」
 * 这种写法会因为当前分支压根没有历史而一路放行，用例照样绿。
 */
const createSwitchScene = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: SOURCE_HEAD, headRevision: 2 });
  seedCommit(scene, 'source-root');
  seedCommit(scene, SOURCE_HEAD, ['source-root']);
  seedCommit(scene, 'target-root');
  seedCommit(scene, 'target-mid', ['target-root']);
  seedCommit(scene, TARGET_HEAD, ['target-mid']);

  const { entityManager } = scene.database;
  // 分支行本身也要布：`assertSwitchTargetIntact()` 先判物化状态（FR-049），而那一步读的是
  // `RxDBBranch` 上的 `local` / `remote`。缺这一行时它抛的是「这条分支不存在」，
  // 于是四种损坏形态全部红在一个与损坏无关的成因上。`local: true` 是本地分支——
  // 远端那一支是 metadata-only 的题面，不在本文件。
  const branch = entityManager.instantiate(RxDBBranch);
  branch.id = TARGET_BRANCH_ID;
  branch.activated = false;
  branch.local = true;
  branch.remote = false;
  branch.parentId = SCENE_BRANCH_ID;
  branch.fromChangeId = null;
  scene.probe.seed(RxDBBranch, [branch]);

  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = TARGET_BRANCH_ID;
  ref.branchId = TARGET_BRANCH_ID;
  ref.generation = 2;
  ref.headCommitId = TARGET_HEAD;
  ref.headRevision = 3;
  ref.status = 'ok';
  ref.corruptedAt = null;
  scene.probe.seed(CommitBranchRef, [ref]);

  const state = entityManager.instantiate(WorkingTreeState);
  state.id = TARGET_BRANCH_ID;
  state.branchId = TARGET_BRANCH_ID;
  state.baseHeadCommitId = TARGET_HEAD;
  state.workingTreeRevision = 0;
  state.entryCount = 0;
  state.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  scene.probe.seed(WorkingTreeState, [state]);

  return scene;
};

/** 把一次拒绝摊成可比较的判别位；文案不进来，文案是会被改的。 */
const verdictOf = (error: unknown): Record<string, unknown> => {
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    reason?: unknown;
    branchId?: unknown;
    commitId?: unknown;
  };
  return {
    name: candidate.name,
    code: candidate.code,
    reason: candidate.reason,
    branchId: candidate.branchId,
    commitId: candidate.commitId
  };
};

/** 跑一个必然被拒的调用，把拒因原样交出来。 */
const captureRejection = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    resolved => {
      throw new Error(`期望这次调用被拒绝，实际返回了 ${JSON.stringify(resolved)}`);
    },
    (caught: unknown) => caught
  );

/** 切去目标分支之前的那道守卫。 */
const switchTo = (scene: WorkingTreeScene, branchId: string = TARGET_BRANCH_ID): Promise<void> =>
  assertSwitchTargetIntact(scene.probe.executor, branchId);

/** 四种损坏形态；每一种都要求守卫做一件不同的事。 */
interface CorruptionCase {
  readonly name: string;
  readonly corrupt: (scene: WorkingTreeScene) => void;
  readonly reason: CommitGraphCorruptionReason;
  readonly commitId: string | null;
}

const CORRUPTION_CASES: readonly CorruptionCase[] = [
  {
    name: '目标分支已被标记 corrupted_read_only',
    corrupt: scene => {
      refOf(scene, TARGET_BRANCH_ID).status = 'corrupted_read_only';
      refOf(scene, TARGET_BRANCH_ID).corruptedAt = new Date('2026-01-02T00:00:00.000Z');
    },
    reason: 'branch_marked_corrupted',
    commitId: TARGET_HEAD
  },
  {
    // 只查 HEAD 的实现在这里是绿的：根节点在三层之外。
    name: '目标分支根节点指纹被篡改',
    corrupt: scene => {
      commitOf(scene, 'target-root').contentFingerprint = 'fp-tampered';
    },
    reason: 'fingerprint_mismatch',
    commitId: 'target-root'
  },
  {
    // 指纹仍然对得上，差异只在另一张表的行数上——要真的去数才发现得了。
    name: '目标分支的 changeSetCount 与实际行数对不上',
    corrupt: scene => {
      commitOf(scene, 'target-mid').changeSetCount = 5;
    },
    reason: 'change_set_count_mismatch',
    commitId: 'target-mid'
  },
  {
    // 只查 HEAD 的实现在这里同样是绿的：断的是第二跳的父链。
    name: '目标分支父链指向不存在的 commit',
    corrupt: scene => {
      dropCommit(scene, 'target-root');
    },
    reason: 'missing_commit',
    commitId: 'target-root'
  }
];

describe('四种损坏形态下 switch-to 的判别位与守卫逐字段相同（SC-013）', () => {
  for (const scenario of CORRUPTION_CASES) {
    it(`${scenario.name}：与 assertCommitGraphIntact() 给出同一个结论`, async () => {
      const viaSwitch = createSwitchScene();
      const viaGuard = createSwitchScene();
      scenario.corrupt(viaSwitch);
      scenario.corrupt(viaGuard);

      const fromSwitch = await captureRejection(switchTo(viaSwitch));
      const fromGuard = await captureRejection(assertCommitGraphIntact(viaGuard.probe.executor, TARGET_BRANCH_ID));

      expect(verdictOf(fromSwitch)).toEqual(verdictOf(fromGuard));
      // 拒绝码另外写死一遍而不是只跟守卫比：两边一起改错的话，「等价」那条仍然绿。
      // `branchId` 一并钉住——守卫跑在来源分支上时它报的是 `main`，而 `main` 是健康的，
      // 于是那种实现在这一组里根本不会抛，两条断言都会当场红。
      expect(verdictOf(fromSwitch)).toMatchObject({
        code: CommitErrorCode.commit_graph_corrupted,
        reason: scenario.reason,
        branchId: TARGET_BRANCH_ID,
        commitId: scenario.commitId
      });
    });
  }
});

describe('守卫是被引用的，不是被抄了一份（FR-051「不得各写一份」）', () => {
  it('switch-branch-options.ts 从 commit-graph-guard 引入那个符号', () => {
    const source = sourceOf('switch-branch-options.ts');

    // 行为等价挡不住「照抄一份」：抄出来的那份一开始逐字段相同，
    // 直到某次只改了守卫、没改抄件——而那一刻两边的用例都还是绿的。
    expect(source).toMatch(/import\s*\{[^}]*\bassertCommitGraphIntact\b[^}]*\}\s*from\s*'[^']*commit-graph-guard\.js'/);
  });

  it('switch-branch-options.ts 自己不构造 CommitGraphCorruptedError', () => {
    const source = sourceOf('switch-branch-options.ts');

    expect(source).not.toMatch(/new\s+CommitGraphCorruptedError/);
  });

  it('switch-branch-options.ts 里没有自己那份 reason 字面量', () => {
    const source = sourceOf('switch-branch-options.ts');

    // 四个 reason 里任何一个出现在这里，都意味着有人在 switch 侧又判了一次。
    const leaked = [
      'branch_marked_corrupted',
      'fingerprint_mismatch',
      'change_set_count_mismatch',
      'missing_commit'
    ].filter(reason => source.includes(reason));
    expect(leaked).toEqual([]);
  });
});

describe('拒绝时不改指针、不删记录（FR-022/051）', () => {
  it('目标分支 ref 的四个字段原样保留', async () => {
    const scene = createSwitchScene();
    commitOf(scene, 'target-root').contentFingerprint = 'fp-tampered';

    await captureRejection(switchTo(scene));

    // 「回退到上一个校验通过的 commit」能让切换成功，代价是用户切过去看到的
    // 是一份被悄悄截短的历史。
    expect({
      headCommitId: refOf(scene, TARGET_BRANCH_ID).headCommitId,
      headRevision: refOf(scene, TARGET_BRANCH_ID).headRevision,
      status: refOf(scene, TARGET_BRANCH_ID).status,
      generation: refOf(scene, TARGET_BRANCH_ID).generation
    }).toEqual({ headCommitId: TARGET_HEAD, headRevision: 3, status: 'ok', generation: 2 });
  });

  it('五条 commit 与它们的 changeSet 一行不少', async () => {
    const scene = createSwitchScene();
    commitOf(scene, 'target-root').contentFingerprint = 'fp-tampered';

    await captureRejection(switchTo(scene));

    // 坏记录是诊断的全部依据。清掉它，下一次切换会一路走到底然后报别的错，
    // 而真正的病因再也拿不到了。
    expect({
      commits: (scene.probe.rowsOf(Commit) as Commit[]).map(row => row.id).sort(),
      changeSets: scene.probe.rowsOf(CommitChangeSet).length
    }).toEqual({
      commits: ['source-head', 'source-root', 'target-head', 'target-mid', 'target-root'],
      changeSets: 5
    });
  });

  it('一个字节都没写出去：没有新行、没有 UPDATE', async () => {
    const scene = createSwitchScene();
    commitOf(scene, 'target-root').contentFingerprint = 'fp-tampered';

    await captureRejection(switchTo(scene));

    // 守卫要在**切之前**跑完。跑在切之后就只能靠回滚兜底，而 FR-022 说的是
    // 「不改指针」——不是「改了再撤回」。active 分支与 activation revision 都走裸 SQL，
    // 发了任何一条就意味着指针已经动过。
    expect(scene.probe.saved).toEqual([]);
    expect(scene.probe.statements.map(normalizeSql).filter(sql => sql.startsWith('update'))).toEqual([]);
  });

  it('不在调用方的事务里把目标分支标成损坏', async () => {
    const scene = createSwitchScene();
    commitOf(scene, 'target-root').contentFingerprint = 'fp-tampered';

    await captureRejection(switchTo(scene));

    // 调用方一定会回滚，标记跟着一起消失：用户看到切换失败，库里什么记录都没留。
    expect({
      status: refOf(scene, TARGET_BRANCH_ID).status,
      corruptedAt: refOf(scene, TARGET_BRANCH_ID).corruptedAt
    }).toEqual({ status: 'ok', corruptedAt: null });
  });
});

describe('「切离」损坏分支不受影响（FR-051、SC-013）', () => {
  it('当前分支已被标记 corrupted_read_only，切去健康分支照样放行', async () => {
    const scene = createSwitchScene();
    refOf(scene, SCENE_BRANCH_ID).status = 'corrupted_read_only';
    refOf(scene, SCENE_BRANCH_ID).corruptedAt = new Date('2026-01-02T00:00:00.000Z');

    // 反过来把当前分支也校验一遍，用户就被锁死在坏分支上——而「切离」恰恰是
    // FR-051 明文允许的三件事之一（另两件是读当前投影与导出诊断）。
    await expect(switchTo(scene)).resolves.toBeUndefined();
  });

  it('当前分支可达损坏，切去健康分支照样放行，且一次都没去读它的历史', async () => {
    const scene = createSwitchScene();
    commitOf(scene, 'source-root').contentFingerprint = 'fp-tampered';

    await expect(switchTo(scene)).resolves.toBeUndefined();

    // 「读了但没判」与「没读」在这一格上行为相同，但前者迟早会被顺手用上，
    // 而那一步没有任何测试拦得住；更直接的是，来源分支的链一旦被遍历，
    // 上面那条 `resolves` 就只能靠「判定恰好没接上」才成立。
    const visited = scene.probe.finds
      .filter(call => call.entity === 'CommitChangeSet')
      .flatMap(call => call.where.rules.map(rule => (rule as { value?: unknown }).value));
    expect(visited).not.toContain('source-root');
    expect(visited).not.toContain(SOURCE_HEAD);
  });

  it('目标分支是刚跑完 0004 的空分支时放行', async () => {
    const scene = createSwitchScene();
    refOf(scene, TARGET_BRANCH_ID).headCommitId = null;
    refOf(scene, TARGET_BRANCH_ID).headRevision = 0;

    // 「没有 HEAD」不是损坏：一次都没提交过的库就是这个状态，
    // 判它等于让启用能力本身变成一次破坏性变更。
    await expect(switchTo(scene)).resolves.toBeUndefined();
  });

  it('损坏校验不受 requireClean 开关左右——两道前置各判各的', async () => {
    const scene = createSwitchScene();
    commitOf(scene, 'target-root').contentFingerprint = 'fp-tampered';

    // 合成一个函数之后，调用方显式关掉 clean 检查（FR-017 允许，历史子系统的回放路径
    // 正是这么调的）会顺带把损坏守卫一起关掉，于是那条路径可以切进一份重放不出来的历史。
    await captureRejection(switchTo(scene));
    await expect(
      assertSwitchBranchPreconditions(scene.probe.executor, { requireClean: false })
    ).resolves.toBeUndefined();
  });
});
