/**
 * @fileoverview T116 红测试：metadata-only 远端分支首次切换的**物化屏障**（FR-044）。
 *
 * @remarks
 * 契约见 `spec.md` FR-044 末段：把「复核 active token、目标身份、水位/scope/fingerprint、
 * 完整物化、创建 `kind=branch_baseline`、创建 ref、切换 active、递增 activation revision、
 * 删除 staging」放进**同一提交屏障**；物化依据不足则以 `branch_not_materialized` **全量回滚**、
 * 来源分支保持 active；**分页崩溃可恢复，staging 可按 attempt 清理**。
 *
 * 三个入口与 T115 的两个并排落在 `working-tree/branch-materialization.ts`（T122 的落点）：
 * `commitBranchMaterialization`、`findLatestMaterializationAttempt`、`abortMaterializationAttempt`、
 * `discardMaterializationAttempt`。T115 已经钉了这条链的前半截（classify 与逐页 staging），
 * 本文件接的是后半截——把一份**已经落全**的 staging 变成一条能切过去的分支。
 *
 * **物化那一步由调用方注入 `materialize`，本模块不认识业务实体。** 要写进投影的行来自
 * 配置的 sync scope，那份登记在宿主上；本模块把它内联的话，十张系统表的知识与整个业务
 * 实体登记就绑在了一起。注入之后「完整物化排在建 baseline 之前」也才是可观测的：
 * 用例在 `materialize` 里回看库里的 commit 表与目标 ref，两者都必须还是空的。
 * 「冻结之后本地同步配置漂没漂」同样由调用方注入 `resolveIntentDrift` 来判——配置在来源方手上。
 *
 * **activation revision 的 CAS 机制归 T119**（`bumpActivationRevision`，由 T113 钉）。本文件
 * 只断言屏障的**结果**（`result.activationRevision` 是期望值 +1）与**拒绝时的零副作用**，
 * 不去钉那条 UPDATE 的形状；CAS 落空那一支同理归 T119，探针在这里恒命中。
 *
 * 四组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **九件事被拆成两个事务**。最自然的拆法是「先物化完、再切过去」——中间崩一次，库里就
 *    留下一条投影已经换成目标分支、active 却还在来源分支的现场：用户看见的是别人的数据，
 *    而界面上的分支名是自己的。所以拒绝路径的断言一律是**零写入零语句**，不是「写了会回滚」。
 * 2. **半截 staging 被当成完整快照**。`status` 还是 `pending`、或者页数与 `pageCount` 对不上时
 *    照样往下走，正是 data-model.md §2.9 不允许的那一步。这一条与 T115 那条 `status` 断言
 *    是同一条契约的两端：那边管「不提前写 `staged`」，这边管「不认没写成 `staged` 的」。
 * 3. **复核信任入参而不是回看库里那一行**。屏障拿到的水位/scope 是调用方给的，重算一个指纹
 *    与自己给的输入比对当然恒等；必须比的是 **staging 行上冻结下来的那个**——它是分页开始
 *    那一刻的意图，中间漂过没有，只有它知道。
 * 4. **判不可续用就顺手删掉**。「反正用不了」听起来无害，代价是那份 payload 连同它的
 *    `scopeManifest` 一起消失，而诊断「上一次为什么没接上」需要的正是这两样。FR-044 把
 *    「可按 attempt 清理」写成一条**独立**能力，清理是调用方的决定，不是判定的副作用。
 */

import type { BranchMaterializationPage, EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { ACTIVE_BRANCH_KEY, branchMaterializationPageFingerprint, RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { deriveCommitOperationId } from '../../commit/commit-idempotency.js';
import { Commit } from '../../commit/commit.entity.js';
import { SYSTEM_COMMIT_MESSAGES } from '../../commit/write-commit.js';
import { RxDBPluginWorkingTree } from '../../plugin.js';
import {
  abortMaterializationAttempt,
  BranchNotMaterializedError,
  commitBranchMaterialization,
  discardMaterializationAttempt,
  findLatestMaterializationAttempt
} from '../../working-tree/branch-materialization.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeMaterializationPage } from '../../working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../../working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { StaleActiveBranchError, type ActiveBranchToken } from '../../working-tree/write-entry.js';
import { createCommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { runBranchGenerationSql } from '../working-tree/fixtures/activation-sql.js';

/** 当前 active 的来源分支；全程一格都不该动。 */
const SOURCE_BRANCH_ID = 'main';

/** 要切过去的 metadata-only 远端分支。 */
const TARGET_BRANCH_ID = 'origin/feature';

/** 本次物化尝试的 attempt id。 */
const ATTEMPT_ID = 'attempt-1';

/** 旁观的另一次尝试；本次成功或失败都不该碰到它。 */
const OTHER_ATTEMPT_ID = 'attempt-other';

/** 冻结下来的终止水位。 */
const FROZEN_WATERMARK = { changeId: 100 };

/** 冻结下来的完整配置 sync scope。 */
const SYNC_SCOPE = ['Author', 'Note', 'Tag'] as const;

/** staging 落全时的分页数。 */
const PAGE_COUNT = 3;

/** 来源分支的 HEAD。 */
const SOURCE_HEAD_COMMIT_ID = 'commit-main-head';

/** 激活态单行当前的 revision；屏障成功后应当是它 +1。 */
const ACTIVATION_REVISION = 7;

/** 代际单调源当前发放到的号；目标分支应当拿到它 +1。 */
const BRANCH_GENERATION_SEQ = 4;

/**
 * staging 行上那个指纹。
 *
 * @remarks
 * 取值不可从入参推出来，这是有意的：复核要比的是行上**冻结下来的水位与 scope**，
 * 不是拿调用方给的那两样重算一个指纹再与自己比——后者恒等，什么都证明不了。
 * 指纹在这条链路上的用途在别处（T115 的幂等与去重），屏障不该改用它当判据。
 */
const FROZEN_FINGERPRINT = 'stage-fingerprint-frozen';

/** 一个挂了 mock 适配器、已 `init()` 的宿主；十张系统表由插件贡献，必须早于 `init()` 进 `use()`。 */
function createDatabase(): RxDB {
  const database = new RxDB({
    dbName: `rxdb-materialization-barrier-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.use(() => new RxDBPluginWorkingTree(database));
  database.init();
  return database;
}

/** 造一条分支行。 */
function createBranchRow(entityManager: EntityManager, branchId: string, activated: boolean): RxDBBranch {
  const branch = entityManager.instantiate(RxDBBranch);
  branch.id = branchId;
  branch.activated = activated;
  branch.activeKey = activated ? ACTIVE_BRANCH_KEY : null;
  branch.local = branchId === SOURCE_BRANCH_ID;
  branch.remote = branchId !== SOURCE_BRANCH_ID;
  branch.parentId = branchId === SOURCE_BRANCH_ID ? null : SOURCE_BRANCH_ID;
  branch.fromChangeId = null;
  return branch;
}

/** 造一条 ref 行。 */
function createRef(
  entityManager: EntityManager,
  branchId: string,
  generation: number,
  headCommitId: string | null
): CommitBranchRef {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = branchId;
  ref.branchId = branchId;
  ref.generation = generation;
  ref.headCommitId = headCommitId;
  ref.headRevision = headCommitId === null ? 0 : 2;
  ref.status = 'ok';
  ref.corruptedAt = null;
  return ref;
}

/** 造一条工作树状态行。 */
function createState(entityManager: EntityManager, branchId: string): WorkingTreeState {
  const state = entityManager.instantiate(WorkingTreeState);
  state.id = branchId;
  state.branchId = branchId;
  state.baseHeadCommitId = SOURCE_HEAD_COMMIT_ID;
  state.workingTreeRevision = 5;
  state.entryCount = 1;
  return state;
}

/** 造来源分支的一条未提交条目。 */
function createEntry(entityManager: EntityManager, branchId: string): WorkingTreeEntry {
  const entry = entityManager.instantiate(WorkingTreeEntry);
  entry.id = `${branchId}-entry-0`;
  entry.branchId = branchId;
  entry.unitId = `${branchId}-unit-0`;
  entry.transactionId = null;
  entry.namespace = 'app';
  entry.entity = 'Note';
  entry.entityId = 'note-0';
  entry.operation = 'update';
  entry.patch = { title: '未提交的标题' };
  entry.inversePatch = { title: '原标题' };
  entry.fingerprint = 'entry-fingerprint-0';
  entry.origin = 'local';
  entry.sourceChangeId = null;
  return entry;
}

/** 造来源分支 HEAD 那个 commit。 */
function createSourceHead(entityManager: EntityManager): Commit {
  const commit = entityManager.instantiate(Commit);
  commit.id = SOURCE_HEAD_COMMIT_ID;
  commit.parentIds = [];
  commit.firstParentId = null;
  commit.kind = 'normal';
  commit.message = '来源分支的提交';
  commit.author = '作者';
  commit.createdAt = new Date(0);
  commit.operationId = 'b1c0ffee-0000-8000-8000-000000000000';
  commit.changeSetCount = 1;
  commit.contentFingerprint = `content-${SOURCE_HEAD_COMMIT_ID}`;
  return commit;
}

/** 一次 staging 尝试的形态覆盖位。 */
interface StageSpec {
  readonly attemptId: string;
  readonly targetBranchId?: string;
  readonly status?: 'pending' | 'staged' | 'aborted';
  /** 行上记的页数；与实际落库页数不一致正是第二组要测的那一支 */
  readonly pageCount?: number;
  /** 实际落库的页数；默认与 `pageCount` 相同 */
  readonly pages?: number;
  readonly fingerprint?: string;
  readonly frozenRemoteWatermark?: Record<string, unknown>;
  readonly scopeManifest?: Record<string, unknown>;
}

/** 造一条 staging 头行。 */
function createStage(entityManager: EntityManager, spec: StageSpec): WorkingTreeMaterializationStage {
  const stage = entityManager.instantiate(WorkingTreeMaterializationStage);
  stage.id = spec.attemptId;
  stage.targetBranchId = spec.targetBranchId ?? TARGET_BRANCH_ID;
  stage.frozenRemoteWatermark = spec.frozenRemoteWatermark ?? { ...FROZEN_WATERMARK };
  stage.scopeManifest = spec.scopeManifest ?? { entities: [...SYNC_SCOPE] };
  stage.fingerprint = spec.fingerprint ?? FROZEN_FINGERPRINT;
  stage.status = spec.status ?? 'staged';
  stage.pageCount = spec.pageCount ?? PAGE_COUNT;
  stage.createdAt = new Date(0);
  return stage;
}

/**
 * 造一页 staging payload。
 *
 * @remarks
 * 指纹**现算**，不写字面量：屏障对每一页都复算一遍（`assertPageFingerprints`），
 * 手写的那串在第一页就会被判成 `stage_tampered`，于是全部用例都红在同一个与自己无关的成因上。
 * 「页被改过」那一支要的是**这里算完之后再动 payload**，不是从一开始就给一对对不上的值。
 */
function createPage(
  entityManager: EntityManager,
  attemptId: string,
  pageIndex: number
): WorkingTreeMaterializationPage {
  const page = entityManager.instantiate(WorkingTreeMaterializationPage);
  page.id = `${attemptId}-page-${pageIndex}`;
  page.stageId = attemptId;
  page.pageIndex = pageIndex;
  page.payload = { rows: [{ entity: 'Note', id: `note-${pageIndex}` }] };
  page.fingerprint = branchMaterializationPageFingerprint(page.payload);
  return page;
}

/** `commitBranchMaterialization` 的入参覆盖位。 */
interface BarrierOverrides {
  readonly attemptId?: string;
  readonly targetBranchId?: string;
  readonly expectedActiveBranch?: ActiveBranchToken;
  readonly frozenRemoteWatermark?: Record<string, unknown>;
  readonly syncScope?: readonly string[];
  readonly materialize?: (pages: readonly BranchMaterializationPage[]) => Promise<void>;
  /** 来源方对「冻结之后本地同步配置漂没漂」的判定；缺省恒答没漂 */
  readonly resolveIntentDrift?: () => Promise<string | undefined>;
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly executor: TransactionExecutor;
  readonly activation: WorkingTreeActivationState;
  /** 本次调用里 `materialize` 收到的页，按到达顺序 */
  readonly applied: BranchMaterializationPage[];
  commit(overrides?: BarrierOverrides): ReturnType<typeof commitBranchMaterialization>;
  latest(): ReturnType<typeof findLatestMaterializationAttempt>;
  abort(attemptId: string): Promise<void>;
  discard(attemptId: string): Promise<void>;
  refOf(branchId: string): CommitBranchRef | undefined;
  stateOf(branchId: string): WorkingTreeState | undefined;
  stagesOf(attemptId: string): WorkingTreeMaterializationStage[];
  pagesOf(attemptId: string): WorkingTreeMaterializationPage[];
  baseline(): Commit | undefined;
}

/** 造场景时的覆盖位。 */
interface SceneOverrides {
  /** 本次尝试的 staging 形态；`null` 表示压根没有这条 attempt */
  readonly stage?: StageSpec | null;
  /** 目标分支已有的 ref；`undefined` 表示没有这一行（0004 之后同步进来的那种） */
  readonly targetRef?: { readonly generation: number; readonly headCommitId: string | null };
  /**
   * 目标分支行此刻的 `local` / `remote`；`null` 表示这一行已经没了。缺省即 prelude 判过的那个
   * metadata-only 远端形态——prelude 与屏障之间隔着 `freezeIntent` 那趟网络，这一行可能已经变了。
   */
  readonly targetBranch?: { readonly local: boolean; readonly remote: boolean } | null;
}

/**
 * 造一个「staging 已经落全、正要把目标分支切过来」的现场。
 *
 * @remarks
 * 来源分支的 ref / 工作树状态 / 未提交条目 / commit 全都布上，另外再布一条**旁观 attempt**：
 * 只给本次 attempt 布景的话，「删 staging 时没带 attempt 条件」这种写法会把两张表清空，
 * 而用例照样全绿——它要的行确实都没了。
 */
function createScene(overrides: SceneOverrides = {}): Scene {
  const database = createDatabase();
  const entityManager = database.entityManager;
  const probe = createCommitGraphProbe({
    rowsAffected: 1,
    // 代际发放的加法在库里做，紧接着的读回来也走原始语句（`activation-state.ts`），
    // 而替身不执行 SQL；不补这两下，发放当场就会因为「读回 0 行」抛错。见 `activation-sql.ts`。
    onQuery: runBranchGenerationSql
  });
  const applied: BranchMaterializationPage[] = [];

  const branches = [createBranchRow(entityManager, SOURCE_BRANCH_ID, true)];
  if (overrides.targetBranch !== null) {
    branches.push(Object.assign(createBranchRow(entityManager, TARGET_BRANCH_ID, false), overrides.targetBranch));
  }
  probe.seed(RxDBBranch, branches);
  const refs = [createRef(entityManager, SOURCE_BRANCH_ID, 1, SOURCE_HEAD_COMMIT_ID)];
  if (overrides.targetRef) {
    refs.push(
      createRef(entityManager, TARGET_BRANCH_ID, overrides.targetRef.generation, overrides.targetRef.headCommitId)
    );
  }
  probe.seed(CommitBranchRef, refs);
  probe.seed(WorkingTreeState, [createState(entityManager, SOURCE_BRANCH_ID)]);
  probe.seed(WorkingTreeEntry, [createEntry(entityManager, SOURCE_BRANCH_ID)]);
  probe.seed(WorkingTreeRestoreSession, []);
  probe.seed(Commit, [createSourceHead(entityManager)]);
  probe.seed(CommitChangeSet, []);

  const stageSpec = overrides.stage === undefined ? { attemptId: ATTEMPT_ID } : overrides.stage;
  const otherSpec: StageSpec = { attemptId: OTHER_ATTEMPT_ID, targetBranchId: 'origin/other', pages: 2, pageCount: 2 };
  const stageSpecs = stageSpec === null ? [otherSpec] : [stageSpec, otherSpec];
  probe.seed(
    WorkingTreeMaterializationStage,
    stageSpecs.map(spec => createStage(entityManager, spec))
  );
  probe.seed(
    WorkingTreeMaterializationPage,
    stageSpecs.flatMap(spec =>
      Array.from({ length: spec.pages ?? spec.pageCount ?? PAGE_COUNT }, (_unused, pageIndex) =>
        createPage(entityManager, spec.attemptId, pageIndex)
      )
    )
  );

  const activation = entityManager.instantiate(WorkingTreeActivationState);
  activation.id = WORKING_TREE_ACTIVATION_STATE_ID;
  activation.activationRevision = ACTIVATION_REVISION;
  activation.branchGenerationSeq = BRANCH_GENERATION_SEQ;
  probe.seed(WorkingTreeActivationState, [activation]);

  const rowsOf = <T>(EntityClass: Parameters<typeof probe.rowsOf>[0]): T[] => probe.rowsOf(EntityClass) as T[];

  return {
    probe,
    executor: probe.executor,
    activation,
    applied,
    commit: (barrier = {}) =>
      commitBranchMaterialization(entityManager, probe.executor, {
        attemptId: barrier.attemptId ?? ATTEMPT_ID,
        targetBranchId: barrier.targetBranchId ?? TARGET_BRANCH_ID,
        expectedActiveBranch: barrier.expectedActiveBranch ?? {
          branchId: SOURCE_BRANCH_ID,
          activationRevision: ACTIVATION_REVISION
        },
        frozenRemoteWatermark: barrier.frozenRemoteWatermark ?? { ...FROZEN_WATERMARK },
        syncScope: barrier.syncScope ?? SYNC_SCOPE,
        resolveIntentDrift: barrier.resolveIntentDrift ?? (async () => undefined),
        materialize:
          barrier.materialize ??
          (async pages => {
            applied.push(...pages);
          })
      }),
    latest: () => findLatestMaterializationAttempt(probe.executor, TARGET_BRANCH_ID),
    abort: attemptId => abortMaterializationAttempt(probe.executor, attemptId),
    discard: attemptId => discardMaterializationAttempt(probe.executor, attemptId),
    refOf: branchId => rowsOf<CommitBranchRef>(CommitBranchRef).find(row => row.id === branchId),
    stateOf: branchId => rowsOf<WorkingTreeState>(WorkingTreeState).find(row => row.id === branchId),
    stagesOf: attemptId =>
      rowsOf<WorkingTreeMaterializationStage>(WorkingTreeMaterializationStage).filter(row => row.id === attemptId),
    pagesOf: attemptId =>
      rowsOf<WorkingTreeMaterializationPage>(WorkingTreeMaterializationPage).filter(row => row.stageId === attemptId),
    baseline: () => rowsOf<Commit>(Commit).find(row => row.kind === 'branch_baseline')
  };
}

/** 屏障拒绝时必须原样成立的那一份现场；一次读出来才好整份比对。 */
const rejectionFootprintOf = (scene: Scene) => ({
  /** 目标分支没有 ref——没有 ref 就没有「切了一半」的那条分支 */
  targetRef: scene.refOf(TARGET_BRANCH_ID),
  /** 没有 baseline */
  baseline: scene.baseline(),
  /** 本次 attempt 的 staging 原样留着，可重试也可诊断 */
  stages: scene.stagesOf(ATTEMPT_ID).length,
  pages: scene.pagesOf(ATTEMPT_ID).length,
  /** 来源分支仍是唯一 active */
  active: (scene.probe.rowsOf(RxDBBranch) as RxDBBranch[]).filter(row => row.activated).map(row => row.id),
  /** 一条语句都没发——`activated` 与 `activationRevision` 都走裸 SQL，发了就意味着动过 */
  statements: scene.probe.statements.length,
  /** 代际单调源没被提前发号 */
  branchGenerationSeq: scene.activation.branchGenerationSeq
});

/** 未动过的那份现场长什么样。 */
const untouched = {
  targetRef: undefined,
  baseline: undefined,
  stages: 1,
  pages: PAGE_COUNT,
  active: [SOURCE_BRANCH_ID],
  statements: 0,
  branchGenerationSeq: BRANCH_GENERATION_SEQ
};

describe('九件事同属一道提交屏障（FR-044）', () => {
  it('成功一次：baseline、ref、工作树状态、activation revision、staging 清理一次到位', async () => {
    const scene = createScene();

    const result = await scene.commit();

    const baseline = scene.baseline();
    expect({
      kind: baseline?.kind,
      parentIds: baseline?.parentIds,
      firstParentId: baseline?.firstParentId,
      author: baseline?.author,
      message: baseline?.message,
      changeSetCount: baseline?.changeSetCount
    }).toEqual({
      kind: 'branch_baseline',
      parentIds: [],
      firstParentId: null,
      author: null,
      message: SYSTEM_COMMIT_MESSAGES.branch_baseline,
      changeSetCount: 0
    });
    expect({
      headCommitId: scene.refOf(TARGET_BRANCH_ID)?.headCommitId,
      generation: scene.refOf(TARGET_BRANCH_ID)?.generation,
      entryCount: scene.stateOf(TARGET_BRANCH_ID)?.entryCount
    }).toEqual({ headCommitId: result.baselineCommitId, generation: result.generation, entryCount: 0 });
    // 屏障的收尾两件事：推进 revision、删 staging。前者走裸 SQL（探针不把 UPDATE 作用到
    // 内存行上，形状归 T119），所以这里断言的是屏障自己交代的结果与 staging 的消失。
    // 切 active 不在屏障里：屏障跑在适配器 `switchBranch` 的 `prepare` 里，翻 active 是适配器紧随其后的那一步。
    expect(result.activationRevision).toBe(ACTIVATION_REVISION + 1);
    expect({ stages: scene.stagesOf(ATTEMPT_ID).length, pages: scene.pagesOf(ATTEMPT_ID).length }).toEqual({
      stages: 0,
      pages: 0
    });
  });

  it('代际从单调源现发，不复用也不从 1 起', async () => {
    const scene = createScene();

    const result = await scene.commit();

    // 与 T114 同一条理由：代际复用会让持旧 `(branchId, headRevision)` 的调用方误中这条分支，
    // 而 metadata-only 分支恰恰最容易被「它还没有 ref，给个 1 就行」这种写法碰上。
    expect(result.generation).toBe(BRANCH_GENERATION_SEQ + 1);
    expect(scene.activation.branchGenerationSeq).toBe(BRANCH_GENERATION_SEQ + 1);
    expect(scene.baseline()?.operationId).toBe(
      deriveCommitOperationId({ branchGeneration: result.generation, operationId: ATTEMPT_ID })
    );
  });

  it('完整物化排在建 baseline / 建 ref 之前，整份按页号顺序一次交出去', async () => {
    const scene = createScene();
    const seen: { pageIndexes: number[]; commits: number; hasRef: boolean; stages: number }[] = [];

    await scene.commit({
      materialize: async pages => {
        seen.push({
          pageIndexes: pages.map(page => page.pageIndex),
          commits: scene.probe.rowsOf(Commit).length,
          hasRef: scene.refOf(TARGET_BRANCH_ID) !== undefined,
          stages: scene.stagesOf(ATTEMPT_ID).length
        });
      }
    });

    // 建了 ref 再往投影里写，等于让一条「已经有根」的分支在物化中途对外可见；
    // 而先删 staging 再写投影，则让中途崩掉的那次既没投影也没得重试。
    // 只调一次：来源方要整份去重压缩（同一行跨页的多次变更折成一次），逐页交它就做不到。
    expect(seen).toEqual([{ pageIndexes: [0, 1, 2], commits: 1, hasRef: false, stages: 1 }]);
  });

  it('active token 过期时一个字节都不写', async () => {
    const scene = createScene();

    await expect(
      scene.commit({
        expectedActiveBranch: { branchId: SOURCE_BRANCH_ID, activationRevision: ACTIVATION_REVISION - 1 }
      })
    ).rejects.toBeInstanceOf(StaleActiveBranchError);

    // 复核排在**任何**写入之前，不是写完发现不对再撤：撤销发生在事务边界之外
    // （或者进程崩在中间）留下的是半棵切过去的工作树，而用户以为自己的操作被拒绝了。
    expect(rejectionFootprintOf(scene)).toEqual(untouched);
    expect(scene.applied).toEqual([]);
  });

  it('目标分支已经有 baseline 时判身份不符，不重复物化', async () => {
    const scene = createScene({ targetRef: { generation: 3, headCommitId: 'commit-already-there' } });

    await expect(scene.commit()).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'target_already_materialized'
    });

    // 覆盖过去会让那条分支上已经提交的历史整段失去根；跳过则更糟——active 切过去了，
    // 而投影还是上一次物化的内容。
    expect(scene.refOf(TARGET_BRANCH_ID)?.headCommitId).toBe('commit-already-there');
    expect(scene.applied).toEqual([]);
  });

  it('目标分支开拉之后被删掉、又以同名本地分支重建时判身份不符，不接管它那行空 HEAD 的 ref', async () => {
    // 无父的本地分支建出来 HEAD 就是空的，与 0004 的占位 ref 同形。屏障只看 ref 的话会把它
    // 就地接管——远端快照物化到了一条本地分支上，而那条分支的完整状态本来就在本机。
    const scene = createScene({
      targetRef: { generation: 6, headCommitId: null },
      targetBranch: { local: true, remote: false }
    });

    await expect(scene.commit()).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'target_already_materialized'
    });

    expect({ ...rejectionFootprintOf(scene), targetRef: scene.refOf(TARGET_BRANCH_ID)?.headCommitId }).toEqual({
      ...untouched,
      targetRef: null
    });
    expect(scene.applied).toEqual([]);
  });

  it('目标分支开拉之后被删掉、没有重建时整次拒绝，不对一条不存在的分支切 active', async () => {
    // 放行的话两条切换 UPDATE 里第一条照常把来源分支的 active 清掉，第二条却一行都匹配不上——
    // 库里从此没有 active 分支。
    const scene = createScene({ targetBranch: null });

    await expect(scene.commit()).rejects.toThrow(TARGET_BRANCH_ID);

    expect(rejectionFootprintOf(scene)).toEqual(untouched);
    expect(scene.applied).toEqual([]);
  });
});

describe('依据不足以 branch_not_materialized 全量回滚，来源分支保持 active（FR-044）', () => {
  it('attempt 压根不在库里', async () => {
    const scene = createScene({ stage: null });

    await expect(scene.commit()).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'stage_missing'
    });

    expect(rejectionFootprintOf(scene)).toEqual({ ...untouched, stages: 0, pages: 0 });
  });

  it('status 还是 pending——分页崩在中途的那份不是完整快照', async () => {
    const scene = createScene({ stage: { attemptId: ATTEMPT_ID, status: 'pending', pages: 2, pageCount: 0 } });

    await expect(scene.commit()).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'stage_incomplete'
    });

    // 与 T115 那条「全部页落库之前不得写 staged」是同一条契约的两端：那边管不提前写，
    // 这边管不认没写成的。只要有一端松了，半份 payload 就会被当成完整快照物化。
    expect({ ...rejectionFootprintOf(scene), pages: 0 }).toEqual({ ...untouched, pages: 0 });
    expect(scene.applied).toEqual([]);
  });

  it('落库页数与行上的 pageCount 对不上', async () => {
    const scene = createScene({ stage: { attemptId: ATTEMPT_ID, pageCount: PAGE_COUNT, pages: PAGE_COUNT - 1 } });

    await expect(scene.commit()).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'stage_incomplete'
    });

    // 只看 `status === 'staged'` 就往下走的实现在这里全绿：那一格是写页的那一方自己填的，
    // 崩在「最后一页没落库、收尾却跑完了」之间就是这个形状。
    expect(scene.applied).toEqual([]);
  });

  it('水位/scope 与冻结下来的那份对不上时判漂移，且不顺手删掉 staging', async () => {
    const scene = createScene();

    await expect(scene.commit({ frozenRemoteWatermark: { changeId: 101 } })).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'intent_drift'
    });

    // 比的必须是 staging 行上**冻结下来的**那份水位与 scope——它是分页开始那一刻的意图。
    // 拿调用方给的那两样重算一个指纹再与自己比是恒等的，于是这条断言是唯一能把
    // 「复核回看了库」与「复核自证」分开的那一条。
    expect(rejectionFootprintOf(scene)).toEqual(untouched);
  });

  it('来源方判出本地同步配置在冻结之后漂过时同样判漂移，一页都不交出去', async () => {
    const scene = createScene();

    const rejection = scene.commit({ resolveIntentDrift: async () => 'Note 的过滤条件变了' });

    // 水位与 scope 两格对得上不等于意图没漂：过滤条件、级联关系变了，按旧意图攒的那份快照
    // 照样不是这次切换要的。这一格只有来源方判得出，所以由它注入。
    await expect(rejection).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materialized,
      reason: 'intent_drift',
      message: expect.stringContaining('Note 的过滤条件变了')
    });
    expect(scene.applied).toEqual([]);
    expect(rejectionFootprintOf(scene)).toEqual(untouched);
  });

  it('被拒的是一个带成因的 BranchNotMaterializedError，不是裸 RxDBError', async () => {
    const scene = createScene({ stage: null });

    const error = await scene.commit().catch((thrown: unknown) => thrown);

    // 四个成因的分辨力全在这个类上：调用方要据此决定「重试」「重新拉一遍」还是「放弃」。
    expect(error).toBeInstanceOf(BranchNotMaterializedError);
    expect({
      branchId: (error as BranchNotMaterializedError).branchId,
      attemptId: (error as BranchNotMaterializedError).attemptId
    }).toEqual({ branchId: TARGET_BRANCH_ID, attemptId: ATTEMPT_ID });
  });
});

describe('分页崩溃可恢复、staging 可按 attempt 清理（FR-044）', () => {
  it('半截 attempt 交回行上冻结的意图、从哪一页接着拉，以及最后一页（续拉游标在它里面）', async () => {
    const scene = createScene({ stage: { attemptId: ATTEMPT_ID, status: 'pending', pageCount: 0, pages: 2 } });

    // `sealed: false` 是「还要接着拉」这句话的可观测面：只断言 `nextPageIndex` 的话，
    // 一个把半截 attempt 也报成已封口的实现照样绿，而调用方会直接跳过封口走进屏障。
    // 意图必须是**行上冻结下来的**那份：续拉用新冻结的水位，拼出来的是远端从未存在过的状态。
    expect(await scene.latest()).toMatchObject({
      attemptId: ATTEMPT_ID,
      intent: { frozenRemoteWatermark: FROZEN_WATERMARK, syncScope: [...SYNC_SCOPE] },
      nextPageIndex: 2,
      sealed: false,
      lastPage: { pageIndex: 1 }
    });
  });

  it('作废过的 attempt 不再被取到，但**不**被顺手删掉', async () => {
    const scene = createScene({ stage: { attemptId: ATTEMPT_ID, status: 'pending', pageCount: 0, pages: 2 } });

    await scene.abort(ATTEMPT_ID);

    expect(await scene.latest()).toBeNull();
    // 「反正用不了」删掉它，等于把诊断「上一次为什么没接上」需要的 `scopeManifest` 与
    // 那半份 payload 一起丢了。清理是 FR-044 单列的一条能力，是调用方的决定。
    expect({
      status: scene.stagesOf(ATTEMPT_ID).map(stage => stage.status),
      pages: scene.pagesOf(ATTEMPT_ID).length
    }).toEqual({ status: ['aborted'], pages: 2 });
  });

  it('已经落全的 attempt 同样交回，接着的是收尾不是拉页', async () => {
    const scene = createScene();

    // 「接着的是收尾不是拉页」逐字就是 `sealed: true`：光看 `nextPageIndex === PAGE_COUNT`
    // 分不出「已封口」与「还开着、只是刚好拉满」，而两者的下一步一个是屏障、一个是封口。
    expect(await scene.latest()).toMatchObject({ attemptId: ATTEMPT_ID, nextPageIndex: PAGE_COUNT, sealed: true });
  });

  it('按 attempt 清理连页一起删净，旁观的那次一行不动', async () => {
    const scene = createScene();

    await scene.discard(ATTEMPT_ID);

    expect({ stages: scene.stagesOf(ATTEMPT_ID).length, pages: scene.pagesOf(ATTEMPT_ID).length }).toEqual({
      stages: 0,
      pages: 0
    });
    // 删除没带 attempt 条件的话，两张表会被清空，而上面那条断言照样绿。
    expect({ stages: scene.stagesOf(OTHER_ATTEMPT_ID).length, pages: scene.pagesOf(OTHER_ATTEMPT_ID).length }).toEqual({
      stages: 1,
      pages: 2
    });
  });
});

describe('成功之后既不留残留，也不碰来源分支与旁观 attempt（FR-044）', () => {
  it('只清本次 attempt 的 staging，旁观那次原样留着', async () => {
    const scene = createScene();

    await scene.commit();

    expect({ stages: scene.stagesOf(OTHER_ATTEMPT_ID).length, pages: scene.pagesOf(OTHER_ATTEMPT_ID).length }).toEqual({
      stages: 1,
      pages: 2
    });
  });

  it('来源分支的 ref、工作树状态与未提交条目一格不动', async () => {
    const scene = createScene();
    const before = {
      headCommitId: scene.refOf(SOURCE_BRANCH_ID)?.headCommitId,
      headRevision: scene.refOf(SOURCE_BRANCH_ID)?.headRevision,
      generation: scene.refOf(SOURCE_BRANCH_ID)?.generation,
      baseHeadCommitId: scene.stateOf(SOURCE_BRANCH_ID)?.baseHeadCommitId,
      workingTreeRevision: scene.stateOf(SOURCE_BRANCH_ID)?.workingTreeRevision,
      entryCount: scene.stateOf(SOURCE_BRANCH_ID)?.entryCount,
      entries: scene.probe.rowsOf(WorkingTreeEntry).length
    };

    await scene.commit();

    // 切走不是清理：来源分支那条未提交条目要在切回来的时候还在（FR-017 的「两条分支之间
    // 不共享可变 HEAD 或工作树」，反过来也意味着切换不得代为丢弃）。
    expect({
      headCommitId: scene.refOf(SOURCE_BRANCH_ID)?.headCommitId,
      headRevision: scene.refOf(SOURCE_BRANCH_ID)?.headRevision,
      generation: scene.refOf(SOURCE_BRANCH_ID)?.generation,
      baseHeadCommitId: scene.stateOf(SOURCE_BRANCH_ID)?.baseHeadCommitId,
      workingTreeRevision: scene.stateOf(SOURCE_BRANCH_ID)?.workingTreeRevision,
      entryCount: scene.stateOf(SOURCE_BRANCH_ID)?.entryCount,
      entries: scene.probe.rowsOf(WorkingTreeEntry).length
    }).toEqual(before);
  });

  it('0004 留下的那行占位 ref 被就地接管，不新建第二行', async () => {
    const scene = createScene({ targetRef: { generation: 2, headCommitId: null } });

    const result = await scene.commit();

    // 两行同主键在真库上是一次唯一约束冲突，在探针上却只是表里多一行——所以这条要数行数。
    // 就地接管时代际沿用已经发过的那个，不再重发：那一行的代际早已被别处引用过。
    const refs = (scene.probe.rowsOf(CommitBranchRef) as CommitBranchRef[]).filter(
      row => row.branchId === TARGET_BRANCH_ID
    );
    expect(refs.length).toBe(1);
    expect({ generation: refs[0]?.generation, headCommitId: refs[0]?.headCommitId }).toEqual({
      generation: 2,
      headCommitId: result.baselineCommitId
    });
    expect(result.generation).toBe(2);
    expect(scene.activation.branchGenerationSeq).toBe(BRANCH_GENERATION_SEQ);
  });
});
