/**
 * @fileoverview T115 红测试：metadata-only 远端分支的识别与首次 switch 的 durable staging（FR-044/049）。
 *
 * @remarks
 * 契约见 `spec.md` FR-044：`syncBranches()` 只同步 metadata 时**不得提前伪造 baseline/ref**；
 * 承接 FR-049，没有 `CommitBranchRef` 的 metadata-only 远端分支**不是空 HEAD**；其首次 switch
 * MUST 用**独立 durable staging** 冻结目标分支、终止水位和**完整配置** sync scope，逐页持久化
 * payload/fingerprint 且**不触碰当前投影**。
 *
 * **两个入口钉在 `working-tree/branch-materialization.ts`（T122 的落点）**：
 * `classifyBranchMaterialization(executor, branchId)` 与
 * `stageBranchMaterialization(entityManager, executor, input)`。第一个参数是 `EntityManager` 而不是
 * 从 executor 上摸，与 `createBranchCommitRows` / `writeBranchRows` 同一个手法——多个库共用同一个
 * 实体类时 `new WorkingTreeMaterializationStage()` 判断不出目标库。
 *
 * **本文件不 import `@aiao/rxdb-plugin-sync`。** `syncBranches()` 长在那个包里，而本包不依赖它；
 * 为一个测试加一条包依赖会在 nx 图上多出一条真实的边（图插件把静态 import 映射成依赖边），
 * 而这里要验的本来就是**本包这一侧**：远端分支行落库之后，本包的读路径怎么理解它。那一行的
 * 形状逐字照抄 `rxdb-plugin-sync/src/sync-branches.ts` 的 `branchRepository.create(...)`
 * （`activated:false / activeKey:null / local:false / remote:true`），`syncBranches` 自己的行为由
 * 它那个包的 `sync-branches.spec.ts` 守着。
 *
 * 四组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **「读不到 ref」被降级成「空历史」**。`readCommitBranchRef()` 今天对缺行的判词是
 *    「迁移没跑完」——对**本地**分支这是对的，对同步进来的远端分支却是错的：它压根不该有 ref
 *    （FR-049）。两种成因共用一个出口，接下来只有两条路，一条比一条糟：要么把远端分支也当成
 *    损坏，切过去直接报错；要么给缺行补一个 `headCommitId: null` 的 ref，于是本地凭空宣称
 *    「这条远端分支是空的」，而它真正的首次物化会发现自己已经有根了。
 * 2. **「`headCommitId === null` 即 metadata-only」**。这个写法在远端分支上给出正确答案，却会把
 *    **本地**分支（0004 建行、enable 之前 head 恒为 null）一并送进远端物化路径——那条路要拉远端
 *    payload，而本地分支的完整状态就在本机。
 * 3. **把整份快照攒在内存里，最后一把 `saveMany`**。所有断言（页都在、`pageCount` 对、指纹对）
 *    照样全绿，代价要到分页崩溃那天才显形：FR-044 要求「分页崩溃可恢复」，而没落库的页恢复不了。
 *    同一条线上还有 `status`：全部页落库**之前**写 `staged`，等于宣布一份半截 payload 可用，
 *    正是 data-model.md §2.9 那句「不允许把半份 payload 当成完整快照物化」。
 * 4. **水位与 scope 现读而不是冻结**。「冻结终止水位」写成存一个引用，调用方那份水位在分页期间
 *    照常推进，staging 就变成一份跨越多个水位的拼接；而 `scopeManifest` 写成「这次有页的那几个
 *    实体」时，一个当时恰好没有行的实体会从清单里消失，续用判定于是把一份**范围更窄**的旧 attempt
 *    判成可续用。
 */

import type { EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { ACTIVE_BRANCH_KEY, RxDB, RxDBBranch, RxDBError, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { RxDBPluginWorkingTree } from '../../plugin.js';
import {
  classifyBranchMaterialization,
  stageBranchMaterialization,
  type BranchMaterializationPagePayload
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
import { createCommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 当前 active 的本地分支；整个第三、四组里它一格都不该动。 */
const SOURCE_BRANCH_ID = 'main';

/** 同步进来的 metadata-only 远端分支；首次 switch 要为它物化。 */
const REMOTE_BRANCH_ID = 'origin/feature';

/** 本次物化尝试的 attempt id。 */
const ATTEMPT_ID = 'attempt-1';

/**
 * **完整配置**的 sync scope。
 *
 * @remarks
 * 三个实体里只有 `Note` 会在本次分页里出现行——`scopeManifest` 仍必须把三个都写上。
 * 写成「这次有页的那几个实体」的话，续用判定会把一份范围更窄的旧 attempt 判成可续用。
 */
const SYNC_SCOPE = ['Author', 'Note', 'Tag'] as const;

/** 本次 staging 的分页数。 */
const PAGE_COUNT = 3;

/** attempt 开始那一刻的终止水位；分页期间调用方那份会继续推进。 */
const FROZEN_WATERMARK = { changeId: 100 } as const;

/** 一个挂了 mock 适配器、已 `init()` 的宿主；十张系统表由插件贡献，必须早于 `init()` 进 `use()`。 */
function createDatabase(): { database: RxDB; plugin: RxDBPluginWorkingTree } {
  const database = new RxDB({
    dbName: `rxdb-metadata-only-switch-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  const plugin = new RxDBPluginWorkingTree(database);
  database.use(() => plugin);
  database.init();
  return { database, plugin };
}

/** 一条分支在本测试里的三种 ref 形态。 */
type RefShape =
  /** 有 ref 且有 baseline——已物化 */
  | 'baselined'
  /** 有 ref 但 `headCommitId` 为 `null`——0004 给既有库补的那一行 */
  | 'null_head'
  /** 根本没有 ref 行——`syncBranches()` 在 0004 之后新建的那种 */
  | 'none';

interface BranchSpec {
  readonly id: string;
  readonly activated?: boolean;
  /** 默认本地分支；metadata-only 远端分支要显式写 `local:false / remote:true` */
  readonly local?: boolean;
  readonly remote?: boolean;
  readonly ref?: RefShape;
}

/**
 * 造一条 `rxdb_branch` 行。
 *
 * @remarks
 * 远端分支那一支的字段取值逐字照抄 `rxdb-plugin-sync/src/sync-branches.ts` 里
 * `branchRepository.create(...)` 的那七个键——本文件不 import 那个包，理由见 fileoverview。
 */
function createBranchRow(entityManager: EntityManager, spec: BranchSpec): RxDBBranch {
  const branch = entityManager.instantiate(RxDBBranch);
  branch.id = spec.id;
  branch.activated = spec.activated ?? false;
  branch.activeKey = spec.activated === true ? ACTIVE_BRANCH_KEY : null;
  branch.local = spec.local ?? true;
  branch.remote = spec.remote ?? false;
  branch.parentId = spec.id === SOURCE_BRANCH_ID ? null : SOURCE_BRANCH_ID;
  branch.fromChangeId = null;
  return branch;
}

/** 造一条 ref 行；`null_head` 就是 0004 建行之后、baseline 之前的那个形态。 */
function createRef(entityManager: EntityManager, branchId: string, shape: Exclude<RefShape, 'none'>): CommitBranchRef {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = branchId;
  ref.branchId = branchId;
  ref.generation = 1;
  ref.headCommitId = shape === 'baselined' ? `commit-${branchId}-head` : null;
  ref.headRevision = shape === 'baselined' ? 2 : 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  return ref;
}

/** 造一条工作树状态行。 */
function createState(entityManager: EntityManager, branchId: string): WorkingTreeState {
  const state = entityManager.instantiate(WorkingTreeState);
  state.id = branchId;
  state.branchId = branchId;
  state.baseHeadCommitId = `commit-${branchId}-head`;
  state.workingTreeRevision = 5;
  state.entryCount = 1;
  return state;
}

/** 造来源分支的一条未提交条目；staging 期间它一格都不该动。 */
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

/** 造来源分支 HEAD 那个 commit 与它的一个变更单元。 */
function createCommitRows(entityManager: EntityManager, branchId: string): [Commit, CommitChangeSet] {
  const commitId = `commit-${branchId}-head`;
  const commit = entityManager.instantiate(Commit);
  commit.id = commitId;
  commit.parentIds = [];
  commit.firstParentId = null;
  commit.kind = 'normal';
  commit.message = `提交 ${commitId}`;
  commit.author = null;
  commit.createdAt = new Date(0);
  commit.operationId = `operation-${branchId}`;
  commit.changeSetCount = 1;
  commit.contentFingerprint = `content-${commitId}`;

  const changeSet = entityManager.instantiate(CommitChangeSet);
  changeSet.id = `${commitId}-unit-0`;
  changeSet.commitId = commitId;
  changeSet.sequence = 0;
  changeSet.unitId = `${commitId}-unit`;
  changeSet.transactionId = null;
  changeSet.namespace = 'app';
  changeSet.entity = 'Note';
  changeSet.entityId = 'note-0';
  changeSet.operation = 'update';
  changeSet.patch = { title: '已提交' };
  changeSet.inversePatch = { title: '提交前' };
  changeSet.origin = 'local';

  return [commit, changeSet];
}

/**
 * 一个分页来源。
 *
 * @param count - 产多少页
 * @param onPull - **产出第 `pageIndex` 页之前**的回调；前 `pageIndex` 页这时应当已经落库
 *
 * @remarks
 * 写成 `async function*` 而不是一个现成的数组，正是为了让「逐页」可观测：消费者拉下一页的
 * 唯一时机是上一轮循环体跑完之后，于是 `onPull(k)` 看到的库里应当恰好有 k 页。攒在内存里
 * 最后一把写的实现在这里看到的恒是 0。
 */
async function* pageSource(
  count: number,
  onPull: (pageIndex: number) => void = () => undefined
): AsyncGenerator<BranchMaterializationPagePayload> {
  for (let pageIndex = 0; pageIndex < count; pageIndex += 1) {
    onPull(pageIndex);
    yield {
      payload: { rows: [{ entity: 'Note', id: `note-${pageIndex}` }] },
      fingerprint: `page-fingerprint-${pageIndex}`
    };
  }
}

/** `stageBranchMaterialization` 的入参覆盖位；没写的走 {@link createScene} 的默认值。 */
interface StageOverrides {
  readonly attemptId?: string;
  readonly targetBranchId?: string;
  readonly frozenRemoteWatermark?: Record<string, unknown>;
  readonly syncScope?: readonly string[];
  readonly pages?: AsyncIterable<BranchMaterializationPagePayload>;
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly executor: TransactionExecutor;
  activationRow(): WorkingTreeActivationState | undefined;
  classify(branchId: string): ReturnType<typeof classifyBranchMaterialization>;
  stage(overrides?: StageOverrides): ReturnType<typeof stageBranchMaterialization>;
  stageRow(attemptId?: string): WorkingTreeMaterializationStage | undefined;
  pageRows(attemptId?: string): WorkingTreeMaterializationPage[];
  refOf(branchId: string): CommitBranchRef | undefined;
  stateOf(branchId: string): WorkingTreeState | undefined;
  activeBranchIds(): string[];
}

/**
 * 造一个「`syncBranches()` 刚把远端分支拉下来、用户正要第一次切过去」的现场。
 *
 * @param specs - 要布的分支；默认一条 active 的本地 `main` 加一条 metadata-only 的远端分支
 *
 * @remarks
 * 来源分支的 ref / 工作树状态 / 未提交条目 / commit / 变更单元**全都布上**：只布远端那一条的话，
 * 「staging 顺手把当前投影也改了」这种退化没有任何一行可以露出来。
 */
function createScene(
  specs: readonly BranchSpec[] = [
    { id: SOURCE_BRANCH_ID, activated: true, ref: 'baselined' },
    { id: REMOTE_BRANCH_ID, local: false, remote: true, ref: 'none' }
  ]
): Scene {
  const { database } = createDatabase();
  const entityManager = database.entityManager;
  const probe = createCommitGraphProbe({ rowsAffected: 1 });

  probe.seed(
    RxDBBranch,
    specs.map(spec => createBranchRow(entityManager, spec))
  );
  probe.seed(
    CommitBranchRef,
    specs
      .filter(spec => (spec.ref ?? 'baselined') !== 'none')
      .map(spec => createRef(entityManager, spec.id, (spec.ref ?? 'baselined') as Exclude<RefShape, 'none'>))
  );
  probe.seed(WorkingTreeState, [createState(entityManager, SOURCE_BRANCH_ID)]);
  probe.seed(WorkingTreeEntry, [createEntry(entityManager, SOURCE_BRANCH_ID)]);
  probe.seed(WorkingTreeRestoreSession, []);
  probe.seed(WorkingTreeMaterializationStage, []);
  probe.seed(WorkingTreeMaterializationPage, []);

  const [commit, changeSet] = createCommitRows(entityManager, SOURCE_BRANCH_ID);
  probe.seed(Commit, [commit]);
  probe.seed(CommitChangeSet, [changeSet]);

  const activation = entityManager.instantiate(WorkingTreeActivationState);
  activation.id = WORKING_TREE_ACTIVATION_STATE_ID;
  activation.activationRevision = 7;
  activation.branchGenerationSeq = specs.length;
  probe.seed(WorkingTreeActivationState, [activation]);

  const rowsOf = <T>(EntityClass: Parameters<typeof probe.rowsOf>[0]): T[] => probe.rowsOf(EntityClass) as T[];

  return {
    probe,
    executor: probe.executor,
    // 现读而不是把种子期那个实例挂出去：`stageBranchMaterialization()` 真要动激活行的话，
    // 走的是 `removeMany` + `saveMany`——换行之后种子实例仍停在 7/2，断言照样绿。
    // 兄弟的 `refOf` / `stateOf` / `activeBranchIds` 全是现读，这一格不能例外。
    activationRow: () =>
      rowsOf<WorkingTreeActivationState>(WorkingTreeActivationState).find(
        row => row.id === WORKING_TREE_ACTIVATION_STATE_ID
      ),
    classify: branchId => classifyBranchMaterialization(probe.executor, branchId),
    stage: (overrides = {}) =>
      stageBranchMaterialization(entityManager, probe.executor, {
        attemptId: overrides.attemptId ?? ATTEMPT_ID,
        targetBranchId: overrides.targetBranchId ?? REMOTE_BRANCH_ID,
        frozenRemoteWatermark: overrides.frozenRemoteWatermark ?? { ...FROZEN_WATERMARK },
        syncScope: overrides.syncScope ?? SYNC_SCOPE,
        pages: overrides.pages ?? pageSource(PAGE_COUNT)
      }),
    stageRow: (attemptId = ATTEMPT_ID) =>
      rowsOf<WorkingTreeMaterializationStage>(WorkingTreeMaterializationStage).find(row => row.id === attemptId),
    pageRows: (attemptId = ATTEMPT_ID) =>
      rowsOf<WorkingTreeMaterializationPage>(WorkingTreeMaterializationPage)
        .filter(row => row.stageId === attemptId)
        .sort((left, right) => left.pageIndex - right.pageIndex),
    refOf: branchId => rowsOf<CommitBranchRef>(CommitBranchRef).find(row => row.id === branchId),
    stateOf: branchId => rowsOf<WorkingTreeState>(WorkingTreeState).find(row => row.id === branchId),
    activeBranchIds: () =>
      rowsOf<RxDBBranch>(RxDBBranch)
        .filter(row => row.activated)
        .map(row => row.id)
  };
}

/** 九张表各自还剩几行；一次读出来才好整份比对，逐张断言会漏掉刚加的第十张表。 */
const footprintOf = (scene: Scene) => ({
  branches: scene.probe.rowsOf(RxDBBranch).length,
  refs: scene.probe.rowsOf(CommitBranchRef).length,
  states: scene.probe.rowsOf(WorkingTreeState).length,
  entries: scene.probe.rowsOf(WorkingTreeEntry).length,
  sessions: scene.probe.rowsOf(WorkingTreeRestoreSession).length,
  commits: scene.probe.rowsOf(Commit).length,
  changeSets: scene.probe.rowsOf(CommitChangeSet).length,
  stages: scene.probe.rowsOf(WorkingTreeMaterializationStage).length,
  pages: scene.probe.rowsOf(WorkingTreeMaterializationPage).length
});

describe('syncBranches() 只同步 metadata，不提前伪造 baseline / ref（FR-044/049）', () => {
  it('同步进来的远端分支判为 metadata-only，不是一个空 HEAD', async () => {
    const scene = createScene();

    const state = await scene.classify(REMOTE_BRANCH_ID);

    // 「没有 ref」与「ref 的 HEAD 为空」必须可区分：后者宣称「这条分支在本地是空的」，
    // 而它真正的首次物化（US-308）会发现自己已经有根了，只能覆盖或放弃。
    expect(state).toEqual({ kind: 'metadata_only', branchId: REMOTE_BRANCH_ID });
  });

  it('判一次不往库里补任何一行——`ensureBranchCommitRows` 就在一次调用之外', async () => {
    const scene = createScene();
    const before = footprintOf(scene);

    await scene.classify(REMOTE_BRANCH_ID);

    expect(footprintOf(scene)).toEqual(before);
    expect(scene.probe.statements).toEqual([]);
  });

  it('0004 给既有库补过 ref 行的那种远端分支，结论一样是 metadata-only', async () => {
    const scene = createScene([
      { id: SOURCE_BRANCH_ID, activated: true, ref: 'baselined' },
      { id: REMOTE_BRANCH_ID, local: false, remote: true, ref: 'null_head' }
    ]);

    const state = await scene.classify(REMOTE_BRANCH_ID);

    // 两种形态（0004 之前同步进来的有行、之后同步进来的没行）来自同一件事：本地没有它的完整状态。
    // 按有没有那一行给出两种结论，等于让「用户什么时候升的级」决定切分支时走哪条路。
    expect(state).toEqual({ kind: 'metadata_only', branchId: REMOTE_BRANCH_ID });
  });
});

describe('「没有 ref」不等于空历史，也不等于损坏（FR-049）', () => {
  it('本地分支缺 ref 仍然抛——那是迁移没跑完，不能降级成 metadata-only', async () => {
    const scene = createScene([
      { id: SOURCE_BRANCH_ID, activated: true, ref: 'baselined' },
      { id: 'feature-1', ref: 'none' }
    ]);

    // 把两种成因合流到「都当 metadata-only」上，损坏就此无声：切过去会去拉一份远端 payload，
    // 而这条分支的完整状态本来就在本机。
    await expect(scene.classify('feature-1')).rejects.toBeInstanceOf(RxDBError);
  });

  it('本地分支的 ref HEAD 为空时**不**判 metadata-only', async () => {
    const scene = createScene([
      { id: SOURCE_BRANCH_ID, activated: true, ref: 'baselined' },
      { id: 'feature-1', ref: 'null_head' }
    ]);

    const state = await scene.classify('feature-1');

    // 「headCommitId === null 即 metadata-only」在远端分支上给出正确答案，却会把 enable 之前的
    // 每一条本地分支都送进远端物化路径。判据是分支行上的 local / remote，不是 HEAD 空不空。
    expect(state.kind).toBe('materialized');
  });

  it('已经物化过的远端分支交回库里那一行 ref', async () => {
    const scene = createScene([
      { id: SOURCE_BRANCH_ID, activated: true, ref: 'baselined' },
      { id: REMOTE_BRANCH_ID, local: false, remote: true, ref: 'baselined' }
    ]);

    const state = await scene.classify(REMOTE_BRANCH_ID);

    expect(state).toEqual({ kind: 'materialized', ref: scene.refOf(REMOTE_BRANCH_ID) });
  });
});

describe('首次 switch 的独立 durable staging（FR-044）', () => {
  it('attempt 头行先落，payload 逐页落——不是攒在内存里最后一把写', async () => {
    const scene = createScene();
    const seenPages: number[] = [];
    const seenStages: number[] = [];

    await scene.stage({
      pages: pageSource(PAGE_COUNT, () => {
        seenPages.push(scene.probe.rowsOf(WorkingTreeMaterializationPage).length);
        seenStages.push(scene.probe.rowsOf(WorkingTreeMaterializationStage).length);
      })
    });

    // 产第 k 页之前，前 k 页必须已经在库里；攒在内存里最后一把写的实现在这里恒是 [0,0,0]。
    // 它照样能让下面「页都在、pageCount 对」的断言全绿，代价要到分页崩溃那天才显形。
    expect(seenPages).toEqual([0, 1, 2]);
    // 头行先落：崩在第一页之前也要留下一条可按 attempt 清理的记录，否则这批页无主。
    expect(seenStages).toEqual([1, 1, 1]);
  });

  it('全部页落库之前 status 不得是 staged——半份 payload 不是完整快照', async () => {
    const scene = createScene();
    const seenStatuses: (string | undefined)[] = [];

    const staging = await scene.stage({
      pages: pageSource(PAGE_COUNT, () => seenStatuses.push(scene.stageRow()?.status))
    });

    // 最后一页产出时已经落了两页，status 仍必须是 pending：提前写 staged 等于宣布一份
    // 半截 payload 可用（data-model.md §2.9）。
    expect(seenStatuses).toEqual(['pending', 'pending', 'pending']);
    expect({ status: scene.stageRow()?.status, pageCount: scene.stageRow()?.pageCount }).toEqual({
      status: 'staged',
      pageCount: PAGE_COUNT
    });
    expect({ attemptId: staging.attemptId, pageCount: staging.pageCount }).toEqual({
      attemptId: ATTEMPT_ID,
      pageCount: PAGE_COUNT
    });
  });

  it('逐页 payload 与 fingerprint 原样落库，页序连续', async () => {
    const scene = createScene();

    await scene.stage();

    expect(
      scene.pageRows().map(row => ({ pageIndex: row.pageIndex, payload: row.payload, fingerprint: row.fingerprint }))
    ).toEqual(
      [0, 1, 2].map(pageIndex => ({
        pageIndex,
        payload: { rows: [{ entity: 'Note', id: `note-${pageIndex}` }] },
        fingerprint: `page-fingerprint-${pageIndex}`
      }))
    );
  });

  it('终止水位在 attempt 开始那一刻冻结，分页期间调用方那份再动也不跟', async () => {
    const scene = createScene();
    const liveWatermark: Record<string, unknown> = { ...FROZEN_WATERMARK };

    await scene.stage({
      frozenRemoteWatermark: liveWatermark,
      // 远端在分页期间照常推进——「冻结」写成存一个引用的话，staging 就成了一份跨水位的拼接。
      pages: pageSource(PAGE_COUNT, pageIndex => {
        liveWatermark.changeId = 100 + pageIndex + 1;
      })
    });

    expect(scene.stageRow()?.frozenRemoteWatermark).toEqual({ changeId: 100 });
  });

  it('scopeManifest 写的是完整配置的 sync scope，不是这次有页的那几个实体', async () => {
    const scene = createScene();

    await scene.stage();

    // 三个实体里只有 Note 在本次分页里出现过行。按「出现过的实体」写清单，一个当时恰好
    // 没有行的实体会从清单里消失，续用判定于是把一份范围更窄的旧 attempt 判成可续用。
    expect(scene.stageRow()?.scopeManifest).toEqual({ entities: [...SYNC_SCOPE] });
    expect(scene.stageRow()?.targetBranchId).toBe(REMOTE_BRANCH_ID);
  });

  it('同一份冻结输入的两次 attempt 拿到同一个 fingerprint，且与页内容无关', async () => {
    const scene = createScene();

    const first = await scene.stage({ attemptId: 'attempt-1', pages: pageSource(3) });
    const second = await scene.stage({ attemptId: 'attempt-2', pages: pageSource(1) });

    // 续用判定要在**拉页之前**就能比，所以指纹只能算在冻结下来的那份意图上。
    // 把 payload 掺进去，指纹就得等整份快照落完才有，那时已经没什么可续用的了。
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(scene.stageRow('attempt-2')?.fingerprint).toBe(first.fingerprint);
  });

  it('水位或 scope 一漂移，fingerprint 就换——续用判定靠的就是它', async () => {
    const scene = createScene();

    const base = await scene.stage({ attemptId: 'attempt-1' });
    const drifted = await scene.stage({ attemptId: 'attempt-2', frozenRemoteWatermark: { changeId: 101 } });
    const widened = await scene.stage({ attemptId: 'attempt-3', syncScope: [...SYNC_SCOPE, 'Comment'] });

    expect(drifted.fingerprint).not.toBe(base.fingerprint);
    expect(widened.fingerprint).not.toBe(base.fingerprint);
  });
});

describe('staging 不触碰当前投影（FR-044）', () => {
  it('除 staging 两张表外一行都没多、没少', async () => {
    const scene = createScene();
    const before = footprintOf(scene);

    await scene.stage();

    expect(footprintOf(scene)).toEqual({
      ...before,
      stages: before.stages + 1,
      pages: before.pages + PAGE_COUNT
    });
    // 裸 SQL 是绕过上面那份行数比对的唯一路子——UPDATE 不改行数。
    expect(scene.probe.statements).toEqual([]);
  });

  it('来源分支的 ref 与工作树状态一格不动，active 仍在来源分支', async () => {
    const scene = createScene();
    const ref = scene.refOf(SOURCE_BRANCH_ID);
    const before = {
      headCommitId: ref?.headCommitId,
      headRevision: ref?.headRevision,
      workingTreeRevision: scene.stateOf(SOURCE_BRANCH_ID)?.workingTreeRevision,
      entryCount: scene.stateOf(SOURCE_BRANCH_ID)?.entryCount
    };

    await scene.stage();

    const after = scene.refOf(SOURCE_BRANCH_ID);
    expect({
      headCommitId: after?.headCommitId,
      headRevision: after?.headRevision,
      workingTreeRevision: scene.stateOf(SOURCE_BRANCH_ID)?.workingTreeRevision,
      entryCount: scene.stateOf(SOURCE_BRANCH_ID)?.entryCount
    }).toEqual(before);
    // 切换 active 与递增 activation revision 都在 T116 那道提交屏障里，staging 这一步一格都不该动。
    expect(scene.activeBranchIds()).toEqual([SOURCE_BRANCH_ID]);
    expect({
      activationRevision: scene.activationRow()?.activationRevision,
      branchGenerationSeq: scene.activationRow()?.branchGenerationSeq
    }).toEqual({ activationRevision: 7, branchGenerationSeq: 2 });
  });

  it('目标分支这一步仍然没有 ref、没有 baseline', async () => {
    const scene = createScene();

    await scene.stage();

    // 「反正要建，顺手先把 ref 建了」会让崩在分页中途的那次尝试留下一条空 HEAD 的远端分支——
    // 而那正是 FR-049 不许出现的东西。建 ref、建 `kind=branch_baseline` 都归 T116 的同一道屏障。
    expect(scene.refOf(REMOTE_BRANCH_ID)).toBeUndefined();
    expect(await scene.classify(REMOTE_BRANCH_ID)).toEqual({ kind: 'metadata_only', branchId: REMOTE_BRANCH_ID });
  });
});
