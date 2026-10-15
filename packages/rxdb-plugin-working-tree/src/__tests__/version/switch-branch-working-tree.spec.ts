/**
 * @fileoverview T111 红测试：新建分支时的工作树隔离与 HEAD 锚定（FR-017）。
 *
 * @remarks
 * 契约见 `spec.md` FR-017：`createBranch(branchId)` 从**当前物化状态**创建，复制一份独立的
 * working-tree snapshot 并共享当前 HEAD；`createBranch(branchId, fromChangeId)` 保留的是
 * **历史** change 状态，以 `kind=branch_baseline` 锚定；两条分支之间不得共享可变 HEAD 或工作树。
 *
 * 入口与 `__tests__/system/write-branch-rows.spec.ts` 同一个——分支级行只此一处生成
 * （`branch-commit-rows.ts` 自陈的第三条入口）。那份 spec 守的是「两行落没落下、代际怎么发」，
 * 本文件守的是「这两行里装的是什么」，所以同样直接调贡献对象，不经 `create_branch`。
 *
 * **判据取自刚写进去的那一行 `rxdb_branch`，不另开一条上下文通道。** `create_branch` 在调贡献
 * 之前就把 `parentId` / `fromChangeId` 写进了同一个事务，再把同样两个值顺着
 * {@link RxDBBranchCreationContext} 传一遍，等于让同一件事有两份可以互相漂移的真相。
 * 分叉点等于源分支 tip（两边都没有变更时同样算相等）就是「当前物化状态」，否则就是历史点——
 * 这个判据不问调用方用的是哪个重载，只问库里那两个值，于是
 * `createBranch(branchId, 源分支tip的id)` 与 `createBranch(branchId)` 不会得到两种答案。
 *
 * 五组断言各自防一种不会编译报错、也不会立刻出错的退化：
 *
 * 1. **共享 HEAD 被写成「新分支从空 HEAD 起」**。今天正是这样（`createBranchCommitRows` 恒写
 *    `headCommitId = null`），于是从一条有历史的分支上切出来的新分支，`listCommits()` 一条都读不到，
 *    而 `enable()` 会把它当成「还没初始化」再补一个 baseline——同一条历史线上于是有两个根。
 * 2. **工作树被「共享」而不是复制**。不复制看起来最省事：新分支反正马上就要被切过去。代价是
 *    用户在新分支上 `discard()` 会把源分支的未提交改动一并丢掉，而两条分支在界面上是两件东西。
 * 3. **复制成了浅拷贝**。`patch` / `inversePatch` 是对象，直接把引用抄过去的话，新分支上的一次
 *    折叠会就地改掉源分支那一行的正向补丁——两条分支的「未提交变更」从此是同一份数据。
 * 4. **`fromChangeId` 那一支被顺手当成同一件事**。历史点上的物化状态与当前工作树无关，把当前
 *    工作树复制过去等于把「现在还没提交的改动」栽给一个历史节点；而不写 `branch_baseline`
 *    则让这条分支永远没有根，FR-044 的物化屏障也就认不出它是怎么来的。
 * 5. **revision 被一并继承**。`headRevision` / `workingTreeRevision` 是 CAS 轴，新分支必须从 0 起：
 *    继承之后「这个值是从哪条分支上捕获的」在数值上分辨不出来，而 CAS 的全部意义就是分辨它。
 */

import type { EntityManager } from '@aiao/rxdb';
import { ACTIVE_BRANCH_KEY, getEntityMetadata, RxDB, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { SYSTEM_COMMIT_MESSAGES } from '../../commit/write-commit.js';
import { RxDBPluginWorkingTree } from '../../plugin.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import {
  createCommitGraphProbe,
  normalizeSql,
  setClauseOf,
  whereClauseOf
} from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import {
  activationUpdatesOf,
  isActivationStatement,
  runBranchGenerationSql
} from '../working-tree/fixtures/activation-sql.js';

/** 源分支：一条有历史、有未提交改动、正在激活的普通分支。 */
const SOURCE_BRANCH_ID = 'main';

/** 本次新建的分支。 */
const NEW_BRANCH_ID = 'feature-x';

/** 源分支 ref 当前指着的 HEAD。 */
const SOURCE_HEAD_COMMIT_ID = 'commit-source-head';

/** 源分支的变更序列；最后一个是 tip。 */
const SOURCE_CHANGE_IDS = [11, 12] as const;

/** 源分支 tip；`createBranch(branchId)` 落在这里。 */
const SOURCE_TIP_CHANGE_ID = SOURCE_CHANGE_IDS[SOURCE_CHANGE_IDS.length - 1];

/** 一个**早于** tip 的历史分叉点；`createBranch(branchId, fromChangeId)` 落在这里。 */
const HISTORY_CHANGE_ID = SOURCE_CHANGE_IDS[0];

/**
 * 代际单调源的起点。
 *
 * @remarks
 * 非 0 且不等于分支数：从 0 或从「当前分支数」起的话，「发放 seq + 1」与「发放分支数 + 1」
 * 会给出同一个答案，本文件就替 `write-branch-rows.spec.ts` 那条 ABA 断言背了书却没测到。
 */
const BRANCH_GENERATION_SEQ = 3;

/** 本次新分支应当拿到的代际。 */
const EXPECTED_GENERATION = BRANCH_GENERATION_SEQ + 1;

const REF_TABLE = getEntityMetadata(CommitBranchRef).tableName;

/** 一个挂了 mock 适配器、已 `init()` 的宿主；十张系统表由插件贡献，必须早于 `init()` 进 `use()`。 */
function createDatabase(): { database: RxDB; plugin: RxDBPluginWorkingTree } {
  const database = new RxDB({
    dbName: `rxdb-switch-branch-working-tree-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  const plugin = new RxDBPluginWorkingTree(database);
  database.use(() => plugin);
  database.init();
  return { database, plugin };
}

/**
 * 造一条源分支的未提交条目。
 *
 * @remarks
 * `origin` 两条不同值：复制时按 `local` 归一会让远端同步来的未提交改动在新分支上改头换面，
 * 而 `status().byOrigin` 是用户判断「这些改动是我改的还是同步来的」的唯一出口（硬裁决 6）。
 */
function createSourceEntry(entityManager: EntityManager, index: number): WorkingTreeEntry {
  const entry = entityManager.instantiate(WorkingTreeEntry);
  entry.id = `source-entry-${index}`;
  entry.branchId = SOURCE_BRANCH_ID;
  entry.unitId = `unit-${index}`;
  entry.transactionId = `00000000-0000-4000-8000-00000000000${index}`;
  entry.namespace = 'app';
  entry.entity = 'Note';
  entry.entityId = `note-${index}`;
  entry.operation = 'update';
  entry.patch = { title: `新标题 ${index}` };
  entry.inversePatch = { title: `原标题 ${index}` };
  entry.fingerprint = `fingerprint-${index}`;
  entry.origin = index === 0 ? 'local' : 'remote_sync';
  entry.sourceChangeId = 100 + index;
  return entry;
}

/** {@link createScene} 的可调项。 */
interface SceneOptions {
  /** 新分支行上的分叉点；默认取源分支 tip，即 `createBranch(branchId)` 的形态 */
  readonly fromChangeId?: number | null;
  /** 源分支 ref 的 HEAD；`null` 表示源分支自己还没有根 */
  readonly headCommitId?: string | null;
  /** 源分支工作树里的条目数 */
  readonly entryCount?: number;
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly sourceRef: CommitBranchRef;
  readonly sourceState: WorkingTreeState;
  readonly sourceEntries: readonly WorkingTreeEntry[];
  /** 调一次贡献方的 `writeBranchRows`，形参与 `create_branch` 里那一行逐字相同 */
  run(): Promise<void>;
  refOf(branchId: string): CommitBranchRef | undefined;
  stateOf(branchId: string): WorkingTreeState | undefined;
  entriesOf(branchId: string): WorkingTreeEntry[];
}

/**
 * 造一个「`create_branch` 已经写完 `rxdb_branch` 那一行、正要调贡献方」的现场。
 *
 * @remarks
 * `rxdb_branch` 里两行都要有：源分支与**新分支自己**。新分支那一行正是判据的来源
 * （`parentId` 指源分支、`fromChangeId` 是分叉点），而 `create_branch` 确实在调贡献之前
 * 就把它 `create()` 进了同一个事务。
 */
function createScene(options: SceneOptions = {}): Scene {
  const { database, plugin } = createDatabase();
  const entityManager = database.entityManager;
  const probe = createCommitGraphProbe({
    rowsAffected: 1,
    // 代际发放的加法在库里做，紧接着的读回来也走原始语句（`activation-state.ts`），
    // 而替身不执行 SQL；不补这两下，发放当场就会因为「读回 0 行」抛错。见 `activation-sql.ts`。
    onQuery: runBranchGenerationSql
  });

  const fromChangeId = options.fromChangeId === undefined ? SOURCE_TIP_CHANGE_ID : options.fromChangeId;
  const headCommitId = options.headCommitId === undefined ? SOURCE_HEAD_COMMIT_ID : options.headCommitId;
  const entryCount = options.entryCount ?? 2;

  const sourceBranch = entityManager.instantiate(RxDBBranch);
  sourceBranch.id = SOURCE_BRANCH_ID;
  sourceBranch.activated = true;
  sourceBranch.activeKey = ACTIVE_BRANCH_KEY;
  sourceBranch.local = true;
  sourceBranch.remote = false;
  sourceBranch.parentId = null;
  sourceBranch.fromChangeId = null;

  const newBranch = entityManager.instantiate(RxDBBranch);
  newBranch.id = NEW_BRANCH_ID;
  newBranch.activated = false;
  newBranch.activeKey = null;
  newBranch.local = true;
  newBranch.remote = false;
  newBranch.parentId = SOURCE_BRANCH_ID;
  newBranch.fromChangeId = fromChangeId;
  probe.seed(RxDBBranch, [sourceBranch, newBranch]);

  const changes = SOURCE_CHANGE_IDS.map(id => {
    const change = entityManager.instantiate(RxDBChange);
    change.id = id;
    change.branchId = SOURCE_BRANCH_ID;
    change.type = 'UPDATE';
    // 显式写 `null` 而不是留空：tip 查询的条件是 `revertChangeId = null`，留 `undefined`
    // 会让替身一条都匹配不到，于是「源分支没有任何变更」这一支被伪装成了默认场景。
    change.revertChangeId = null;
    return change;
  });
  probe.seed(RxDBChange, changes);

  const sourceRef = entityManager.instantiate(CommitBranchRef);
  sourceRef.id = SOURCE_BRANCH_ID;
  sourceRef.branchId = SOURCE_BRANCH_ID;
  sourceRef.generation = 1;
  sourceRef.headCommitId = headCommitId;
  sourceRef.headRevision = 5;
  sourceRef.status = 'ok';
  sourceRef.corruptedAt = null;
  probe.seed(CommitBranchRef, [sourceRef]);

  const sourceState = entityManager.instantiate(WorkingTreeState);
  sourceState.id = SOURCE_BRANCH_ID;
  sourceState.branchId = SOURCE_BRANCH_ID;
  sourceState.baseHeadCommitId = headCommitId;
  sourceState.workingTreeRevision = 7;
  sourceState.entryCount = entryCount;
  probe.seed(WorkingTreeState, [sourceState]);

  const sourceEntries = Array.from({ length: entryCount }, (_unused, index) => createSourceEntry(entityManager, index));
  probe.seed(WorkingTreeEntry, sourceEntries);

  const activation = entityManager.instantiate(WorkingTreeActivationState);
  activation.id = WORKING_TREE_ACTIVATION_STATE_ID;
  activation.activationRevision = 0;
  activation.branchGenerationSeq = BRANCH_GENERATION_SEQ;
  probe.seed(WorkingTreeActivationState, [activation]);

  return {
    probe,
    sourceRef,
    sourceState,
    sourceEntries,
    run: () => plugin.system.writeBranchRows(entityManager, { executor: probe.executor, branchId: NEW_BRANCH_ID }),
    refOf: branchId => (probe.rowsOf(CommitBranchRef) as CommitBranchRef[]).find(row => row.id === branchId),
    stateOf: branchId => (probe.rowsOf(WorkingTreeState) as WorkingTreeState[]).find(row => row.id === branchId),
    entriesOf: branchId =>
      (probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[]).filter(row => row.branchId === branchId)
  };
}

/** 逐字段挑出一条条目的**身份与内容**；`id` / `branchId` 故意不在其中——那两项本来就该不同。 */
const contentOf = (entry: WorkingTreeEntry) => ({
  unitId: entry.unitId,
  transactionId: entry.transactionId,
  namespace: entry.namespace,
  entity: entry.entity,
  entityId: entry.entityId,
  operation: entry.operation,
  patch: entry.patch,
  inversePatch: entry.inversePatch,
  fingerprint: entry.fingerprint,
  origin: entry.origin,
  sourceChangeId: entry.sourceChangeId
});

describe('createBranch(branchId)：从当前物化状态创建（FR-017）', () => {
  it('新分支共享源分支当前 HEAD，但 revision 从 0 起', async () => {
    const scene = createScene();

    await scene.run();

    // 空 HEAD 会让新分支的 `listCommits()` 一条都读不到，而 `enable()` 把它当成「还没初始化」
    // 再补一个 baseline——同一条历史线上于是有两个根。
    // 继承 `headRevision` 则相反：它是 CAS 轴，继承之后「这个值是从哪条分支上捕获的」
    // 在数值上分辨不出来，而 CAS 的全部意义就是分辨它。
    expect({
      headCommitId: scene.refOf(NEW_BRANCH_ID)?.headCommitId,
      headRevision: scene.refOf(NEW_BRANCH_ID)?.headRevision,
      generation: scene.refOf(NEW_BRANCH_ID)?.generation,
      status: scene.refOf(NEW_BRANCH_ID)?.status
    }).toEqual({
      headCommitId: SOURCE_HEAD_COMMIT_ID,
      headRevision: 0,
      generation: EXPECTED_GENERATION,
      status: 'ok'
    });
  });

  it('不写任何 commit——共享 HEAD 靠指同一个不可变节点，不是复制一份历史', async () => {
    const scene = createScene();

    await scene.run();

    // 给新分支现造一个根节点会让同一段历史在库里有两条互不相交的链，
    // 而 commit 是不可变的：两条分支指着同一个节点本来就不会互相影响。
    expect(scene.probe.rowsOf(Commit)).toEqual([]);
    // 这条路径上只该发出代际发放那两条原始语句：就地 +1，以及紧跟着把号读回来
    // （`activation-state.ts`）。再多一条就意味着有人在这里另写了一次 HEAD——
    // 而共享 HEAD 靠的正是什么都不写。
    expect(activationUpdatesOf(scene.probe.statements)).toHaveLength(1);
    expect(scene.probe.statements.filter(sql => !isActivationStatement(sql))).toEqual([]);
    expect(scene.probe.statements).toHaveLength(2);
  });

  it('源分支的未提交条目整份复制进新分支，身份与内容逐字保留', async () => {
    const scene = createScene();

    await scene.run();

    const copied = scene.entriesOf(NEW_BRANCH_ID);
    // 不复制看起来最省事：新分支反正马上就要被切过去。代价是用户在新分支上 `discard()`
    // 会把源分支的未提交改动一并丢掉，而两条分支在界面上是两件东西。
    expect(copied.map(contentOf)).toEqual(scene.sourceEntries.map(contentOf));
    // `unitId` 逐字保留：它上面没有唯一约束（唯一的只有 `['commitId','sequence']`），
    // 重新发号则会把一次事务里的多个单元拆成互不相干的几组，提交时它们不再进同一个序列。
    expect(copied.map(entry => entry.unitId).sort()).toEqual(scene.sourceEntries.map(entry => entry.unitId).sort());
  });

  it('复制出来的是独立的行：id 重新签发，行本身不与源共享', async () => {
    const scene = createScene();

    await scene.run();

    const copied = scene.entriesOf(NEW_BRANCH_ID);
    const sourceIds = new Set(scene.sourceEntries.map(entry => entry.id));
    // 先数一遍再看 id：`every()` 在空数组上恒为 true，少了这一行，这条断言会在
    // 一条都没复制的时候照样报绿——而「一条都没复制」正是它要防的那种失败。
    expect(copied).toHaveLength(scene.sourceEntries.length);
    // 沿用源 id 会让两条分支的条目撞主键；而 `['branchId','namespace','entity','entityId']`
    // 那条唯一索引管不到这件事——它按分支分区，撞的是主键。
    expect(copied.every(entry => entry.id.length > 0 && !sourceIds.has(entry.id))).toBe(true);
    expect(copied.every(entry => !scene.sourceEntries.includes(entry))).toBe(true);
  });

  it('patch 是深拷贝：改新分支那一份不会动到源分支', async () => {
    const scene = createScene();

    await scene.run();

    const [copied] = scene.entriesOf(NEW_BRANCH_ID);
    // 抄引用的话，新分支上的一次折叠会就地改掉源分支那一行的正向补丁——
    // 两条分支的「未提交变更」从此是同一份数据，而没有任何一方会报错。
    copied.patch = { ...copied.patch, title: '只在新分支上改' };
    expect(scene.sourceEntries[0].patch).toEqual({ title: '新标题 0' });
    expect(scene.entriesOf(NEW_BRANCH_ID)[0].patch).not.toEqual(scene.sourceEntries[0].patch);
  });

  it('工作树状态行跟着复制：entryCount 与 baseHeadCommitId 照抄，revision 从 0 起', async () => {
    const scene = createScene();

    await scene.run();

    // `entryCount` 是 `status().clean` 的唯一依据（SC-001 要它走常数时间）。复制了条目却把
    // 它留在 0，新分支会在有两条未提交改动时报「干净」，而 `commit()` 照样把它们提交掉。
    expect({
      entryCount: scene.stateOf(NEW_BRANCH_ID)?.entryCount,
      baseHeadCommitId: scene.stateOf(NEW_BRANCH_ID)?.baseHeadCommitId,
      workingTreeRevision: scene.stateOf(NEW_BRANCH_ID)?.workingTreeRevision
    }).toEqual({
      entryCount: 2,
      baseHeadCommitId: SOURCE_HEAD_COMMIT_ID,
      workingTreeRevision: 0
    });
    expect(scene.entriesOf(NEW_BRANCH_ID)).toHaveLength(2);
  });

  it('源分支干净时不凭空造条目', async () => {
    const scene = createScene({ entryCount: 0 });

    await scene.run();

    expect(scene.entriesOf(NEW_BRANCH_ID)).toEqual([]);
    expect(scene.stateOf(NEW_BRANCH_ID)?.entryCount).toBe(0);
  });

  it('源分支还没有根时，新分支同样是 null——不伪造一个空 HEAD', async () => {
    const scene = createScene({ headCommitId: null, entryCount: 0 });

    await scene.run();

    // `null` 是「还没有根」而不是「空历史」：伪造一个根等于宣称这条分支已初始化过，
    // `enable()` 会据此跳过它，于是它永远拿不到 baseline。
    expect(scene.refOf(NEW_BRANCH_ID)?.headCommitId).toBeNull();
    expect(scene.probe.rowsOf(Commit)).toEqual([]);
  });
});

describe('createBranch(branchId, fromChangeId)：以 branch_baseline 锚定（FR-017）', () => {
  it('写下一个 kind=branch_baseline 的无父根节点', async () => {
    const scene = createScene({ fromChangeId: HISTORY_CHANGE_ID });

    await scene.run();

    const [baseline] = scene.probe.rowsOf(Commit) as Commit[];
    // 挂到源分支 HEAD 底下就是在宣称「这个历史点之后的提交也在这条新分支上」，
    // 而分叉点恰恰在它们之前；写成 `baseline` 则让 FR-044 的物化屏障认不出它是怎么来的。
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
    expect(scene.probe.rowsOf(CommitChangeSet)).toEqual([]);
  });

  it('HEAD 走的是同一条 CAS，不另开写 HEAD 的第二条路', async () => {
    const scene = createScene({ fromChangeId: HISTORY_CHANGE_ID });

    await scene.run();

    // 另写一条「建分支专用」的 UPDATE 意味着 CAS 的 generation / status 两个条件
    // 会在这条路上被悄悄放宽，而放宽之后没有任何测试会红。
    // 代际发放那两条打在激活态表上，与 HEAD 无关，先摘掉再数——按 `isActivationUpdate` 摘
    // 只摘得掉 +1 那条，读回来那条 SELECT 会被当成 HEAD 语句数进来。
    const headStatements = scene.probe.statements.filter(sql => !isActivationStatement(sql));
    expect(headStatements).toHaveLength(1);
    const [sql] = headStatements;
    expect(normalizeSql(sql)).toMatch(new RegExp(`^update\\b[^]*\\b${REF_TABLE}\\b`));
    expect(whereClauseOf(sql)).toContain(String(EXPECTED_GENERATION));
    expect(setClauseOf(sql)).toContain('1');
  });

  it('不复制工作树——历史点的状态与当前那些未提交改动无关', async () => {
    const scene = createScene({ fromChangeId: HISTORY_CHANGE_ID });

    await scene.run();

    // 复制过去等于把「现在还没提交的改动」栽给一个历史节点：用户从一个旧 change 上开分支，
    // 本意正是把当下这些改动留在原地。
    expect(scene.entriesOf(NEW_BRANCH_ID)).toEqual([]);
    expect({
      entryCount: scene.stateOf(NEW_BRANCH_ID)?.entryCount,
      workingTreeRevision: scene.stateOf(NEW_BRANCH_ID)?.workingTreeRevision
    }).toEqual({ entryCount: 0, workingTreeRevision: 0 });
  });

  it('分叉点正好落在源分支 tip 上时按「当前物化状态」走，不看调用方用了哪个重载', async () => {
    const scene = createScene({ fromChangeId: SOURCE_TIP_CHANGE_ID });

    await scene.run();

    // 判据是库里那两个值，不是「传没传第二个实参」。反过来的话，
    // `createBranch(b, 源分支tip的id)` 与 `createBranch(b)` 会对同一个状态给出两种答案。
    expect(scene.probe.rowsOf(Commit)).toEqual([]);
    expect(scene.entriesOf(NEW_BRANCH_ID)).toHaveLength(2);
  });
});

describe('分支之间不共享可变 HEAD 与工作树（FR-017）', () => {
  it('两条分支各持一份 ref 与 state，源分支的行一个字都没被改', async () => {
    const scene = createScene();

    await scene.run();

    expect(scene.refOf(NEW_BRANCH_ID)).not.toBe(scene.sourceRef);
    expect(scene.stateOf(NEW_BRANCH_ID)).not.toBe(scene.sourceState);
    // 「复制」被写成「把源分支的行改个 branchId 挪过去」时，源分支会当场少掉全部未提交改动。
    expect({
      headCommitId: scene.sourceRef.headCommitId,
      headRevision: scene.sourceRef.headRevision,
      generation: scene.sourceRef.generation,
      entryCount: scene.sourceState.entryCount,
      workingTreeRevision: scene.sourceState.workingTreeRevision,
      baseHeadCommitId: scene.sourceState.baseHeadCommitId
    }).toEqual({
      headCommitId: SOURCE_HEAD_COMMIT_ID,
      headRevision: 5,
      generation: 1,
      entryCount: 2,
      workingTreeRevision: 7,
      baseHeadCommitId: SOURCE_HEAD_COMMIT_ID
    });
    expect(scene.entriesOf(SOURCE_BRANCH_ID)).toHaveLength(2);
  });

  it('推进新分支的 HEAD 不会带动源分支', async () => {
    const scene = createScene();

    await scene.run();

    const created = scene.refOf(NEW_BRANCH_ID);
    if (!created) throw new Error('新分支没有 ref');
    created.headCommitId = 'commit-only-on-feature';
    created.headRevision = 1;

    // 两条分支共用同一行 ref 时，这一段在替身上同样「通过」——直到断言换成读源分支。
    expect(scene.sourceRef.headCommitId).toBe(SOURCE_HEAD_COMMIT_ID);
    expect(scene.sourceRef.headRevision).toBe(5);
  });
});
