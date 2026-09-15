/**
 * @fileoverview T077 红测试：`commit()` 复用 US-305 的**同一份**守卫（T038），
 * 可达损坏时拒绝、保留原 ref、不删记录（FR-051、横切约束 6、conformance-suites.md §2.5）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/commit-command.ts` 里对 `assertCommitGraphIntact()` 的调用（T084）。
 *
 * §2.5 要的是「`commit()` / `restore()` / switch-to **三条入口各自**返回
 * `commit_graph_corrupted`」。三条入口各自写一份判定也能让三条用例都绿——绿到某次
 * 只改了其中一份为止。所以这里同时从两个方向钉：
 *
 * - **行为等价**：四种损坏形态下，`commit()` 抛出的判别位与直接调守卫**逐字段相同**。
 *   单独看每一条都像巧合，四条一起就不是了——尤其 `missing_commit` 要走到父链尽头、
 *   `change_set_count_mismatch` 要去数另一张表的行。
 * - **符号同一**：`commit-command.ts` 必须 import 那个符号，且自己**不构造**
 *   `CommitGraphCorruptedError`。行为等价挡不住「照抄一份」，这一条挡得住。
 *
 * 另外三件容易走偏的：
 *
 * 1. **拒绝时顺手把库「修好」**。回退 HEAD、清掉坏记录、或把工作树清空，都能让下一次
 *    调用看起来正常——代价是用户唯一一次能导出完整诊断的机会没了，而丢掉的那部分数据
 *    没有任何地方还留着副本。FR-022 要的是相反的：保留原 ref、不删记录、拒绝操作。
 * 2. **拒绝时把分支标成损坏**。校验是只读的；落标记是另一个符号、另一个事务
 *    （见 `__tests__/commit/corruption-guard.spec.ts` 的第 3 点）。写进调用方这个
 *    即将回滚的事务里，标记会跟着一起消失，用户永远诊断不出来。
 * 3. **损坏被当成冲突返回**。`CommitConflict` 的语义是「重读重试就能好」，
 *    而损坏重试一万次也一样。这份文件因此明确钉住**损坏优先于 CAS**：
 *    两者同时成立时抛的是损坏，不是返回一个会被无限重试的冲突。
 */

import { describe, expect, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { assertCommitGraphIntact, type CommitGraphCorruptionReason } from '../../commit/commit-graph-guard.js';
import { Commit } from '../../commit/commit.entity.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from '../../working-tree/commit-command.js';
import { normalizeSql } from '../commit/fixtures/commit-graph-probe.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  seedCommit,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

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
 * 「父链指向不存在的 commit」只能这么造。反过来改 `parentIds` 指向一个编出来的 id 是
 * 造不出这种损坏的：`parentIds` 本身参与 `contentFingerprint` 的计算，改完那一行先撞上
 * `fingerprint_mismatch`，守卫根本走不到取父节点那一步——于是这一格测的其实是上一格。
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

/** 造一个 HEAD 指向三节点直链、且有一条未提交变更的场景。 */
const createChainScene = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: 'head', headRevision: 3 });
  seedCommit(scene, 'root');
  seedCommit(scene, 'mid', ['root']);
  seedCommit(scene, 'head', ['mid']);
  scene.addEntry();
  return scene;
};

/** 一组对得上场景初值的捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): CommitOptions => ({
  authorId: 'alice',
  operationId: 'op-corruption',
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次提交。 */
const commitOnce = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): Promise<CommitResult> =>
  commitWorkingTree(scene.probe.executor, scene.database.entityManager, '一次提交', credentialsOf(scene, overrides));

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

/** 四种损坏形态；每一种都要求守卫做一件不同的事。 */
interface CorruptionCase {
  readonly name: string;
  readonly corrupt: (scene: WorkingTreeScene) => void;
  readonly reason: CommitGraphCorruptionReason;
  readonly commitId: string | null;
}

const CORRUPTION_CASES: readonly CorruptionCase[] = [
  {
    name: '分支已被标记 corrupted_read_only',
    corrupt: scene => {
      refRowOf(scene).status = 'corrupted_read_only';
      refRowOf(scene).corruptedAt = new Date('2026-01-02T00:00:00.000Z');
    },
    reason: 'branch_marked_corrupted',
    commitId: 'head'
  },
  {
    // 只查 HEAD 的实现在这里是绿的：根节点在三层之外。
    name: '根节点指纹被篡改',
    corrupt: scene => {
      commitOf(scene, 'root').contentFingerprint = 'fp-tampered';
    },
    reason: 'fingerprint_mismatch',
    commitId: 'root'
  },
  {
    // 指纹仍然对得上，差异只在另一张表的行数上——要真的去数才发现得了。
    name: 'changeSetCount 与实际行数对不上',
    corrupt: scene => {
      commitOf(scene, 'mid').changeSetCount = 5;
    },
    reason: 'change_set_count_mismatch',
    commitId: 'mid'
  },
  {
    // 只查 HEAD 的实现在这里同样是绿的：断的是第二跳的父链。
    name: '父链指向不存在的 commit',
    corrupt: scene => {
      dropCommit(scene, 'root');
    },
    reason: 'missing_commit',
    commitId: 'root'
  }
];

describe('四种损坏形态下 commit() 的判别位与守卫逐字段相同（§2.5）', () => {
  for (const scenario of CORRUPTION_CASES) {
    it(`${scenario.name}：commit() 与 assertCommitGraphIntact() 给出同一个结论`, async () => {
      const viaCommand = createChainScene();
      const viaGuard = createChainScene();
      scenario.corrupt(viaCommand);
      scenario.corrupt(viaGuard);

      const fromCommand = await captureRejection(commitOnce(viaCommand));
      const fromGuard = await captureRejection(assertCommitGraphIntact(viaGuard.probe.executor, SCENE_BRANCH_ID));

      expect(verdictOf(fromCommand)).toEqual(verdictOf(fromGuard));
    });

    it(`${scenario.name}：拒绝码是 commit_graph_corrupted，reason 是 ${scenario.reason}`, async () => {
      const scene = createChainScene();
      scenario.corrupt(scene);

      const error = await captureRejection(commitOnce(scene));

      // 拒绝码写死在这里而不是只跟守卫比：两边一起改错的话，「等价」那条仍然绿。
      expect({ code: (error as { code?: unknown }).code, reason: (error as { reason?: unknown }).reason }).toEqual({
        code: CommitErrorCode.commit_graph_corrupted,
        reason: scenario.reason
      });
    });
  }
});

describe('守卫是被引用的，不是被抄了一份（T084「不另写判定」）', () => {
  it('commit-command.ts 从 commit-graph-guard 引入那个符号', () => {
    const source = sourceOf('commit-command.ts');

    // 行为等价挡不住「照抄一份」：抄出来的那份一开始逐字段相同，
    // 直到某次只改了守卫、没改抄件——而那一刻两边的用例都还是绿的。
    expect(source).toMatch(/import\s*\{[^}]*\bassertCommitGraphIntact\b[^}]*\}\s*from\s*'[^']*commit-graph-guard\.js'/);
  });

  it('commit-command.ts 自己不构造 CommitGraphCorruptedError', () => {
    const source = sourceOf('commit-command.ts');

    expect(source).not.toMatch(/new\s+CommitGraphCorruptedError/);
  });

  it('commit-command.ts 里没有自己那份 reason 字面量', () => {
    const source = sourceOf('commit-command.ts');

    // 四个 reason 里任何一个出现在这里，都意味着有人在 commit 侧又判了一次。
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
  it('ref 四个字段原样保留', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(commitOnce(scene));

    // 「回退到上一个校验通过的 commit」能让界面继续转，代价是用户的历史
    // 在他不知情的时候被换掉了。
    expect({
      headCommitId: refRowOf(scene).headCommitId,
      headRevision: refRowOf(scene).headRevision,
      status: refRowOf(scene).status,
      generation: refRowOf(scene).generation
    }).toEqual({ headCommitId: 'head', headRevision: 3, status: 'ok', generation: 1 });
  });

  it('三条 commit 与它们的 changeSet 一行不少', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(commitOnce(scene));

    // 坏记录是诊断的全部依据。清掉它，下一次调用会一路走到底然后报别的错，
    // 而真正的病因再也拿不到了。
    expect({
      commits: (scene.probe.rowsOf(Commit) as Commit[]).map(row => row.id).sort(),
      changeSets: scene.probe.rowsOf(CommitChangeSet).length
    }).toEqual({ commits: ['head', 'mid', 'root'], changeSets: 3 });
  });

  it('工作树条目与冗余列一起原样保留', async () => {
    const scene = createChainScene();
    scene.addEntry();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(commitOnce(scene));

    expect({ rows: entryRowsOf(scene).length, entryCount: stateRowOf(scene).entryCount }).toEqual({
      rows: 2,
      entryCount: 2
    });
  });

  it('一个字节都没写出去：没有新行、没有 UPDATE', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(commitOnce(scene));

    // 守卫要在**写之前**跑完。跑在写之后就只能靠回滚兜底，而 FR-022 说的是
    // 「不改指针」——不是「改了再撤回」。
    expect(scene.probe.saved).toEqual([]);
    expect(scene.probe.statements.map(normalizeSql).filter(sql => sql.startsWith('update'))).toEqual([]);
  });

  it('不在调用方的事务里把分支标成损坏', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(commitOnce(scene));

    // 调用方一定会回滚，标记跟着一起消失：用户看到操作失败，库里什么记录都没留。
    expect({ status: refRowOf(scene).status, corruptedAt: refRowOf(scene).corruptedAt }).toEqual({
      status: 'ok',
      corruptedAt: null
    });
  });
});

describe('损坏优先于 CAS（横切约束 6）', () => {
  it('凭据同时过期时抛的是损坏，不是返回一个会被无限重试的冲突', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    const error = await captureRejection(commitOnce(scene, { expectedWorkingTreeRevision: -1 }));

    // `CommitConflict` 的语义是「重读重试就能好」。在一个损坏的图上返回它，
    // 调用方会带着新读到的 revision 再来一次，然后一直这样下去。
    expect((error as { code?: unknown }).code).toBe(CommitErrorCode.commit_graph_corrupted);
  });
});

describe('孤立损坏不拦路（§2.5 第一条）', () => {
  it('够不到的那条坏记录不影响本分支提交', async () => {
    const scene = createChainScene();
    const orphan = seedCommit(scene, 'orphan');
    orphan.contentFingerprint = 'fp-tampered';

    const result = await commitOnce(scene);

    // 一条谁都够不到的坏记录对任何重放都没有影响。让它使整个库停摆，
    // 等于把「可达性是判定的全部依据」这句话作废。
    expect(result.ok).toBe(true);
  });
});

describe('守卫跑在写事务内（T084）', () => {
  it('门面 commit() 拒绝时也只开了一个事务', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(scene.manager.commit('一次提交', credentialsOf(scene)));

    // 校验单开一个只读事务、写另开一个，中间那段时间足够别人把图改坏；
    // 于是校验通过的是一张已经不存在的图。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('校验读的是本事务的 executor', async () => {
    const scene = createChainScene();
    commitOf(scene, 'root').contentFingerprint = 'fp-tampered';

    await captureRejection(commitOnce(scene));

    // 事务体内经普通 adapter 读会排在本事务**之后**（见 TransactionExecutor 的 TSDoc），
    // 读到的是本事务尚未写入前的旧图。探针的 finds 只记本事务里的读。
    expect(scene.probe.finds.some(call => call.entity === 'Commit')).toBe(true);
  });
});
