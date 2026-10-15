/**
 * @fileoverview 接管一次切到 metadata-only 分支的切换：六段流水线本身（FR-044/049）。
 *
 * @remarks
 * `materialization-barrier.spec.ts` 钉的是第六段——一份**已经落全**的 staging 怎么变成一条
 * 切过去的分支。本文件钉的是它前面那五段，以及把六段串起来的那条编排线
 * （`working-tree/materialize-branch.ts`）。两者分开是因为要钉的性质根本不同：屏障要的是
 * 「九件事同生共死」，而编排要的恰恰相反——**六段分属不同的事务边界**，中间还夹着网络 I/O。
 *
 * 四组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **该不该接管判错了**。判据只有一条：目标是不是 `metadata_only`。判松了（比如照
 *    `headCommitId === null` 判）会把 `enable()` 之前的每一条**本地**分支送进远端物化路径；
 *    判漏了（比如先问有没有来源）会让每一个没装同步层的库连普通切换都做不了。这两种都不抛，
 *    它们只是走错了路。
 * 2. **把六段塞进一个事务**。塞进去之后本文件除了事务计数以外的断言**全部照样绿**，代价要到
 *    分页崩溃那天才显形：崩在第 7 页，回滚的是从头行起的全部 7 页，下一次只能从 0 重来——
 *    而「崩在分页中途还留得住」正是 FR-044 给这条路径的唯一设计目标。同一个错的另一面是把
 *    `freezeIntent()` 拉进事务里：它要问远端，握着写事务不放会把整个库锁到超时。
 * 3. **续用判成了重来**。来源方判「没漂」的那份 staging 必须接着拉（`fromPageIndex` 不是 0），
 *    已经封口的那份必须直接进屏障。猜错的两侧都会硬失败，但报出来的成因
 *    （`stage_incomplete`）说的都不是真正发生的事。
 * 4. **前置条件在物化路径上静默失效**。这次切换从此不再经过 `prepareBranchSwitch`，
 *    `requireClean` / `expectedActivationRevision` 的落点是第一段那笔只读事务与屏障——
 *    漏掉之后两个选项在这条路上什么都不做，而调用方拿到的是一次「成功」的切换。
 *
 * 来源经 `rxdb.branchMaterializationSource()` 登记，与生产上同步插件的登记走同一个槽位；
 * 屏障经适配器 `switchBranch()` 的 `prepare` 跑，替身的 `switchBranch` 因此照真适配器的次序
 * 在一笔事务里 await 它。
 *
 * 场景复用 `createWorkingTreeScene()`：它布的正是「已启用能力 + 一条 active 本地 main +
 * ref + 工作树状态 + 激活态单行」。本文件只额外布**目标那条远端分支行**与各用例自己的 staging。
 */

import type {
  BranchMaterializationIntent,
  BranchMaterializationPagePayload,
  BranchMaterializationPageRequest,
  BranchMaterializationSource,
  RxDB,
  RxDBBranchSwitchTakeoverContext,
  RxDBSystemContribution,
  SwitchVersionActions
} from '@aiao/rxdb';
import { branchMaterializationPageFingerprint, RxDBBranch, RxDBError } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { WORKING_TREE_CAPABILITY } from '../../capability-identity.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { CommitGraphCorruptedError } from '../../commit/commit-graph-guard.js';
import { Commit } from '../../commit/commit.entity.js';
import { BranchNotMaterializedError } from '../../working-tree/branch-materialization.js';
import { takeOverBranchSwitchWithMaterialization } from '../../working-tree/materialize-branch.js';
import { WorkingTreeDirtyError } from '../../working-tree/switch-branch-options.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeMaterializationPage } from '../../working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../../working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { StaleActiveBranchError } from '../../working-tree/write-entry.js';
import { runBranchGenerationSql } from '../working-tree/fixtures/activation-sql.js';
import {
  createWorkingTreeScene,
  SCENE_BRANCH_ID,
  type WorkingTreeScene
} from '../working-tree/fixtures/working-tree-scene.js';

/** 要切过去的 metadata-only 远端分支；场景里只有它的分支行，没有 ref、没有工作树状态。 */
const TARGET_BRANCH_ID = 'origin/feature';

/** 一条**本地**的旁观分支，带完整 ref——「目标本来就已物化」那一支拿它当目标。 */
const MATERIALIZED_BRANCH_ID = 'feature-local';

/** 来源方冻结下来的终止水位。 */
const FROZEN_WATERMARK = { changeId: 100 };

/** 来源方冻结下来的完整配置 sync scope。 */
const SYNC_SCOPE = ['Author', 'Note', 'Tag'] as const;

/** 造一页快照：指纹**现算**，落库那一步会当场复算一遍再比。 */
const pageOf = (pageIndex: number): BranchMaterializationPagePayload => {
  const payload = { rows: [{ entity: 'Note', id: `note-${pageIndex}` }] };
  return { payload, fingerprint: branchMaterializationPageFingerprint(payload) };
};

/** 一个记账型的来源替身：谁在什么时候被调了、当时手上开着几笔事务。 */
interface SourceSpy extends BranchMaterializationSource {
  /** `freezeIntent()` 被调时，适配器上已经开过的事务笔数 */
  readonly freezeSeenTransactions: number[];
  /** `pages()` 收到的每一次请求 */
  readonly requests: BranchMaterializationPageRequest[];
  /** 每一页交出去的那一刻，适配器上已经开过的事务笔数 */
  readonly yieldSeenTransactions: number[];
  /** `projectPage()` 收到的页序，按到达顺序 */
  readonly projected: number[];
  /** `settle()` 被调的次数 */
  readonly settled: number[];
}

/** 造来源替身时的覆盖位。 */
interface SourceOptions {
  /** 一共交几页，默认 3 */
  readonly pageCount?: number;
  /** 交到第几页时抛；`undefined` 表示不抛 */
  readonly throwAtPage?: number;
  /** 交出第 N 页**之前**跑一次；用来在分页中途改现场 */
  readonly beforePage?: (pageIndex: number) => void;
  /** `freezeIntent()` 返回之前跑一次；同上 */
  readonly beforeFreeze?: () => void;
  /** `freezeIntent()` 抛这个；`undefined` 表示不抛 */
  readonly freezeFailure?: Error;
  /** 来源方对一份意图的漂移判定；缺省是「水位不是本次冻结那份就算漂」 */
  readonly driftOf?: (intent: BranchMaterializationIntent) => string | undefined;
}

/** 分页中途那次失败抛的东西；要认得出它原样挂在编排层抛出的错误上。 */
const PAGE_FAILURE = new Error('第 2 页拉失败');

/** 缺省的漂移判定：行上冻结的水位不是本次那份，就当远端配置在那之后变过。 */
const driftByWatermark = (intent: BranchMaterializationIntent): string | undefined =>
  intent.frozenRemoteWatermark['changeId'] === FROZEN_WATERMARK.changeId ? undefined : '冻结水位不是本次这一份';

/** 来源方给第 N 页算出的投影：一条插入，键里带页号，好在 `mergeChanges` 的入参里认出来。 */
const projectionOf = (pageIndex: number): SwitchVersionActions => ({
  deletes: new Map(),
  updates: new Map(),
  inserts: new Map([[`public:Note:note-${pageIndex}`, { patch: { id: `note-${pageIndex}` }, inversePatch: null }]])
});

/**
 * 造一个记账型来源。
 *
 * @param scene - 用来读「现在开过几笔事务」的场景
 * @param options - 见 {@link SourceOptions}
 * @returns 见 {@link SourceSpy}
 *
 * @remarks
 * 记的是**事务笔数**而不是「有没有在事务里」：后者要替身自己去猜当前有没有活着的事务，
 * 而这里真正要钉的两件事都是**相对**的——`freezeIntent()` 之后、第一页之前必须多开一笔
 * （开头行），每交出一页之后必须再多一笔（那一页各自落库）。笔数一路记下来，
 * 这两条就都成了可断言的差值，而「六段共用一笔事务」的实现会让整串差值恒为 0。
 */
function createSource(scene: WorkingTreeScene, options: SourceOptions = {}): SourceSpy {
  const pageCount = options.pageCount ?? 3;
  const freezeSeenTransactions: number[] = [];
  const requests: BranchMaterializationPageRequest[] = [];
  const yieldSeenTransactions: number[] = [];
  const projected: number[] = [];
  const settled: number[] = [];
  const driftOf = options.driftOf ?? driftByWatermark;
  const openedTransactions = (): number => scene.adapter.transaction.mock.calls.length;

  return {
    freezeSeenTransactions,
    requests,
    yieldSeenTransactions,
    projected,
    settled,
    freezeIntent: async () => {
      freezeSeenTransactions.push(openedTransactions());
      options.beforeFreeze?.();
      if (options.freezeFailure) throw options.freezeFailure;
      return { frozenRemoteWatermark: { ...FROZEN_WATERMARK }, syncScope: [...SYNC_SCOPE] };
    },
    pages: (request: BranchMaterializationPageRequest) => {
      requests.push(request);
      return (async function* () {
        for (let pageIndex = request.fromPageIndex; pageIndex < pageCount; pageIndex += 1) {
          if (pageIndex === options.throwAtPage) throw PAGE_FAILURE;
          options.beforePage?.(pageIndex);
          yieldSeenTransactions.push(openedTransactions());
          yield pageOf(pageIndex);
        }
      })();
    },
    resolveIntentDrift: async ({ intent }) => driftOf(intent),
    projectPage: async ({ page }) => {
      projected.push(page.pageIndex);
      return projectionOf(page.pageIndex);
    },
    settle: async () => {
      settled.push(openedTransactions());
    }
  };
}

/** 一份要塞进库里的旧 staging。 */
interface StageSeed {
  readonly attemptId: string;
  readonly status: 'pending' | 'staged' | 'aborted';
  /** 实际落库的页数；`staged` 时它同时写进行上的 `pageCount` */
  readonly pages: number;
  /** 行上冻结的水位；不给就是本次意图那一份（于是可续用） */
  readonly frozenRemoteWatermark?: Record<string, unknown>;
}

/** 往场景里塞一份旧 staging（头行 + 它那几页）。 */
function seedStage(scene: WorkingTreeScene, seed: StageSeed): void {
  const { entityManager } = scene.database;
  const stage = entityManager.instantiate(WorkingTreeMaterializationStage);
  stage.id = seed.attemptId;
  stage.targetBranchId = TARGET_BRANCH_ID;
  stage.frozenRemoteWatermark = seed.frozenRemoteWatermark ?? { ...FROZEN_WATERMARK };
  stage.scopeManifest = { entities: [...SYNC_SCOPE] };
  stage.fingerprint = `fingerprint-${seed.attemptId}`;
  stage.status = seed.status;
  stage.pageCount = seed.status === 'staged' ? seed.pages : 0;
  stage.createdAt = new Date('2026-01-01T00:00:00.000Z');
  scene.probe.seed(WorkingTreeMaterializationStage, [stage]);

  scene.probe.seed(
    WorkingTreeMaterializationPage,
    Array.from({ length: seed.pages }, (_unused, pageIndex) => {
      const { payload, fingerprint } = pageOf(pageIndex);
      const row = entityManager.instantiate(WorkingTreeMaterializationPage);
      row.id = `${seed.attemptId}-page-${pageIndex}`;
      row.stageId = seed.attemptId;
      row.pageIndex = pageIndex;
      row.payload = payload;
      row.fingerprint = fingerprint;
      return row;
    })
  );
}

/**
 * 造一个「main 是 active、origin/feature 只有 metadata」的现场。
 *
 * @returns 装好种子的场景
 *
 * @remarks
 * 目标那条分支行是 `local: false` / `remote: true` 且**没有 ref**——这两件事合起来才是
 * `metadata_only` 的题面（`classifyBranchMaterialization`）。只不给 ref 的话它是一条
 * 「迁移没跑完」的本地分支，判定当场抛；只把 `remote` 拨上去而留着 ref，它就是一条
 * 已经物化的远端分支。旁观的 {@link MATERIALIZED_BRANCH_ID} 两样都全，
 * 「目标本来就已物化」那一支拿它当目标。
 *
 * 代际发放那两条语句由 `runBranchGenerationSql` 替布景执行：屏障末尾要给目标分支发一个
 * 新代际，而探针不执行 SQL——不补这两下，成功那一支会红在「读回 0 行」上。
 */
function createTakeoverScene(): WorkingTreeScene {
  const scene = createWorkingTreeScene({ onQuery: runBranchGenerationSql });
  const { entityManager } = scene.database;

  const target = entityManager.instantiate(RxDBBranch);
  target.id = TARGET_BRANCH_ID;
  target.activated = false;
  target.local = false;
  target.remote = true;
  target.parentId = null;
  target.fromChangeId = null;

  const sibling = entityManager.instantiate(RxDBBranch);
  sibling.id = MATERIALIZED_BRANCH_ID;
  sibling.activated = false;
  sibling.local = true;
  sibling.remote = false;
  sibling.parentId = SCENE_BRANCH_ID;
  sibling.fromChangeId = null;
  scene.probe.seed(RxDBBranch, [target, sibling]);

  const siblingRef = entityManager.instantiate(CommitBranchRef);
  siblingRef.id = MATERIALIZED_BRANCH_ID;
  siblingRef.branchId = MATERIALIZED_BRANCH_ID;
  siblingRef.generation = 2;
  siblingRef.headCommitId = 'commit-sibling-head';
  siblingRef.headRevision = 1;
  siblingRef.status = 'ok';
  siblingRef.corruptedAt = null;
  scene.probe.seed(CommitBranchRef, [siblingRef]);

  // 真适配器在一笔事务里解析出目标分支、await `prepare`、再翻 active；替身照这个次序走前两步。
  // 翻 active 走裸 SQL，探针不执行，所以第三步省掉不影响任何断言。
  scene.adapter.switchBranch.mockImplementation(async ({ branchId, prepare }) => {
    await scene.adapter.transaction(executor => prepare({ executor, targetBranchId: branchId ?? '' }));
  });

  return scene;
}

/** 造一次接管现场；`preconditions` 不给就是调用方什么都没提。 */
const contextOf = (
  targetBranchId: string = TARGET_BRANCH_ID,
  preconditions?: RxDBBranchSwitchTakeoverContext['preconditions']
): RxDBBranchSwitchTakeoverContext => ({
  currentBranchId: SCENE_BRANCH_ID,
  targetBranchId,
  preconditions
});

/**
 * 跑一次接管；`source` 为 `null` 时这条连接上没有登记来源。
 *
 * @remarks
 * 登记走 `rxdb.branchMaterializationSource()`——生产上同步插件在 `install()` 里调的就是它。
 */
const takeOver = (
  scene: WorkingTreeScene,
  source: BranchMaterializationSource | null,
  context: RxDBBranchSwitchTakeoverContext = contextOf()
) => {
  if (source) scene.database.branchMaterializationSource(source);
  return takeOverBranchSwitchWithMaterialization(scene.database, context);
};

/** 接一次拒绝，把错误交出来。 */
const captureRejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('这次调用本该被拒，却成功返回了');
};

/**
 * 目标分支此刻在库里留下的全部痕迹；一次读出来才好整份比对。
 *
 * @remarks
 * 收尾那两件事——切 active、推进 activation revision——都走裸 SQL，而探针只记语句、不把
 * UPDATE 作用到内存行上（形状归 T119 与 `materialization-barrier.spec.ts`）。所以这里读的是
 * 「写出来的行」加上一个**语句计数**：被拒的那几支上它必须是 0，而 0 条语句是比
 * 「`activated` 列没变」强得多的一条——后者在探针底下恒成立，钉了也白钉。
 */
const targetFootprintOf = (scene: WorkingTreeScene) => {
  const rows = <T>(EntityClass: Parameters<typeof scene.probe.rowsOf>[0]): T[] =>
    scene.probe.rowsOf(EntityClass) as T[];
  return {
    ref: rows<CommitBranchRef>(CommitBranchRef).find(row => row.id === TARGET_BRANCH_ID),
    state: rows<WorkingTreeState>(WorkingTreeState).find(row => row.id === TARGET_BRANCH_ID),
    baseline: rows<Commit>(Commit).find(row => row.kind === 'branch_baseline'),
    statements: scene.probe.statements.length
  };
};

/** 还没动过目标分支时，{@link targetFootprintOf} 长什么样。 */
const untouchedTarget = {
  ref: undefined,
  state: undefined,
  baseline: undefined,
  statements: 0
};

/** 取本次 attempt 在库里留下的 staging 形态。 */
const stagingOf = (scene: WorkingTreeScene) => {
  const stages = scene.probe.rowsOf(WorkingTreeMaterializationStage) as WorkingTreeMaterializationStage[];
  const pages = scene.probe.rowsOf(WorkingTreeMaterializationPage) as WorkingTreeMaterializationPage[];
  return {
    stages: stages.length,
    status: stages[0]?.status,
    pages: pages.length,
    pageIndexes: pages.map(row => row.pageIndex).sort((left, right) => left - right)
  };
};

describe('该不该接管这次切换（FR-044/049）', () => {
  it('未启用提交能力的库照常走普通切换，来源一次都不碰', async () => {
    const scene = createTakeoverScene();
    // 未启用的库整套语义都是短路的（FR-037/046）：它没有 ref 行、没有 staging 行，
    // 这条路径对它无从谈起。判能力位排在判物化状态之前，否则 `classifyBranchMaterialization`
    // 会拿一张还不存在的表去判一条它读不出来的分支。
    (scene.probe.rowsOf(CommitCapabilityState)[0] as CommitCapabilityState).enabled = false;
    const source = createSource(scene);

    expect(await takeOver(scene, source)).toBe('not_applicable');
    expect(source.freezeSeenTransactions).toEqual([]);
  });

  it('目标本来就已物化时照常走普通切换——这条连接没登记来源也不算错', async () => {
    const scene = createTakeoverScene();

    // 判物化状态**先于**判有没有来源。反过来的话，每一个没装同步层的库连切到一条
    // 早就在本地的分支都会被 `source_unavailable` 拒掉。
    expect(await takeOver(scene, null, contextOf(MATERIALIZED_BRANCH_ID))).toBe('not_applicable');
  });

  it('目标只有 metadata 而这条连接没登记来源：拒，并说得出下一步', async () => {
    const scene = createTakeoverScene();

    const error = await captureRejection(takeOver(scene, null));

    expect(error).toBeInstanceOf(BranchNotMaterializedError);
    expect({
      code: (error as BranchNotMaterializedError).code,
      reason: (error as BranchNotMaterializedError).reason,
      attemptId: (error as BranchNotMaterializedError).attemptId
    }).toEqual({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'source_unavailable',
      // 一次尝试都还没开始，所以没有 attempt 可清理、可续用——报一个编出来的 id 会让
      // 调用方拿着它去 `discardMaterializationAttempt()`，而那一次删中的可能是别人的。
      attemptId: null
    });
    expect(stagingOf(scene).stages).toBe(0);
  });

  it('工作树脏时 requireClean 照样拦得住，且拦在问远端之前', async () => {
    const scene = createTakeoverScene();
    scene.addEntry();
    const source = createSource(scene);

    const error = await captureRejection(takeOver(scene, source, contextOf(TARGET_BRANCH_ID, { requireClean: true })));

    expect(error).toBeInstanceOf(WorkingTreeDirtyError);
    // 这次切换从此不再经过 `prepareBranchSwitch`，前置条件的唯一落点就是第一段那笔只读事务。
    // 漏掉之后两个选项在这条路径上静默失效，而调用方拿到的是一次「成功」的切换。
    //
    // 「拦在问远端之前」是独立的一条：判在拉完之后同样拒得掉，代价是一整份快照白拉，
    // 而库里还留下一份没人接得上的 staging。
    expect(source.freezeSeenTransactions).toEqual([]);
    expect(stagingOf(scene).stages).toBe(0);
  });

  it('expectedActivationRevision 对不上时同样拦在问远端之前', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene);

    const error = await captureRejection(
      takeOver(scene, source, contextOf(TARGET_BRANCH_ID, { expectedActivationRevision: 99 }))
    );

    expect(error).toBeInstanceOf(StaleActiveBranchError);
    expect(source.freezeSeenTransactions).toEqual([]);
  });

  it('拉页期间工作树变脏：屏障里再过一遍 requireClean，切换整笔回滚、staging 留着', async () => {
    const scene = createTakeoverScene();
    // 第一段那次判定与屏障之间隔着整趟拉页；这段时间里用户照样能编辑。只判一次的话，
    // 调用方要的「干净才切」在这条路径上退化成「开拉那一刻干净就切」。
    const source = createSource(scene, { beforePage: pageIndex => pageIndex === 1 && void scene.addEntry() });

    const error = await captureRejection(takeOver(scene, source, contextOf(TARGET_BRANCH_ID, { requireClean: true })));

    expect(error).toBeInstanceOf(WorkingTreeDirtyError);
    expect(source.projected).toEqual([]);
    expect(stagingOf(scene)).toEqual({ stages: 1, status: 'staged', pages: 3, pageIndexes: [0, 1, 2] });
  });
});

describe('六段流水线各自的事务边界（FR-044）', () => {
  it('成功一次：baseline、ref、工作树状态、active、activation revision 一次到位', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene);

    expect(await takeOver(scene, source)).toBe('switched');

    const footprint = targetFootprintOf(scene);
    expect({
      headCommitId: footprint.ref?.headCommitId,
      generation: footprint.ref?.generation,
      refStatus: footprint.ref?.status,
      stateBranchId: footprint.state?.branchId,
      baselineKind: footprint.baseline?.kind
    }).toEqual({
      headCommitId: footprint.baseline?.id,
      // 场景里的单调源停在 1，目标分支拿到的是它 +1；沿用来源分支那个代际的话，
      // 两条分支的 `branch_baseline` 会算出同一个幂等键。
      generation: 2,
      refStatus: 'ok',
      stateBranchId: TARGET_BRANCH_ID,
      baselineKind: 'branch_baseline'
    });
    // 九件事的最后一件：本次 attempt 的 staging 清空，页与头行都不留。推进 activation
    // revision 走裸 SQL，形状由屏障自己的 spec 钉（T119）；编排这一层只需要知道屏障
    // **跑到了最后一步**，而 staging 的消失就是它跑完的凭据。
    expect(stagingOf(scene)).toEqual({ stages: 0, status: undefined, pages: 0, pageIndexes: [] });
    expect(source.projected).toEqual([0, 1, 2]);
  });

  it('屏障跑在适配器 switchBranch 的 prepare 里，投影由来源方算、按页经 mergeChanges 落下', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene);

    await takeOver(scene, source);

    // 切换只发一次，且不带动作：目标分支的投影全部在 `prepare` 里落，适配器随后只翻 active。
    // 带着「从来源分支算出来的」动作切过去的话，那份动作是按一条还没有历史的分支算的——空的。
    expect(scene.adapter.switchBranch).toHaveBeenCalledTimes(1);
    const [options] = scene.adapter.switchBranch.mock.calls[0];
    expect({
      branchId: options.branchId,
      actionCount: options.actions.deletes.size + options.actions.updates.size + options.actions.inserts.size
    }).toEqual({ branchId: TARGET_BRANCH_ID, actionCount: 0 });
    // 撤掉来源分支投影的那一批在这个场景里是空的（main 一条变更都没有），空批不发；
    // 其余三批各一次、都关着触发器——物化出来的行不是用户的编辑，不该进变更日志。
    const merged = (scene.probe.executor.mergeChanges as ReturnType<typeof vi.fn>).mock.calls;
    expect(merged.map(([actions, , disableTriggers]) => [[...actions.inserts.keys()], disableTriggers])).toEqual(
      [0, 1, 2].map(pageIndex => [[`public:Note:note-${pageIndex}`], true])
    );
    // `settle` 在屏障那笔事务里、全部投影落下之后跑一次：同步水位要与这份快照一起提交或一起回滚。
    expect(source.settled).toEqual([scene.adapter.transaction.mock.calls.length]);
  });

  it('适配器没调 prepare 时不当成功：明说切换已提交而物化一页没落', async () => {
    const scene = createTakeoverScene();
    scene.adapter.switchBranch.mockImplementation(async () => undefined);

    const error = await captureRejection(takeOver(scene, createSource(scene)));

    // 这是一条适配器违约，事后已经补救不了（切换事务已经提交），能做的只有把它大声报出来。
    expect(error).toBeInstanceOf(RxDBError);
    expect((error as Error).message).toContain('options.prepare');
  });

  it('freezeIntent() 失败：source_failed，一行 staging 都不留，原始错误挂在 cause 上', async () => {
    const scene = createTakeoverScene();
    const failure = new Error('远端不可达');
    const source = createSource(scene, { freezeFailure: failure });

    const error = await captureRejection(takeOver(scene, source));

    expect(error).toBeInstanceOf(BranchNotMaterializedError);
    expect({
      reason: (error as BranchNotMaterializedError).reason,
      attemptId: (error as BranchNotMaterializedError).attemptId,
      cause: (error as BranchNotMaterializedError).cause
    }).toEqual({ reason: 'source_failed', attemptId: null, cause: failure });
    expect(stagingOf(scene).stages).toBe(0);
    expect(targetFootprintOf(scene)).toEqual(untouchedTarget);
  });

  it('freezeIntent() 跑在任何事务之外，而开头行紧跟在它之后', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene);

    await takeOver(scene, source);

    // 第一段那笔只读事务已经开过（所以是 1），而它已经关了——`freezeIntent()` 要问远端，
    // 握着写事务不放会把整个库锁到超时。第一页交出来时是 2：中间多的那一笔正是开头行，
    // 它必须在**拉之前**落下，否则崩在第一页之前就没有一条可按 attempt 清理的记录。
    expect(source.freezeSeenTransactions).toEqual([1]);
    expect(source.yieldSeenTransactions[0]).toBe(2);
  });

  it('每页各一笔事务，封口与屏障各再一笔', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene, { pageCount: 3 });

    await takeOver(scene, source);

    // 交出第 N 页时开过的笔数逐页 +1：上一页**提交之后**才去拉下一页，于是任何时刻
    // 库里那批页都是「已经确认落盘的前缀」。攒在内存里最后一把写的实现会让这三个数
    // 恒等，而它恰恰把「崩在分页中途还留得住」这唯一的设计目标抹掉了。
    expect(source.yieldSeenTransactions).toEqual([2, 3, 4]);
    // 1 只读前奏 + 1 开头行 + 3 页 + 1 封口 + 1 屏障。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(7);
  });

  it('崩在第 2 页：前两页留在库里，目标分支一个字都没落', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene, { pageCount: 5, throwAtPage: 2 });

    const error = await captureRejection(takeOver(scene, source));

    // 网络失败翻译成稳定的 `branch_not_materialized`，原始错误挂在 `cause` 上：调用方按错误码
    // 分支，而「稍后重试还是放弃」要看的类型与状态码还在。
    expect(error).toBeInstanceOf(BranchNotMaterializedError);
    expect({
      reason: (error as BranchNotMaterializedError).reason,
      cause: (error as BranchNotMaterializedError).cause
    }).toEqual({ reason: 'source_failed', cause: PAGE_FAILURE });
    // 头行仍是 `pending`，两页留着：下一次切换从第 2 页接着拉。循环体里把异常吞掉
    // 继续拉的实现会留下一份页号带洞的 staging，而洞要到封口那一刻才被发现。
    expect(stagingOf(scene)).toEqual({ stages: 1, status: 'pending', pages: 2, pageIndexes: [0, 1] });
    // 失败**不清 staging**：那半份 payload 连同 `scopeManifest` 正是诊断「上一次为什么没接上」
    // 需要的东西，清理是调用方的决定（`discardMaterializationAttempt()`），不是失败的副作用。
    expect(targetFootprintOf(scene)).toEqual(untouchedTarget);
  });

  it('拉页期间别的连接切了分支：屏障的 token 复核落空，staging 原样留着', async () => {
    const scene = createTakeoverScene();
    const source = createSource(scene, {
      pageCount: 3,
      // 第一段捕获 token、第六段复核它，中间隔着整个分页过程——这一格模拟的正是那段时间里
      // 另一条连接切过一次分支。改激活态而不是改 `activated` 列：CAS 卡的是 revision，
      // 而探针的 `rowsAffected` 恒为 1，光改分支行的话 CAS 照样命中。
      beforePage: pageIndex => {
        if (pageIndex !== 1) return;
        (scene.probe.rowsOf(WorkingTreeActivationState)[0] as WorkingTreeActivationState).activationRevision = 42;
      }
    });

    const error = await captureRejection(takeOver(scene, source));

    expect(error).toBeInstanceOf(StaleActiveBranchError);
    // 三页都落全了、也封了口——失败发生在屏障的第一步，所以这份 staging 是完整可用的，
    // 下一次重来时会被整份续用（只剩收尾）。顺手删掉它等于让那一次从 0 重拉。
    expect(stagingOf(scene)).toEqual({ stages: 1, status: 'staged', pages: 3, pageIndexes: [0, 1, 2] });
    expect(targetFootprintOf(scene)).toEqual(untouchedTarget);
  });
});

describe('续用一份意图相同的旧 staging（FR-044）', () => {
  it('接着上次那份拉，不从第 0 页重来', async () => {
    const scene = createTakeoverScene();
    seedStage(scene, { attemptId: 'attempt-old', status: 'pending', pages: 2 });
    const source = createSource(scene, { pageCount: 4 });

    expect(await takeOver(scene, source)).toBe('switched');

    // `fromPageIndex` 这一格就是「可续拉」的全部：不给的话，续用只能从头拉一遍，而崩在
    // 第 900 页的那次尝试留下的 900 页会被原样重写——留得住也就没有意义了。
    // 续拉请求带着上一页：来源方的游标（比如 keyset 的最后一个 id）在它的 payload 里。
    expect(source.requests.map(request => [request.fromPageIndex, request.previousPage?.pageIndex])).toEqual([[2, 1]]);
    expect(source.projected).toEqual([0, 1, 2, 3]);
    // 没有开出第二份头行，也没有另开一笔去查：查 staging 在第一段那笔只读事务里。
    // 1 只读前奏 + 2 页 + 1 封口 + 1 屏障。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(1 + 2 + 1 + 1);
  });

  it('续用沿用行上冻结的意图，不重新冻结一份', async () => {
    const scene = createTakeoverScene();
    seedStage(scene, { attemptId: 'attempt-old', status: 'pending', pages: 1 });
    const source = createSource(scene, { pageCount: 2 });

    await takeOver(scene, source);

    // 重新冻结的水位会比行上的新，接着拉下来的后半截与已落库的前半截属于两个时刻——
    // 拼出来的是一份从未在远端存在过的状态。续用那一刻连问都不该问。
    expect(source.freezeSeenTransactions).toEqual([]);
    expect(source.requests.map(request => request.intent)).toEqual([
      { frozenRemoteWatermark: FROZEN_WATERMARK, syncScope: [...SYNC_SCOPE] }
    ]);
  });

  it('来源方判漂移的那份不接：作废它、另开一份，旧的连页留着', async () => {
    const scene = createTakeoverScene();
    seedStage(scene, {
      attemptId: 'attempt-other-watermark',
      status: 'pending',
      pages: 2,
      frozenRemoteWatermark: { changeId: 7 }
    });
    const source = createSource(scene, { pageCount: 1 });

    expect(await takeOver(scene, source)).toBe('switched');

    expect(source.requests.map(request => request.fromPageIndex)).toEqual([0]);
    // 本次那份在屏障末尾被清掉，旧的那份置成 `aborted`、连同它的两页留着——下一次不会再
    // 取到它，而诊断「上一次为什么没接上」要的 payload 与 `scopeManifest` 还在。清理**带
    // attempt 条件**，不带的话两张表会被清空，而「本次的没了」照样成立。
    expect(stagingOf(scene)).toEqual({
      stages: 1,
      status: 'aborted',
      pages: 2,
      pageIndexes: [0, 1]
    });
    // 1 只读前奏 + 1 作废旧的 + 1 开头行 + 1 页 + 1 封口 + 1 屏障。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(6);
  });

  it('已经封口的那份直接进屏障：不再拉页，也不再封一次口', async () => {
    const scene = createTakeoverScene();
    seedStage(scene, { attemptId: 'attempt-sealed', status: 'staged', pages: 2 });
    const source = createSource(scene);
    const pages = vi.spyOn(source, 'pages');

    expect(await takeOver(scene, source)).toBe('switched');

    // 「接着的是收尾不是拉页」逐字就是 `sealed`。猜错的两侧都会硬失败，但报出来的成因
    // （`stage_incomplete`）说的都不是真正发生的事：接着拉是把新页写进一个 `staged` 的头行，
    // 再封一次口则是对一个已经封好的头行调 `requirePendingStage()`。
    expect(pages).not.toHaveBeenCalled();
    expect(source.projected).toEqual([0, 1]);
    // 1 只读前奏（含查 staging）+ 1 屏障；中间那几段一段都没跑。
    expect(scene.adapter.transaction).toHaveBeenCalledTimes(2);
  });
});

describe('这条路径接在哪两个钩子上（plugin.ts）', () => {
  /** 取本插件登记进宿主的那份系统贡献。 */
  const contributionOf = (scene: WorkingTreeScene): RxDBSystemContribution => {
    const contribution = scene.database.systemContributions.find(entry => entry.capability === WORKING_TREE_CAPABILITY);
    if (!contribution) throw new Error('本插件的系统贡献没进宿主');
    return contribution;
  };

  /** 让 `localAdapterIfConnected` 答某个值；断连就是 `undefined`。 */
  const pretendConnected = (scene: WorkingTreeScene, adapter: unknown): void => {
    vi.spyOn(scene.database, 'localAdapterIfConnected', 'get').mockReturnValue(
      adapter as RxDB['localAdapterIfConnected']
    );
  };

  /** 本次失败上下文里那个「这条分支的历史重放不出来」。 */
  const corruption = (): CommitGraphCorruptedError =>
    new CommitGraphCorruptedError(SCENE_BRANCH_ID, 'commit-broken', 'missing_commit');

  /** 目标分支 ref 此刻的损坏两列。 */
  const corruptionMarkOf = (scene: WorkingTreeScene) => {
    const ref = (scene.probe.rowsOf(CommitBranchRef) as CommitBranchRef[]).find(row => row.id === SCENE_BRANCH_ID);
    return { status: ref?.status, corruptedAt: ref?.corruptedAt };
  };

  /** 还没落过标记时，{@link corruptionMarkOf} 长什么样。 */
  const unmarked = { status: 'ok', corruptedAt: null };

  /** 造一次切换失败现场。 */
  const failureOf = (error: unknown) => ({
    currentBranchId: SCENE_BRANCH_ID,
    targetBranchId: TARGET_BRANCH_ID,
    error
  });

  it('takeOverBranchSwitch 每次现取来源，所以装配之后才登记的那个也算数', async () => {
    const scene = createTakeoverScene();
    const contribution = contributionOf(scene);
    // 登记发生在 `use()` 之后：同步插件在每个连接期的 `install()` 里登记，重连时换一个新的。
    // 而系统贡献这个对象是在插件的**字段初始化器**里造的，比这早得多——取一次存下来的写法在这里
    // 永远读到 `undefined`，于是每一次切到远端分支都是 `source_unavailable`，而那条错还理直气壮。
    scene.database.branchMaterializationSource(createSource(scene));

    expect(await contribution.takeOverBranchSwitch(contextOf())).toBe('switched');
  });

  it('settleBranchSwitchFailure 在回滚之后另开一笔把损坏标记落住', async () => {
    const scene = createTakeoverScene();
    const contribution = contributionOf(scene);
    pretendConnected(scene, scene.adapter);

    await contribution.settleBranchSwitchFailure(failureOf(corruption()));

    // 判定发生在那次注定回滚的切换事务里，本钩子是回滚**之后**唯一还能写库的时点：
    // 标记落在那笔事务内的话，它会跟着回滚一起消失，于是每次重试都重新扫一遍全图，
    // 而「什么时候开始坏的」这个诊断永远缺席。
    expect(corruptionMarkOf(scene)).toEqual({ status: 'corrupted_read_only', corruptedAt: expect.any(Date) });
  });

  it('不是损坏的那些原样放过，一笔事务都不开', async () => {
    const scene = createTakeoverScene();
    const contribution = contributionOf(scene);
    pretendConnected(scene, scene.adapter);

    await contribution.settleBranchSwitchFailure(failureOf(new WorkingTreeDirtyError(SCENE_BRANCH_ID, 3)));

    expect(corruptionMarkOf(scene)).toEqual(unmarked);
    expect(scene.adapter.transaction).not.toHaveBeenCalled();
  });

  it('断连期间直接返回，不等适配器接回来', async () => {
    const scene = createTakeoverScene();
    const contribution = contributionOf(scene);
    pretendConnected(scene, undefined);

    // 这一条钉的是「它**决**」本身：取 `localAdapterIfConnected` 而不是
    // `await firstValueFrom(localAdapter$)`，后者在断连期间永远不决——而本函数跑在 catch 里、
    // 紧接着要把原始错误重新抛出去，挂在这里等于把一次失败的切换变成一个永不返回的 promise。
    await expect(contribution.settleBranchSwitchFailure(failureOf(corruption()))).resolves.toBeUndefined();
    expect(corruptionMarkOf(scene)).toEqual(unmarked);
  });

  it('落标记自己失败了也不顶替掉原来那个错', async () => {
    const scene = createTakeoverScene();
    const contribution = contributionOf(scene);
    const busy = new Error('database is busy');
    scene.adapter.transaction.mockRejectedValue(busy);
    pretendConnected(scene, scene.adapter);

    // 从这里抛出去的任何东西都会顶替掉调用方手上那个真正的错误，于是用户拿到的是
    // 「落标记时数据库忙」，而不是「这条分支的历史重放不出来」。落标记是**附加**的。
    await expect(contribution.settleBranchSwitchFailure(failureOf(corruption()))).resolves.toBeUndefined();
  });
});
