/**
 * @fileoverview T101 红测试：restore 在**任何持久写入之前**选定确定性物化路径，并校验
 * 路径上**每个** ChangeSet 的目标实体与 codec 版本都与当前客户端相等；拒绝时持久状态
 * 零变化，错误稳定返回首个不兼容 commit ID、重放方向、实体与版本 manifest；检查期间
 * 不解码后续 ChangeSet（FR-033、FR-050）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/restore-precheck.ts`。
 *
 * ## 为什么这条不能靠 codec 自己报错
 *
 * `working-tree-patch-codec.ts` 上两个方向**不对称**：
 *
 * - `encodeWorkingTreePatch()` 解析不到目标实体时抛 `UnknownWorkingTreePatchEntityError`。
 * - `decodeWorkingTreePatch()` 解析不到时**原样返回**（`if (!metadata) return { ...shaped }`）。
 *
 * 而 restore 走的恰好是 decode 方向。于是没有预检时，一个引用了本客户端已经不认识的实体
 * 的历史 commit 会**静默地**被物化成工作树条目——条目里躺着一份没解码的 patch，`status()`
 * 照常把它算进 dirty，`commit()` 照常把它写进新的 ChangeSet。整条链上没有任何一步报错，
 * 用户得到的是一份内容已经变形、但看起来一切正常的提交。
 *
 * 这个不对称不是缺陷：decode 的入参来自数据库，原样返回是读端对脏数据的容错。要堵的是
 * **restore 这一条路径**，堵法是先检查、后写入，而不是把 decode 改成抛错。
 *
 * ## 为什么预检要收一份 codec 上下文
 *
 * 「本客户端认不认得这个实体」这个问题只有**当前库的** `schemaManager` 能回答——实体元数据
 * 按 `(name, namespace)` 索引在每个 `RxDB` 实例自己的注册表里，既不挂在 `TransactionExecutor`
 * 上，也没有模块级的全局登记簿。于是预检与 `commitWorkingTree()` 同形：executor 之后紧跟
 * 一份上下文。给的是 `context.codec`（只含解析器）而不是整个 `context`——预检不建行，
 * 拿不到 `entityManager` 才让「它不会写」在签名上就成立。
 *
 * ## 三个退化写法
 *
 * 1. **只检查目标节点。** 「我要恢复到 X，那就检查 X」——可实际被读取和应用的是 HEAD 到 X
 *    之间的**每一个**节点的 inverse patch。中间任何一个引用了不认识的实体，物化结果就已经
 *    错了，而目标节点自己干干净净。FR-050 的第一句话针对的就是这条。
 * 2. **边写边检查。** 走到第 7 个 ChangeSet 才发现不兼容，前 6 个已经落进工作树了。
 *    「那就回滚」——可 FR-033 的措辞是「拒绝时所有持久状态 MUST 零变化」，而回滚在
 *    revision 与自增序列上留下的痕迹与从未写过不同。
 * 3. **报最后一个（或随便一个）不兼容节点。** 用户拿到的 commit ID 决定他接下来去哪找
 *    原因；路径上有两个不兼容节点时报第二个，他会去查一个**本来就到不了**的节点。
 *    「首个」必须是重放顺序上的首个，而且要稳定。
 */

import { RXDB_CHANGE_CODEC_VERSION } from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { restoreWorkingTree, type WorkingTreeRestoreOptions } from '../../working-tree/restore-command.js';
import {
  checkRestoreCompatibility,
  type RestoreCompatibility,
  type RestoreIncompatibility
} from '../../working-tree/restore-precheck.js';
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

const HEAD = 'commit-head';
const MIDDLE = 'commit-middle';
const TARGET = 'commit-target';

/** 本客户端**没有**注册的实体名；引用它的 ChangeSet 就是一个不兼容节点。 */
const GHOST = 'Ghost';

/** 场景实体的 namespace，与 `working-tree-scene.ts` 里的 `SceneNote` 一致。 */
const NAMESPACE = 'app';

/**
 * 造一个引用了未注册实体的**自洽** commit。
 *
 * @remarks
 * 行仍然由 {@link seedCommit} 造（它内部走 `buildCommitRows()`）：`contentFingerprint` 与
 * `changeSetCount` 必须由写路径自己算出来，否则 T038 的图守卫会先一步判损坏，
 * 而本文件想测的预检一次都跑不到。
 * 「不兼容」在这里的物理含义只有一个——`namespace.entity` 在当前客户端解析不到，
 * 而这正是 `resolveTargetMetadata()` 返回 `undefined` 的那一种。
 */
const seedGhostCommit = (scene: WorkingTreeScene, id: string, parentIds: readonly string[], entity: string): void => {
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId: `${id}-ghost-unit`,
    transactionId: null,
    namespace: NAMESPACE,
    entity,
    entityId: `ghost-${id}`,
    operation: 'update',
    patch: { whatever: '改后' },
    inversePatch: { whatever: '改前' },
    baseFingerprint: 'fp-base',
    origin: 'local'
  };
  seedCommit(scene, id, parentIds, [{ ...base, fingerprint: computeChangeUnitFingerprint(base) }]);
};

/** 三节点历史：TARGET ← MIDDLE ← HEAD，clean 工作树。 */
const sceneWithPath = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
  seedCommit(scene, TARGET);
  seedCommit(scene, MIDDLE, [TARGET]);
  seedCommit(scene, HEAD, [MIDDLE]);
  return scene;
};

const credentialsOf = (scene: WorkingTreeScene): WorkingTreeRestoreOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

/** 取拒绝出口；拿到兼容说明预检压根没看这个节点。 */
const expectIncompatible = (result: RestoreCompatibility): RestoreIncompatibility => {
  if (result.ok) throw new Error(`期望判为不兼容，实际拿到：${JSON.stringify(result)}`);
  return result.incompatible;
};

describe('检查覆盖完整重放路径，而不只是目标节点（FR-050）', () => {
  it('不兼容节点夹在中间时照样拦住——它既不是目标也不是 HEAD', async () => {
    const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
    seedCommit(scene, TARGET);
    seedGhostCommit(scene, MIDDLE, [TARGET], GHOST);
    seedCommit(scene, HEAD, [MIDDLE]);

    const incompatible = expectIncompatible(
      await checkRestoreCompatibility(scene.probe.executor, scene.context.codec, { commitId: TARGET })
    );

    // 一条断言同时杀掉两种抄近路：「只看目标」会放行（TARGET 干净），
    // 「只看 HEAD」也会放行（HEAD 干净）。实际被读取并应用的是 MIDDLE 的 inverse patch。
    expect(incompatible.commitId).toBe(MIDDLE);
  });

  it('整条路径都兼容时放行，并报出它选定的那条路径', async () => {
    const scene = sceneWithPath();

    const result = await checkRestoreCompatibility(scene.probe.executor, scene.context.codec, { commitId: TARGET });

    // 负向锚：没有这一条，上面那组的绿可以来自「预检对所有输入都判不兼容」。
    // 顺带钉住「确定性物化路径」——路径是**选定的**，所以它必须能被报出来。
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.path].sort()).toEqual([HEAD, MIDDLE].sort());
  });

  it('路径上有两个不兼容节点时，报重放顺序上的第一个', async () => {
    const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
    seedCommit(scene, TARGET);
    seedGhostCommit(scene, MIDDLE, [TARGET], GHOST);
    seedGhostCommit(scene, HEAD, [MIDDLE], `${GHOST}Two`);

    const incompatible = expectIncompatible(
      await checkRestoreCompatibility(scene.probe.executor, scene.context.codec, { commitId: TARGET })
    );

    // 恢复祖先 = 从 HEAD 往回逐个应用 inverse patch，所以重放顺序上的第一个是 HEAD。
    // 报 MIDDLE 的话，用户会去查一个**本来就到不了**的节点——第一个就已经挡住了。
    expect({ commitId: incompatible.commitId, direction: incompatible.direction }).toEqual({
      commitId: HEAD,
      direction: 'reverse'
    });
  });
});

describe('拒绝时持久状态零变化（FR-033）', () => {
  it('预检本身不写任何东西', async () => {
    const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
    seedCommit(scene, TARGET);
    seedGhostCommit(scene, MIDDLE, [TARGET], GHOST);
    seedCommit(scene, HEAD, [MIDDLE]);

    await checkRestoreCompatibility(scene.probe.executor, scene.context.codec, { commitId: TARGET });

    // 「检查」这个词本身就是只读的承诺；预检若顺手写了状态行，
    // 它就没法被 restore 之外的入口（比如 UI 的「能不能恢复」预览）安全复用。
    expect({ saved: scene.probe.saved.length, statements: scene.probe.statements.length }).toEqual({
      saved: 0,
      statements: 0
    });
  });

  it('restore 撞上不兼容时，条目、会话、revision 三样都没动', async () => {
    const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
    seedCommit(scene, TARGET);
    seedGhostCommit(scene, MIDDLE, [TARGET], GHOST);
    seedCommit(scene, HEAD, [MIDDLE]);
    const before = {
      entries: entryRowsOf(scene).length,
      revision: stateRowOf(scene).workingTreeRevision,
      entryCount: stateRowOf(scene).entryCount
    };

    const result = await restoreWorkingTree(
      scene.probe.executor,
      scene.context,
      { commitId: TARGET },
      credentialsOf(scene)
    );

    // 「边写边检查、发现了再回滚」在行数上看不出区别，直到 revision 或自增序列
    // 留下痕迹——而 FR-033 要的是「零变化」，不是「变化后复原」。
    expect(result.ok).toBe(false);
    expect({
      entries: entryRowsOf(scene).length,
      revision: stateRowOf(scene).workingTreeRevision,
      entryCount: stateRowOf(scene).entryCount,
      sessions: scene.probe.rowsOf(WorkingTreeRestoreSession).length
    }).toEqual({ ...before, sessions: 0 });
  });

  it('不兼容是一个失败出口，而不是一个抛出来的异常', async () => {
    const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
    seedCommit(scene, TARGET);
    seedGhostCommit(scene, MIDDLE, [TARGET], GHOST);
    seedCommit(scene, HEAD, [MIDDLE]);

    const result = await restoreWorkingTree(
      scene.probe.executor,
      scene.context,
      { commitId: TARGET },
      credentialsOf(scene)
    );

    // 与 CommitConflict 同形：失败是返回值，靠 reason 判别（见 T098）。
    // 抛异常的话，「这个历史版本恢复不了」与「库坏了」在调用点长得一模一样。
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('incompatible_schema');
  });
});

describe('错误内容稳定，够用户自己查下去（FR-050）', () => {
  it('带上首个不兼容 commit、重放方向、实体与版本 manifest', async () => {
    const scene = createWorkingTreeScene({ headCommitId: HEAD, headRevision: 3 });
    seedCommit(scene, TARGET);
    seedGhostCommit(scene, MIDDLE, [TARGET], GHOST);
    seedCommit(scene, HEAD, [MIDDLE]);

    const incompatible = expectIncompatible(
      await checkRestoreCompatibility(scene.probe.executor, scene.context.codec, { commitId: TARGET })
    );

    // 四样缺一不可：没有 commitId 用户不知道查哪个节点；没有 direction 不知道该看
    // patch 还是 inversePatch；没有实体不知道是哪张表；没有 manifest 不知道该升客户端
    // 还是该降数据。FR-050 说的「稳定」指的就是这四样每次都在。
    expect(incompatible).toEqual({
      commitId: MIDDLE,
      direction: 'reverse',
      namespace: NAMESPACE,
      entity: GHOST,
      manifest: { codecVersion: RXDB_CHANGE_CODEC_VERSION, entityResolved: false }
    });
  });

  it('manifest 报的是当前客户端的 codec 版本，不是从数据里读回来的', () => {
    // 版本不匹配时，从数据里读回来的那个值正是**不可信**的那一个；
    // manifest 的用途是让用户比对「我这边是多少」，所以它必须来自当前进程的常量。
    expectTypeOf<RestoreIncompatibility['manifest']>().toEqualTypeOf<{
      readonly codecVersion: number;
      readonly entityResolved: boolean;
    }>();
  });

  it('预检的返回值是判别式联合，没有「既 ok 又带 incompatible」的形状', () => {
    // 两个可选字段拼出来的对象有四种取值，其中两种没有意义，而调用点的 if 只会覆盖
    // 其中一种。判别式把「检查通过但也不兼容」变成一个类型错误。
    expectTypeOf<RestoreCompatibility>().toEqualTypeOf<
      | { readonly ok: true; readonly path: readonly string[] }
      | { readonly ok: false; readonly incompatible: RestoreIncompatibility }
    >();
  });
});
