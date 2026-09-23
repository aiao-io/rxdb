/**
 * @fileoverview T113 红测试：跨标签页的静默覆盖由**持久化**的 activation CAS 挡住（FR-020）。
 *
 * @remarks
 * FR-020 是一句话两件事，两件事的共同点是「判据必须在库里」：
 *
 * 1. **切分支成功后 `activationRevision` +1，而这一次 +1 本身走 CAS。** 今天全库没有任何
 *    一处写这一列（`activation-state.ts` 的 `@fileoverview` 把递增明确记给了 US-308），
 *    于是 `status()` 交给调用方的那个 `activationRevision` 是个恒为初值的常数，而
 *    `findCommitConflict()` 的第一次比较——三次比较里最先跑的那一次——因此永远命中。
 *    这是最坏的一种失效形态：仲裁的三个位里有一个是假的，而三个都比过了。
 * 2. **普通 CRUD 认调用方捕获的 token，且每一次都现读库。** 这一半今天是通的
 *    （`write-entry.ts` › `assertActiveBranch`），本文件对它的用例是**防回归**：
 *    它们要拦的是「反正事务里能读到当前分支，直接用它不就行了」这个念头——那样写
 *    校验永不失败，代价是用户在 `feature-x` 上编辑的实体被记进 `main`（spec.md 场景 5）。
 *
 * **为什么递增只收一个数字，不收整个 token。** 这条 CAS 是一条打在激活态单例行上的
 * `UPDATE ... WHERE revision = ?`，它能比的只有这张表自己的列；分支 id 住在 `rxdb_branch`，
 * 要把它也纳入期望值就得先单独读一次那张表再比——而那一次比较落在 CAS 之外，
 * 两者之间照样能插进别人的切换，于是多出来的只有「看起来比过了」。分支身份那一半
 * 由写路径的 token 校验负责（本文件第三组），它每次现读库，管的不是同一件事。
 *
 * 与 T073（`crud-not-captured-cas.spec.ts`）的分工：那一份用的是 mock 端口，钉的是
 * 「普通写不该长出捕获型 CAS」这条签名边界；本文件用的是真场景里的真行，钉的是
 * 「判据现读库，不认内存也不认广播」。同一条 FR 的两侧，缺一侧都留得下整个失效形态。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { getEntityColumnName, getEntityMetadata, quoteSqlIdentifier, RxDBBranch } from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import {
  advanceActivationRevision,
  bumpActivationRevision,
  type ActivationBumpOutcome
} from '../../working-tree/activation-cas.js';
import { createWorkingTreeCapturePort, readActiveBranchToken } from '../../working-tree/capture-runtime.js';
import type { CommitConflict } from '../../working-tree/commit-conflict.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import {
  captureCrudWrite,
  StaleActiveBranchError,
  type ActiveBranchToken,
  type CapturedWrite
} from '../../working-tree/write-entry.js';
import { normalizeSql, setClauseOf, whereClauseOf } from '../commit/fixtures/commit-graph-probe.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  SCENE_BRANCH_ID,
  SceneNote,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 场景里那一行激活态的初值；「捕获到的那个数」就是它。 */
const CAPTURED_REVISION = 4;

/** 另一个标签页切完分支之后库里的值。 */
const OTHER_TAB_REVISION = 9;

/** 另一个标签页切过去的那条分支。 */
const OTHER_BRANCH_ID = 'feature-x';

const ACTIVATION = getEntityMetadata(WorkingTreeActivationState);
const NOTE = getEntityMetadata(SceneNote);

/**
 * 取激活态表某个字段在语句里的真实写法（加引号后小写，便于与归一化后的 SQL 比）。
 *
 * @remarks
 * 带引号取，因为本仓所有手拼 SQL 的模块都经 `quoteSqlIdentifier()` 写列名
 * （`working-tree-state-sql.ts` / `commit-capability.ts` / `write-commit.ts` / `restore-session-transitions.ts`）：
 * 裸名比对会把「按约定加引号」判成不合格，而那条约定正是列名撞上保留字那天唯一的保护。
 */
const activationColumn = (field: string): string => {
  const columnName = getEntityColumnName(ACTIVATION, field);
  if (!columnName) throw new Error(`WorkingTreeActivationState 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName).toLowerCase();
};

/** 打在激活态表上的 UPDATE，按发出顺序。 */
const activationUpdatesOf = (scene: WorkingTreeScene): string[] =>
  scene.probe.statements
    .map(normalizeSql)
    .filter(sql => sql.startsWith('update') && new RegExp(`\\b${ACTIVATION.tableName}\\b`).test(sql));

/** 本次调用在激活态表上发过的 `find()` 次数。 */
const activationFindCountOf = (scene: WorkingTreeScene): number =>
  scene.probe.finds.filter(call => call.entity === ACTIVATION.name).length;

/** 造一个装着激活态初值的场景；`rowsAffected` 决定这一次 CAS 命不命中。 */
const sceneFor = (rowsAffected: number): WorkingTreeScene =>
  createWorkingTreeScene({ activationRevision: CAPTURED_REVISION, rowsAffected });

/** 把 `ok: false` 那一支取出来；取错分支时当场炸而不是让后续断言读到 `undefined`。 */
const conflictOf = (outcome: ActivationBumpOutcome): CommitConflict => {
  if (outcome.ok) throw new Error(`期望 CAS 落空，实际拿到 activationRevision=${outcome.activationRevision}`);
  return outcome.conflict;
};

/** 把 `ok: true` 那一支取出来。 */
const revisionOf = (outcome: ActivationBumpOutcome): number => {
  if (!outcome.ok) throw new Error(`期望 CAS 命中，实际拿到 ${outcome.conflict.kind} 冲突`);
  return outcome.activationRevision;
};

/** 场景里那条 active 分支的当前 token。 */
const tokenOf = (branchId: string, activationRevision: number): ActiveBranchToken => ({ branchId, activationRevision });

/** 一次普通编辑。 */
const writeOf = (entityId: string): CapturedWrite => ({
  namespace: NOTE.namespace,
  entity: NOTE.name,
  entityId,
  operation: 'update',
  patch: { title: '改后' },
  inversePatch: { title: '改前' },
  fingerprint: `fingerprint-${entityId}`,
  origin: 'local',
  unitId: `unit-${entityId}`,
  transactionId: null,
  sourceChangeId: null
});

/** 一次走真端口的普通 CRUD 捕获；返回业务写的那个 spy 供断言「跑没跑」。 */
const captureOnce = (scene: WorkingTreeScene, token: ActiveBranchToken, entityId: string) => {
  const write = writeOf(entityId);
  const businessWrite = vi.fn(async () => 'written');
  const port = createWorkingTreeCapturePort(
    scene.probe.executor,
    { entityManager: scene.database.entityManager },
    token,
    { namespace: write.namespace, entity: write.entity, entityId: write.entityId }
  );
  return { run: () => captureCrudWrite(port, token, write, businessWrite), businessWrite };
};

/** 取这次写入被拒时抛出来的那个错误；没被拒就当场炸，而不是让断言读到 `undefined`。 */
const rejectionOf = async (promise: Promise<unknown>): Promise<StaleActiveBranchError> => {
  try {
    await promise;
  } catch (reason) {
    if (reason instanceof StaleActiveBranchError) return reason;
    throw reason;
  }
  throw new Error('期望这次写入被拒，实际成功了');
};

/** 模拟「另一个标签页切了分支」：只改库里的行，不发任何通知。 */
const otherTabSwitchedBranch = (scene: WorkingTreeScene): void => {
  const activation = scene.probe.rowsOf(WorkingTreeActivationState)[0] as WorkingTreeActivationState;
  activation.activationRevision = OTHER_TAB_REVISION;
  const [main] = scene.probe.rowsOf(RxDBBranch) as RxDBBranch[];
  main.activated = false;
  const other = scene.database.entityManager.instantiate(RxDBBranch);
  other.id = OTHER_BRANCH_ID;
  other.activated = true;
  other.local = true;
  other.remote = false;
  other.parentId = SCENE_BRANCH_ID;
  other.fromChangeId = null;
  scene.probe.seed(RxDBBranch, [other]);
};

describe('activation revision 的递增走一条持久化 CAS（FR-020）', () => {
  it('发出的是一条 UPDATE，把 revision 推到捕获值 +1', async () => {
    const scene = sceneFor(1);

    await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION);

    const updates = activationUpdatesOf(scene);
    expect(updates).toHaveLength(1);
    expect(setClauseOf(updates[0] ?? '')).toContain(
      `${activationColumn('activationRevision')} = ${CAPTURED_REVISION + 1}`
    );
  });

  it('WHERE 同时钉住常量主键与捕获到的 revision', async () => {
    const scene = sceneFor(1);

    await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION);

    // 少了 revision 那一条，这就是一条无条件覆盖：两个标签页各自 +1，后到的那个把
    // 先到的那次切换抹掉，而两边都读到 `rowsAffected = 1`。
    // 少了主键那一条，它会在某天这张表长出第二行时把两行一起改。
    const where = whereClauseOf(activationUpdatesOf(scene)[0] ?? '');
    expect({
      pinsId: where.includes(`${activationColumn('id')} = '${WORKING_TREE_ACTIVATION_STATE_ID}'`),
      pinsRevision: where.includes(`${activationColumn('activationRevision')} = ${CAPTURED_REVISION}`)
    }).toEqual({ pinsId: true, pinsRevision: true });
  });

  it('不先读一遍再加一：命中这条路径上一次都没读过激活态那张表', async () => {
    const scene = sceneFor(1);

    await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION);

    // 自己读出来的期望值恒等于当前值，CAS 于是永远命中——这比不校验更糟，
    // 因为它看起来校验过了（`commit-conflict.ts` 第 2 条同一个理由）。
    expect(activationFindCountOf(scene)).toBe(0);
  });

  it('命中时返回推进之后的那个值', async () => {
    const scene = sceneFor(1);

    expect(revisionOf(await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION))).toBe(
      CAPTURED_REVISION + 1
    );
  });

  it('一次调用只发一条语句——没有「先试再补」的第二次尝试', async () => {
    const scene = sceneFor(1);

    await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION);

    expect(scene.probe.statements).toHaveLength(1);
  });
});

describe('CAS 落空是一个 CommitConflict 值，不是异常（FR-020/035）', () => {
  it('rowsAffected 为 0 时返回 ok:false', async () => {
    const scene = sceneFor(0);

    expect((await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION)).ok).toBe(false);
  });

  it('kind 是已有的 activation_revision，不是新造的第四个取值', async () => {
    const scene = sceneFor(0);

    expect(conflictOf(await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION)).kind).toBe(
      'activation_revision'
    );
  });

  it('expected 是捕获值，actual 是库里现在的值，branchId 是当前 active 分支', async () => {
    const scene = sceneFor(0);
    const activation = scene.probe.rowsOf(WorkingTreeActivationState)[0] as WorkingTreeActivationState;
    activation.activationRevision = OTHER_TAB_REVISION;

    const conflict = conflictOf(await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION));

    // `actual` 必须现读库。回填成 `expected` 或者干脆省掉的话，诊断只剩「冲突了」，
    // 而调用方分不清「别人切过一次」与「我手上这份状态是上个世纪的」。
    expect(conflict).toEqual({
      kind: 'activation_revision',
      expected: CAPTURED_REVISION,
      actual: OTHER_TAB_REVISION,
      branchId: SCENE_BRANCH_ID
    });
  });

  it('诊断值的类型就是 CommitConflict 本身，没有并行的第二个诊断类型', async () => {
    const scene = sceneFor(0);

    const outcome = await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION);

    // T119 的原话是「扩展进已有的 CommitConflict，不重新定义类型、不新建并行诊断类型」。
    // 并行类型一旦出现，调用方就要分两路处理同一件事，而那两路迟早会各自漂移。
    if (outcome.ok) throw new Error('本用例要的是落空那一支');
    expectTypeOf(outcome.conflict).toEqualTypeOf<CommitConflict>();
  });

  it('落空之后不重试：CAS 语句从头到尾只发过一条', async () => {
    const scene = sceneFor(0);

    await bumpActivationRevision(scene.probe.executor, CAPTURED_REVISION);

    // 拿第二次读到的值再打一次 CAS，那一次必然成功——而它盖掉的正是别人刚做完的那次切换。
    expect(activationUpdatesOf(scene)).toHaveLength(1);
  });
});

describe('普通 CRUD 认捕获的 token，判据每次现读库（FR-020/039）', () => {
  it('另一个标签页推进了 activationRevision，同一个 token 的写入被拒', async () => {
    const scene = sceneFor(1);
    const token = await readActiveBranchToken(scene.probe.executor);
    otherTabSwitchedBranch(scene);

    await expect(captureOnce(scene, token, 'note-1').run()).rejects.toBeInstanceOf(StaleActiveBranchError);
  });

  it('拒绝发生在业务写之前：回调没跑，条目与 workingTreeRevision 原样', async () => {
    const scene = sceneFor(1);
    const token = await readActiveBranchToken(scene.probe.executor);
    const before = stateRowOf(scene).workingTreeRevision;
    otherTabSwitchedBranch(scene);

    const { run, businessWrite } = captureOnce(scene, token, 'note-1');
    await expect(run()).rejects.toThrow();

    expect({
      businessWriteCalls: businessWrite.mock.calls.length,
      entries: entryRowsOf(scene).length,
      revision: stateRowOf(scene).workingTreeRevision
    }).toEqual({ businessWriteCalls: 0, entries: 0, revision: before });
  });

  it('不把旧实体归到新 active 分支：两条分支下都是零条目', async () => {
    const scene = sceneFor(1);
    const token = await readActiveBranchToken(scene.probe.executor);
    otherTabSwitchedBranch(scene);

    await expect(captureOnce(scene, token, 'note-1').run()).rejects.toThrow();

    // spec.md 场景 5 点名禁止的实现是「事务里重新读一次 active branch」——那样写不会抛，
    // 而是把这条在 `main` 上编辑的记录安静地记进 `feature-x`。两条分支各数一遍，
    // 只数当前分支的话，那种实现照样报绿。
    const rows = scene.probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[];
    expect(rows.map(row => row.branchId)).toEqual([]);
  });

  it('token 过期抛的是 stale_active_branch，带得出两边的 token', async () => {
    const scene = sceneFor(1);
    const token = await readActiveBranchToken(scene.probe.executor);
    otherTabSwitchedBranch(scene);

    const error = await rejectionOf(captureOnce(scene, token, 'note-1').run());

    expect({
      code: error.code,
      expected: error.expected,
      actual: error.actual
    }).toEqual({
      code: CommitErrorCode.stale_active_branch,
      expected: tokenOf(SCENE_BRANCH_ID, CAPTURED_REVISION),
      actual: tokenOf(OTHER_BRANCH_ID, OTHER_TAB_REVISION)
    });
  });

  it('token 还有效时，条目落在捕获的那条分支上', async () => {
    const scene = sceneFor(1);
    const token = await readActiveBranchToken(scene.probe.executor);

    await expect(captureOnce(scene, token, 'note-1').run()).resolves.toBe('written');

    const rows = entryRowsOf(scene);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.branchId).toBe(token.branchId);
  });

  it('同一个端口第二次写就被拒——判据现读库，没有内存副本也没有广播', async () => {
    const scene = sceneFor(1);
    const token = await readActiveBranchToken(scene.probe.executor);
    const first = captureOnce(scene, token, 'note-1');
    await first.run();

    // 只改库里那两行，一个 `BroadcastChannel` 都没发、一次通知都没投递。
    // 校验若读的是进程内缓存（或者只在收到广播时失效），第二次写会照样成功——
    // 而那正是刷新一次页面 / 换一个 realm 之后必然发生的形态。
    otherTabSwitchedBranch(scene);

    await expect(captureOnce(scene, token, 'note-2').run()).rejects.toBeInstanceOf(StaleActiveBranchError);
  });
});

/** 递增的签名不收 token：理由见本文件 `@fileoverview`。 */
describe('递增的入参只有捕获到的那个数字', () => {
  it('第二个参数是 number，不是 ActiveBranchToken', () => {
    expectTypeOf(bumpActivationRevision).parameter(1).toEqualTypeOf<number>();
  });

  it('第一个参数是调用方那个事务的执行器——它不自己开事务', () => {
    expectTypeOf(bumpActivationRevision).parameter(0).toEqualTypeOf<TransactionExecutor>();
  });
});

/**
 * 每一次真正发生的切换都要推进这一列，与调用方有没有提 `expectedActivationRevision` 无关。
 *
 * @remarks
 * 这一支与 {@link bumpActivationRevision} 管的不是同一件事，所以它**不是** CAS：
 * 它跑在切换事务内部、跑在前置校验刚判完之后，此刻「期望值」只能由它自己读出来——
 * 而自读的期望值恒等于当前值，CAS 于是永远命中（本文件第一组第三条同一个理由）。
 * 仲裁由外面那个独占事务做掉了，这里剩下的只有「把号推上去」。
 *
 * 四条断言各挡一种会让 `A → B → A` 之后旧凭据复活的退化：
 *
 * 1. **推进被写成赋一个具体的数。** 那个数只能来自一次自读，于是两条并发切换会写下同一个号。
 * 2. **WHERE 里多钉了 revision。** 那就退回成 CAS，而它的期望值是自读的——
 *    真出现并发时后到的那条会静默地什么都没改，`rowsAffected = 0` 被当成「没事」。
 * 3. **先读一遍再写回。** 多一次往返只是代价，真正的问题是读到的值迟早会被「顺手」用上。
 * 4. **那一行不见了却走过去。** 激活态是单例行，它不在意味着装载期没跑完；
 *    静默放行等于让接下来整条切换在一个没有仲裁位的库上完成。
 */
describe('每一次切换都无条件推进 activation revision（FR-020）', () => {
  it('发出的是一条 UPDATE，把 revision 就地 +1，而不是赋一个自读来的数', async () => {
    const scene = sceneFor(1);

    await advanceActivationRevision(scene.probe.executor);

    const revision = activationColumn('activationRevision');
    const updates = activationUpdatesOf(scene);
    expect(updates).toHaveLength(1);
    expect(setClauseOf(updates[0] ?? '')).toContain(`${revision} = ${revision} + 1`);
  });

  it('WHERE 只钉常量主键——它不是 CAS，仲裁由同一个事务里的前置校验做掉了', async () => {
    const scene = sceneFor(1);

    await advanceActivationRevision(scene.probe.executor);

    const where = whereClauseOf(activationUpdatesOf(scene)[0] ?? '');
    expect({
      pinsId: where.includes(`${activationColumn('id')} = '${WORKING_TREE_ACTIVATION_STATE_ID}'`),
      pinsRevision: where.includes(activationColumn('activationRevision'))
    }).toEqual({ pinsId: true, pinsRevision: false });
  });

  it('不先读一遍再写回：整条路径上一次都没读过激活态那张表', async () => {
    const scene = sceneFor(1);

    await advanceActivationRevision(scene.probe.executor);

    expect(activationFindCountOf(scene)).toBe(0);
  });

  it('单例行不在时当场抛，不静默走过去', async () => {
    const scene = sceneFor(0);

    // 放行等于让接下来整条切换在一个没有仲裁位的库上完成，而 `status()` 照样报「已校验」。
    await expect(advanceActivationRevision(scene.probe.executor)).rejects.toThrow();
  });

  it('入参只有执行器：它没有「期望值」这个概念', () => {
    expectTypeOf(advanceActivationRevision).parameters.toEqualTypeOf<[TransactionExecutor]>();
  });
});
