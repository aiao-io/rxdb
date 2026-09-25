/**
 * @fileoverview T114 红测试：`removeBranch()` 的原子清理与同名重建的 ABA 防护（FR-044、data-model.md §2.5）。
 *
 * @remarks
 * 契约见 `spec.md` FR-044：`removeBranch()` MUST **原子删除该分支全部可变状态和 materialization
 * attempt，但保留不可变 commit**；同名重建 MUST 使用新 branch generation。
 *
 * **入口是贡献方的 `removeBranchRows`，与 `writeBranchRows` 对称**（T111 已按后者钉死建分支那一半）。
 * 落在这里而不是 `remove-branch.ts` 里，理由与 T120 那条注记同一条：`rxdb-plugin-history` 不认识
 * `WorkingTreeEntry`，把六张表的删除写在那边要么反向 import 成环（nx 图插件把静态 import 映射成
 * 依赖边，`run-many` 当场拒跑），要么把十张表的知识泄进核心分支逻辑。`remove_branch` 那一侧
 * 只多一句「在自己那个事务里调一遍贡献」，形参与它调 `writeBranchRows` 时逐字同形。
 *
 * **不指望外键级联替它做这件事。** 六张表里 `rxdb_working_tree_materialization_stage` 上
 * **没有**指向 `rxdb_branch` 的关系（它只有一个普通的 `targetBranchId` 列加一条索引），级联对它
 * 天然无效；而剩下五张表即使配了 `ON DELETE CASCADE`，那条保证也摊在六个后端各自的
 * `PRAGMA foreign_keys` 与建表路径上。一半靠约束、一半靠代码的清理等于两套要互相盯着的机制，
 * 而 `remove_branch` 早已给出过答案——它对 `RxDBChange` 就是显式删的，尽管那张表同样挂着级联。
 *
 * 四组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **漏掉 materialization attempt**。它是六张表里唯一没有外键的那张，于是「删分支行让数据库
 *    自己收尾」这种写法恰好只漏它。漏下来的是一条 `status='staged'`、指着一个已经不存在的
 *    `targetBranchId` 的 staging：同名重建之后，那条 staging 的目标 id 与新分支逐字相同，
 *    FR-044 的物化屏障会拿它当成「上一次分页崩溃留下的现场」接着往下走。
 * 2. **顺手把不可变 commit 也删了**。`rxdb_commit` 上根本没有 `branchId` 列（可达性走 ref），
 *    所以「删干净这条分支」一旦被理解成「删掉它能看见的一切」，被删的就是别的分支也指着的节点。
 * 3. **把 `branchGenerationSeq` 退回去**。删一条分支就让单调源减一看起来非常合理——号又空出来了。
 *    代价正是 §2.5 要治的 ABA：同名重建拿回同一个代际，持旧 `(branchId, headRevision)` 的调用方
 *    会误中新分支，而提交幂等键也在同一刻失效。
 * 4. **重建出来的分支继承被删那条的 HEAD**。清理留下一行 ref 没删、重建走了
 *    `ensureBranchCommitRows` 的「已存在就返回」分支时正是这个形状：新分支一出生就指着旧历史，
 *    且代际还是旧的——第 3 条防的是主动退号，这一条防的是压根没删。
 */

import type { EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { ACTIVE_BRANCH_KEY, RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { deriveCommitOperationId, findCommitByOperationId } from '../../commit/commit-idempotency.js';
import { Commit } from '../../commit/commit.entity.js';
import { RxDBPluginWorkingTree } from '../../plugin.js';
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
import { runBranchGenerationSql } from './fixtures/activation-sql.js';

/** 被删掉的那条分支。 */
const REMOVED_BRANCH_ID = 'feature-x';

/** 旁观分支：一行都不该被动到。 */
const KEPT_BRANCH_ID = 'main';

/** 被删分支的代际；同名重建**不得**再拿到这个数。 */
const REMOVED_GENERATION = 4;

/**
 * 代际单调源当前发放到的号。
 *
 * @remarks
 * 与 {@link REMOVED_GENERATION} 相等，也就是「被删的正是最后签发的那条分支」——退号那种写法
 * 在这个形状下才真的能把号退回来，于是第 3 组断言测的是它最有说服力的那一支。
 */
const BRANCH_GENERATION_SEQ = REMOVED_GENERATION;

/** 同名重建应当拿到的代际。 */
const REBUILT_GENERATION = BRANCH_GENERATION_SEQ + 1;

/** 被删分支 ref 指着的那个 commit；它不可变，删分支不该碰它。 */
const REMOVED_HEAD_COMMIT_ID = 'commit-feature-head';

/** 旁观分支 ref 指着的 commit。 */
const KEPT_HEAD_COMMIT_ID = 'commit-main-head';

/** 调用方自己那个操作 id；删分支再重建之后，调用方很可能原样复用它（FR-036）。 */
const CALLER_OPERATION_ID = 'op-retry-1';

/** 旧代际下派生出的幂等键——库里那条 commit 用的就是它。 */
const LEGACY_OPERATION_ID = deriveCommitOperationId({
  branchGeneration: REMOVED_GENERATION,
  operationId: CALLER_OPERATION_ID
});

/** 一个挂了 mock 适配器、已 `init()` 的宿主；十张系统表由插件贡献，必须早于 `init()` 进 `use()`。 */
function createDatabase(): { database: RxDB; plugin: RxDBPluginWorkingTree } {
  const database = new RxDB({
    dbName: `rxdb-remove-branch-aba-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  const plugin = new RxDBPluginWorkingTree(database);
  database.use(() => plugin);
  database.init();
  return { database, plugin };
}

/** 造一条分支行；`remove_branch` 在调贡献之前已经校验过它，贡献方不该再动它。 */
function createBranchRow(entityManager: EntityManager, branchId: string, activated: boolean): RxDBBranch {
  const branch = entityManager.instantiate(RxDBBranch);
  branch.id = branchId;
  branch.activated = activated;
  branch.activeKey = activated ? ACTIVE_BRANCH_KEY : null;
  branch.local = true;
  branch.remote = false;
  branch.parentId = null;
  branch.fromChangeId = null;
  return branch;
}

/** 造一条分支的 ref 行。 */
function createRef(
  entityManager: EntityManager,
  branchId: string,
  generation: number,
  headCommitId: string
): CommitBranchRef {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = branchId;
  ref.branchId = branchId;
  ref.generation = generation;
  ref.headCommitId = headCommitId;
  ref.headRevision = 3;
  ref.status = 'ok';
  ref.corruptedAt = null;
  return ref;
}

/** 造一条分支的工作树状态行。 */
function createState(entityManager: EntityManager, branchId: string, entryCount: number): WorkingTreeState {
  const state = entityManager.instantiate(WorkingTreeState);
  state.id = branchId;
  state.branchId = branchId;
  state.baseHeadCommitId = null;
  state.workingTreeRevision = 6;
  state.entryCount = entryCount;
  return state;
}

/** 造一条未提交条目。 */
function createEntry(entityManager: EntityManager, branchId: string, index: number): WorkingTreeEntry {
  const entry = entityManager.instantiate(WorkingTreeEntry);
  entry.id = `${branchId}-entry-${index}`;
  entry.branchId = branchId;
  entry.unitId = `${branchId}-unit-${index}`;
  entry.transactionId = null;
  entry.namespace = 'app';
  entry.entity = 'Note';
  entry.entityId = `note-${index}`;
  entry.operation = 'update';
  entry.patch = { title: `标题 ${index}` };
  entry.inversePatch = { title: `原标题 ${index}` };
  entry.fingerprint = `fingerprint-${branchId}-${index}`;
  entry.origin = 'local';
  entry.sourceChangeId = null;
  return entry;
}

/** 造一条恢复会话行；`activeKey` 非空即「未结束」。 */
function createSession(entityManager: EntityManager, branchId: string, active: boolean): WorkingTreeRestoreSession {
  const session = entityManager.instantiate(WorkingTreeRestoreSession);
  session.id = `${branchId}-session`;
  session.branchId = branchId;
  session.targetCommitId = 'commit-restore-target';
  session.expectedHeadRevision = 3;
  session.expectedWorkingTreeRevision = 6;
  session.status = active ? 'active' : 'committed';
  session.activeKey = active ? branchId : null;
  return session;
}

/** 造一次物化尝试的 staging 行；注意它按 `targetBranchId` 挂靠，表上没有外键。 */
function createStage(entityManager: EntityManager, branchId: string): WorkingTreeMaterializationStage {
  const stage = entityManager.instantiate(WorkingTreeMaterializationStage);
  stage.id = `${branchId}-stage`;
  stage.targetBranchId = branchId;
  stage.frozenRemoteWatermark = { changeId: 42 };
  stage.scopeManifest = { entities: ['Note'] };
  stage.fingerprint = `stage-fingerprint-${branchId}`;
  stage.status = 'staged';
  stage.pageCount = 1;
  return stage;
}

/** 造一页 staging payload。 */
function createPage(entityManager: EntityManager, stageId: string, pageIndex: number): WorkingTreeMaterializationPage {
  const page = entityManager.instantiate(WorkingTreeMaterializationPage);
  page.id = `${stageId}-page-${pageIndex}`;
  page.stageId = stageId;
  page.pageIndex = pageIndex;
  page.payload = { rows: [] };
  page.fingerprint = `page-fingerprint-${stageId}-${pageIndex}`;
  return page;
}

/** 造一个 commit 与它的一个变更单元。 */
function createCommitRows(
  entityManager: EntityManager,
  commitId: string,
  operationId: string
): [Commit, CommitChangeSet] {
  const commit = entityManager.instantiate(Commit);
  commit.id = commitId;
  commit.parentIds = [];
  commit.firstParentId = null;
  commit.kind = 'normal';
  commit.message = `提交 ${commitId}`;
  commit.author = null;
  commit.createdAt = new Date(0);
  commit.operationId = operationId;
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

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly executor: TransactionExecutor;
  readonly activation: WorkingTreeActivationState;
  /** 调一次贡献方的 `removeBranchRows`，形参与 `remove_branch` 里那一行逐字相同 */
  remove(branchId?: string): Promise<void>;
  /** 同名重建：走的就是建分支那条唯一入口（T111 钉的那个） */
  rebuild(): Promise<void>;
  refOf(branchId: string): CommitBranchRef | undefined;
  stateOf(branchId: string): WorkingTreeState | undefined;
  entriesOf(branchId: string): WorkingTreeEntry[];
  sessionsOf(branchId: string): WorkingTreeRestoreSession[];
  stagesOf(branchId: string): WorkingTreeMaterializationStage[];
  pagesOf(stageId: string): WorkingTreeMaterializationPage[];
}

/**
 * 造一个「`remove_branch` 已经校验完、正要清理贡献方那几张表」的现场。
 *
 * @remarks
 * 两条分支的六张表**逐张都有行**：只给目标分支布景的话，「删的时候没带 branchId 条件」
 * 这种写法会把全库清空，而用例照样全绿——它要的行确实都没了。
 */
function createScene(): Scene {
  const { database, plugin } = createDatabase();
  const entityManager = database.entityManager;
  const probe = createCommitGraphProbe({
    rowsAffected: 1,
    // 代际发放的加法在库里做，紧接着的读回来也走原始语句（`activation-state.ts`），
    // 而替身不执行 SQL；不补这两下，发放当场就会因为「读回 0 行」抛错。见 `activation-sql.ts`。
    onQuery: runBranchGenerationSql
  });

  probe.seed(RxDBBranch, [
    createBranchRow(entityManager, KEPT_BRANCH_ID, true),
    createBranchRow(entityManager, REMOVED_BRANCH_ID, false)
  ]);
  probe.seed(CommitBranchRef, [
    createRef(entityManager, KEPT_BRANCH_ID, 1, KEPT_HEAD_COMMIT_ID),
    createRef(entityManager, REMOVED_BRANCH_ID, REMOVED_GENERATION, REMOVED_HEAD_COMMIT_ID)
  ]);
  probe.seed(WorkingTreeState, [
    createState(entityManager, KEPT_BRANCH_ID, 1),
    createState(entityManager, REMOVED_BRANCH_ID, 2)
  ]);
  probe.seed(WorkingTreeEntry, [
    createEntry(entityManager, KEPT_BRANCH_ID, 0),
    createEntry(entityManager, REMOVED_BRANCH_ID, 0),
    createEntry(entityManager, REMOVED_BRANCH_ID, 1)
  ]);
  probe.seed(WorkingTreeRestoreSession, [
    createSession(entityManager, KEPT_BRANCH_ID, false),
    createSession(entityManager, REMOVED_BRANCH_ID, true)
  ]);
  probe.seed(WorkingTreeMaterializationStage, [
    createStage(entityManager, KEPT_BRANCH_ID),
    createStage(entityManager, REMOVED_BRANCH_ID)
  ]);
  probe.seed(WorkingTreeMaterializationPage, [
    createPage(entityManager, `${KEPT_BRANCH_ID}-stage`, 0),
    createPage(entityManager, `${REMOVED_BRANCH_ID}-stage`, 0),
    createPage(entityManager, `${REMOVED_BRANCH_ID}-stage`, 1)
  ]);

  const [removedHead, removedUnit] = createCommitRows(entityManager, REMOVED_HEAD_COMMIT_ID, LEGACY_OPERATION_ID);
  const [keptHead, keptUnit] = createCommitRows(
    entityManager,
    KEPT_HEAD_COMMIT_ID,
    'b1c0ffee-0000-8000-8000-000000000000'
  );
  probe.seed(Commit, [removedHead, keptHead]);
  probe.seed(CommitChangeSet, [removedUnit, keptUnit]);

  const activation = entityManager.instantiate(WorkingTreeActivationState);
  activation.id = WORKING_TREE_ACTIVATION_STATE_ID;
  activation.activationRevision = 2;
  activation.branchGenerationSeq = BRANCH_GENERATION_SEQ;
  probe.seed(WorkingTreeActivationState, [activation]);

  const rowsOf = <T>(EntityClass: Parameters<typeof probe.rowsOf>[0]): T[] => probe.rowsOf(EntityClass) as T[];

  return {
    probe,
    executor: probe.executor,
    activation,
    remove: (branchId = REMOVED_BRANCH_ID) => plugin.system.removeBranchRows({ executor: probe.executor, branchId }),
    rebuild: () =>
      plugin.system.writeBranchRows(entityManager, { executor: probe.executor, branchId: REMOVED_BRANCH_ID }),
    refOf: branchId => rowsOf<CommitBranchRef>(CommitBranchRef).find(row => row.id === branchId),
    stateOf: branchId => rowsOf<WorkingTreeState>(WorkingTreeState).find(row => row.id === branchId),
    entriesOf: branchId => rowsOf<WorkingTreeEntry>(WorkingTreeEntry).filter(row => row.branchId === branchId),
    sessionsOf: branchId =>
      rowsOf<WorkingTreeRestoreSession>(WorkingTreeRestoreSession).filter(row => row.branchId === branchId),
    stagesOf: branchId =>
      rowsOf<WorkingTreeMaterializationStage>(WorkingTreeMaterializationStage).filter(
        row => row.targetBranchId === branchId
      ),
    pagesOf: stageId =>
      rowsOf<WorkingTreeMaterializationPage>(WorkingTreeMaterializationPage).filter(row => row.stageId === stageId)
  };
}

/** 这条分支在六张表里还剩下几行；一次读出来才好整份比对，逐张断言会漏掉刚加的第七张表。 */
const branchFootprintOf = (scene: Scene, branchId: string) => ({
  ref: scene.refOf(branchId) ? 1 : 0,
  state: scene.stateOf(branchId) ? 1 : 0,
  entries: scene.entriesOf(branchId).length,
  sessions: scene.sessionsOf(branchId).length,
  stages: scene.stagesOf(branchId).length,
  pages: scene.pagesOf(`${branchId}-stage`).length
});

describe('removeBranch() 原子删除该分支全部可变状态（FR-044）', () => {
  it('ref / 工作树状态 / 未提交条目 / 恢复会话四张表上一行不剩', async () => {
    const scene = createScene();

    await scene.remove();

    // 留下 ref 的后果在重建那一刻才显形：`ensureBranchCommitRows` 走「已存在就返回」，
    // 新分支于是继承旧代际与旧 HEAD——ABA 防线当场失效（见第四组）。
    expect({
      ref: scene.refOf(REMOVED_BRANCH_ID),
      state: scene.stateOf(REMOVED_BRANCH_ID),
      entries: scene.entriesOf(REMOVED_BRANCH_ID),
      sessions: scene.sessionsOf(REMOVED_BRANCH_ID)
    }).toEqual({ ref: undefined, state: undefined, entries: [], sessions: [] });
  });

  it('materialization attempt 与它的分页一并消失——那张表上没有外键，级联管不到它', async () => {
    const scene = createScene();

    await scene.remove();

    // `rxdb_working_tree_materialization_stage` 只有一个普通的 `targetBranchId` 列。
    // 漏下来的那条 `status='staged'` 会在同名重建之后被物化屏障当成「上一次分页崩溃的现场」
    // 接着往下走——它的目标 id 与新分支逐字相同。
    expect(scene.stagesOf(REMOVED_BRANCH_ID)).toEqual([]);
    expect(scene.pagesOf(`${REMOVED_BRANCH_ID}-stage`)).toEqual([]);
  });

  it('旁观分支的六张表一行都没动', async () => {
    const scene = createScene();

    await scene.remove();

    // 删的时候漏了 `branchId` 条件的话，上面两条断言照样全绿——它要的行确实都没了。
    expect(branchFootprintOf(scene, KEPT_BRANCH_ID)).toEqual({
      ref: 1,
      state: 1,
      entries: 1,
      sessions: 1,
      stages: 1,
      pages: 1
    });
  });

  it('激活态单行不在清理范围内', async () => {
    const scene = createScene();

    await scene.remove();

    // 它是全库单例，不属于任何分支。跟着分支一起删掉之后，
    // `readWorkingTreeActivationState()` 会把「这一行不见了」原样抛出来，
    // 而此后每一次 CAS 都拿不到期望值——整个库从此提交不了。
    expect(scene.probe.rowsOf(WorkingTreeActivationState)).toEqual([scene.activation]);
    expect(scene.activation.activationRevision).toBe(2);
  });

  it('不碰 `rxdb_branch` 那一行——删分支行是调用方的事', async () => {
    const scene = createScene();

    await scene.remove();

    // `remove_branch` 的「查子分支 → 查 change → 删」是一段有顺序的校验，分支行由它最后删。
    // 贡献方抢在前面删掉，那段校验读到的就是一个已经不存在的分支。
    expect((scene.probe.rowsOf(RxDBBranch) as RxDBBranch[]).map(row => row.id).sort()).toEqual(
      [KEPT_BRANCH_ID, REMOVED_BRANCH_ID].sort()
    );
  });
});

describe('不可变 commit 与它的变更单元保留（FR-044）', () => {
  it('commit 一条不少，被删分支的 HEAD 指着的那个也在', async () => {
    const scene = createScene();

    await scene.remove();

    // `rxdb_commit` 上根本没有 `branchId` 列（可达性走 ref），所以「删干净这条分支」
    // 一旦被理解成「删掉它能看见的一切」，被删的就是别的分支也可能指着的节点。
    expect((scene.probe.rowsOf(Commit) as Commit[]).map(row => row.id).sort()).toEqual(
      [KEPT_HEAD_COMMIT_ID, REMOVED_HEAD_COMMIT_ID].sort()
    );
  });

  it('变更单元跟着 commit 留下，不跟着分支走', async () => {
    const scene = createScene();

    await scene.remove();

    // `CommitChangeSet` 只挂在 `Commit` 上（没有 `branchId`）。顺着「这条分支提交过哪些单元」
    // 反推着删，删掉的是一个仍然可达的 commit 的内容，而 `changeSetCount` 还写着原来的数——
    // 图校验从此永久报损坏。
    expect(scene.probe.rowsOf(CommitChangeSet)).toHaveLength(2);
  });
});

describe('同名重建使用新 generation（data-model.md §2.5）', () => {
  it('删除既不退号也不发号：`branchGenerationSeq` 逐字不变', async () => {
    const scene = createScene();

    await scene.remove();

    // 退号看起来非常合理——号又空出来了。代价正是 §2.5 要治的 ABA。
    expect(scene.activation.branchGenerationSeq).toBe(BRANCH_GENERATION_SEQ);
  });

  it('同名重建拿到的是下一个号，严格大于被删那条的代际', async () => {
    const scene = createScene();

    await scene.remove();
    await scene.rebuild();

    const rebuilt = scene.refOf(REMOVED_BRANCH_ID);
    expect(rebuilt?.generation).toBe(REBUILT_GENERATION);
    expect(rebuilt?.generation).toBeGreaterThan(REMOVED_GENERATION);
  });

  it('重建出来的分支不继承被删那条的 HEAD 与工作树', async () => {
    const scene = createScene();

    await scene.remove();
    await scene.rebuild();

    // 清理漏了 ref 时，重建走的是 `ensureBranchCommitRows` 的「已存在就返回」分支：
    // 新分支一出生就指着旧历史，代际也还是旧的。
    expect({
      headCommitId: scene.refOf(REMOVED_BRANCH_ID)?.headCommitId,
      headRevision: scene.refOf(REMOVED_BRANCH_ID)?.headRevision,
      entryCount: scene.stateOf(REMOVED_BRANCH_ID)?.entryCount,
      entries: scene.entriesOf(REMOVED_BRANCH_ID).length
    }).toEqual({ headCommitId: null, headRevision: 0, entryCount: 0, entries: 0 });
  });
});

describe('旧幂等键不与重建后的分支碰撞（FR-036、FR-044）', () => {
  it('同一个调用方 operationId 在新旧两个代际下派生出两个不同的键', () => {
    // 这一条不经清理入口：它钉的是代际**为什么**要永不复用。裸 `operationId` 会把新分支的
    // 第一次提交误判成旧分支那次提交的重放，直接返回旧节点——用户以为提交成功了，
    // 历史里却查不出任何差别。
    const rebuiltKey = deriveCommitOperationId({
      branchGeneration: REBUILT_GENERATION,
      operationId: CALLER_OPERATION_ID
    });
    expect(rebuiltKey).not.toBe(LEGACY_OPERATION_ID);
  });

  it('重建之后，旧键仍指着旧 commit，新键查不到任何东西', async () => {
    const scene = createScene();

    await scene.remove();
    await scene.rebuild();

    const rebuiltKey = deriveCommitOperationId({
      branchGeneration: scene.refOf(REMOVED_BRANCH_ID)?.generation ?? -1,
      operationId: CALLER_OPERATION_ID
    });

    // 旧键仍命中，是「保留不可变 commit」这句话在幂等侧的样子：那次提交确实发生过。
    // 新键查不到，是新分支的第一次提交不会被误判成重放的全部依据。
    expect((await findCommitByOperationId(scene.executor, LEGACY_OPERATION_ID))?.id).toBe(REMOVED_HEAD_COMMIT_ID);
    expect(await findCommitByOperationId(scene.executor, rebuiltKey)).toBeUndefined();
  });
});
