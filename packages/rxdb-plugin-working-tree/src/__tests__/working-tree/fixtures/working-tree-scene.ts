/**
 * @fileoverview US-306 阶段 B（T069–T077）九个红测试共用的场景工厂。
 *
 * @remarks
 * 九个用例文件各自手搓一遍「能力行 + 激活分支 + ref + 工作树状态行 + 激活态单行」
 * 的种子数据，五张表里任意一张的初值在某一处被改写，其余八个文件就开始测另一个库。
 * 所以种子集中在这里一份，**可调的只有各用例真正要拨的那几个旋钮**
 * （`headRevision` / `workingTreeRevision` / `activationRevision` / 条目）。
 *
 * 它刻意**不**是内存数据库：底层仍是 `createCommitGraphProbe()` 那个只认一小撮算子、
 * 遇到别的直接抛的替身。真实 SQL 与跨重启语义由六个后端上的 conformance 套件
 * （`working-tree/testing/commit.suite.ts`，T085）负责。
 */

import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDB,
  RXDB_CHANGE_CODEC_VERSION,
  RxDBBranch,
  SyncType
} from '@aiao/rxdb';
import type { CommitChangeUnit } from '../../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../../commit/change-unit.js';
import { CommitBranchRef } from '../../../commit/commit-branch-ref.entity.js';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from '../../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../../commit/commit-change-set.entity.js';
import type { CommitWriteContext } from '../../../commit/commit-context.js';
import { createCommitWriteContext } from '../../../commit/commit-context.js';
import { Commit } from '../../../commit/commit.entity.js';
import { buildCommitRows } from '../../../commit/write-commit.js';
import { rxDBPluginWorkingTree } from '../../../plugin.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../../working-tree/working-tree-entry.entity.js';
import type { WorkingTreeManager } from '../../../working-tree/working-tree-facade.js';
import { WorkingTreeRestoreSession } from '../../../working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../../../working-tree/working-tree-state.entity.js';
import { createCommitGraphProbe } from '../../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter, type MockLocalAdapter } from '../../fixtures/test-db-setup.js';

/** 本文件造出来的分支 id；九个用例文件都拿它当「当前分支」。 */
export const SCENE_BRANCH_ID = 'main';

/**
 * 场景里那些条目/单元指向的业务实体。
 *
 * @remarks
 * **必须真注册进库**，不是为了往它里面写东西——九个用例文件一次 `save()` 都不调。理由是
 * FR-038：`commitWorkingTree()` 在算 `contentFingerprint` 之前会拿每个变更单元的
 * `namespace` / `entity` 去 `schemaManager` 解析目标元数据（要知道哪几列是加密列），
 * 解析不到就 fail-closed 地抛（`commit/commit-codec.ts`）。于是种子条目的身份不能是
 * 一对手写字面量，只能取自一个真存在的实体——{@link entrySeedDefaults} 与
 * {@link commitUnitOf} 都从它的元数据上现取。
 *
 * 命名空间刻意不用默认的 `public`：种子数据从一开始就写作 `app.Note`，而「同名不同
 * namespace 不是同一个实体」正是 `versioned-domain.ts` 复合键那条不变量的题面，
 * 场景里留一个非默认 namespace 能让它顺带被走到。
 */
@Entity({
  name: 'Note',
  namespace: 'app',
  tableName: 'scene_notes',
  properties: [{ name: 'title', type: PropertyType.string }]
})
export class SceneNote extends EntityBase {
  /** 种子 patch 唯一碰的那一列 */
  title!: string;
}

/** {@link SceneNote} 的元数据；种子条目的 `namespace` / `entity` 只从这里取。 */
const SCENE_NOTE = getEntityMetadata(SceneNote);

/**
 * 带一个**加密列**的场景实体；只有 FR-043（T104）那一组用得到它。
 *
 * @remarks
 * 加了它而不是把 {@link SceneNote} 改成带加密列：十几个用例文件的种子条目全部指向
 * `app.Note`，给它加一列加密字段会让每一处 `patch` 的编解码形态一起变，而那些用例
 * 测的都不是加密。两个实体并存时，想测加密的显式指向 `app.Secret`，其余原样不动。
 *
 * `secret` 是 `binary` + `encrypted: true`：`change-codec.ts:17` 对 `encrypted === true`
 * 的列**一律跳过** codec，所以它的落库形态就是上游给的那份 envelope 原物——
 * 「envelope 不降级」这句话的可观测面正是这一条。
 */
@Entity({
  name: 'Secret',
  namespace: 'app',
  tableName: 'scene_secrets',
  properties: [
    { name: 'label', type: PropertyType.string },
    { name: 'secret', type: PropertyType.binary, encrypted: true },
    { name: 'thumbnail', type: PropertyType.binary }
  ]
})
export class SceneSecret extends EntityBase {
  /** 明文字符串列；对照组之一 */
  label!: string;

  /** **加密** binary 列：codec 一律跳过，落库形态即上游那份 envelope 原物 */
  secret!: Uint8Array;

  /**
   * **不加密**的 binary 列；与 {@link SceneSecret.secret} 同类型、只差 `encrypted`。
   *
   * @remarks
   * 它的存在是为了让「跳过加密列」这句话有一个**同类型的反面**：两列都是 `binary`，
   * 一个该被 codec 包成 `$rxdbChangeValue` 信封、一个必须原样穿过去。只留加密列的话，
   * 「codec 整个没跑」与「codec 跑了且正确跳过了加密列」两种实现给出的观测完全一样。
   */
  thumbnail!: Uint8Array;
}

/** {@link SceneSecret} 的元数据。 */
export const SCENE_SECRET = getEntityMetadata(SceneSecret);

/** {@link createWorkingTreeScene} 的可调项；没列出来的字段没人拨过。 */
export interface WorkingTreeSceneOptions {
  /** 2.5 `CommitBranchRef.headRevision`，默认 0 */
  readonly headRevision?: number;
  /** 2.5 `CommitBranchRef.headCommitId`，默认 `null`（空分支） */
  readonly headCommitId?: string | null;
  /** 2.6 `WorkingTreeState.workingTreeRevision`，默认 0 */
  readonly workingTreeRevision?: number;
  /** 2.2 `WorkingTreeActivationState.activationRevision`，默认 0 */
  readonly activationRevision?: number;
  /** 预置的未提交条目；`entryCount` 由本工厂按它的长度算出，不接受单独指定 */
  readonly entries?: readonly Partial<WorkingTreeEntrySeed>[];
  /** `executor.query()` 的固定 `rowsAffected`；CAS 命不命中由它决定，默认 1（命中） */
  readonly rowsAffected?: number;
}

/** 一条工作树条目的可拨字段，其余字段由 {@link seedWorkingTreeEntry} 给默认值。 */
export interface WorkingTreeEntrySeed {
  readonly id: string;
  /** 所属分支；默认 {@link SCENE_BRANCH_ID}，拨成别的用于「隔壁分支的条目不该被读到」那类用例 */
  readonly branchId: string;
  readonly unitId: string;
  readonly transactionId: string | null;
  readonly namespace: string;
  readonly entity: string;
  readonly entityId: string;
  readonly operation: 'insert' | 'update' | 'delete';
  readonly patch: Record<string, unknown> | null;
  readonly inversePatch: Record<string, unknown> | null;
  readonly fingerprint: string;
  readonly origin: 'local' | 'remote_sync';
  readonly sourceChangeId: number | null;
}

/** 一个装好种子的库 + 它的探针。 */
export interface WorkingTreeScene {
  readonly database: RxDB;
  readonly adapter: MockLocalAdapter;
  readonly manager: WorkingTreeManager;
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly branchId: string;
  /** `commitWorkingTree()` 要的写上下文；与门面里那份同源（`createCommitWriteContext`） */
  readonly context: CommitWriteContext;
  /** 直接往探针里再塞条目；返回塞进去的那一行 */
  readonly addEntry: (seed?: Partial<WorkingTreeEntrySeed>) => WorkingTreeEntry;
  /** 直接往探针里塞一条恢复会话行；`status()` 的 `restoring` / `conflicted` 只认它 */
  readonly addRestoreSession: (seed: RestoreSessionSeed) => WorkingTreeRestoreSession;
}

/** {@link WorkingTreeScene.addRestoreSession} 的入参。 */
export interface RestoreSessionSeed {
  readonly targetCommitId: string;
  readonly expectedHeadRevision: number;
  readonly expectedWorkingTreeRevision: number;
  readonly status: 'active' | 'conflicted' | 'committed';
}

/** 条目的默认形状；用例只拨自己关心的那一两个字段。 */
const entrySeedDefaults = (index: number): WorkingTreeEntrySeed => ({
  id: `entry-${index}`,
  branchId: SCENE_BRANCH_ID,
  unitId: `unit-${index}`,
  transactionId: null,
  namespace: SCENE_NOTE.namespace,
  entity: SCENE_NOTE.name,
  entityId: `note-${index}`,
  operation: 'update',
  patch: { title: `改后-${index}` },
  inversePatch: { title: `改前-${index}` },
  fingerprint: `fingerprint-${index}`,
  origin: 'local',
  sourceChangeId: null
});

/**
 * 造一个「已启用提交能力、有一条激活分支」的库。
 *
 * @param options - 见 {@link WorkingTreeSceneOptions}
 * @returns 装好种子的场景
 */
export function createWorkingTreeScene(options: WorkingTreeSceneOptions = {}): WorkingTreeScene {
  const database = new RxDB({
    dbName: `rxdb-working-tree-scene-${Math.random().toString(36).slice(2)}`,
    entities: [SceneNote, SceneSecret],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(database);
  database.adapter('local', () => adapter);
  // 十张系统表随 `@aiao/rxdb-plugin-working-tree` 走，核心的 `SYSTEM_ENTITIES` 里没有它们；
  // `use()` 时核心才读插件的系统贡献并把这批实体登记进去。这一行漏了的话，下面
  // `entityManager.instantiate(CommitCapabilityState)` 抛的是「need init rxdb」——
  // 一条读不出主语的错，而九个用例文件全都经过这里。
  //
  // 必须在 `init()` **之前**：带系统贡献的插件晚于 `init()` 注册会被核心当场拒掉。
  database.use(rxDBPluginWorkingTree);
  database.init();

  const probe = createCommitGraphProbe({ rowsAffected: options.rowsAffected ?? 1 });
  const { entityManager } = database;

  const capability = entityManager.instantiate(CommitCapabilityState);
  capability.id = COMMIT_CAPABILITY_STATE_ID;
  capability.enabled = true;
  capability.protocolVersion = COMMIT_PROTOCOL_VERSION;
  capability.schemaVersion = COMMIT_GRAPH_SCHEMA_VERSION;
  capability.codecVersion = RXDB_CHANGE_CODEC_VERSION;
  capability.enabledAt = new Date('2026-01-01T00:00:00.000Z');
  probe.seed(CommitCapabilityState, [capability]);

  const branch = entityManager.instantiate(RxDBBranch);
  branch.id = SCENE_BRANCH_ID;
  branch.activated = true;
  branch.local = true;
  branch.remote = false;
  branch.parentId = null;
  branch.fromChangeId = null;
  probe.seed(RxDBBranch, [branch]);

  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = SCENE_BRANCH_ID;
  ref.branchId = SCENE_BRANCH_ID;
  ref.generation = 1;
  ref.headCommitId = options.headCommitId ?? null;
  ref.headRevision = options.headRevision ?? 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  probe.seed(CommitBranchRef, [ref]);

  const activation = entityManager.instantiate(WorkingTreeActivationState);
  activation.id = WORKING_TREE_ACTIVATION_STATE_ID;
  activation.activationRevision = options.activationRevision ?? 0;
  activation.branchGenerationSeq = 1;
  probe.seed(WorkingTreeActivationState, [activation]);

  const state = entityManager.instantiate(WorkingTreeState);
  state.id = SCENE_BRANCH_ID;
  state.branchId = SCENE_BRANCH_ID;
  state.baseHeadCommitId = options.headCommitId ?? null;
  state.workingTreeRevision = options.workingTreeRevision ?? 0;
  state.entryCount = 0;
  state.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  probe.seed(WorkingTreeState, [state]);

  adapter.transaction.mockImplementation(async fun => fun(probe.executor));

  let nextIndex = 0;
  const addEntry = (seed: Partial<WorkingTreeEntrySeed> = {}): WorkingTreeEntry => {
    const merged = { ...entrySeedDefaults(nextIndex), ...seed };
    nextIndex += 1;
    const row = entityManager.instantiate(WorkingTreeEntry);
    Object.assign(row, merged, {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    probe.seed(WorkingTreeEntry, [row]);
    // 冗余列与实际行数**在同一处**一起改：种子里就分家的话，用例测的是一个
    // 现实中不可能出现的库，而 `status()` 的常数时间判据正建立在两者一致上。
    // 只数本分支：`entryCount` 是**分支级**冗余列，隔壁分支的条目不进这个数。
    if (merged.branchId === SCENE_BRANCH_ID) state.entryCount += 1;
    return row;
  };

  const addRestoreSession = (seed: RestoreSessionSeed): WorkingTreeRestoreSession => {
    const row = entityManager.instantiate(WorkingTreeRestoreSession);
    row.id = `restore-${Math.random().toString(36).slice(2)}`;
    row.branchId = SCENE_BRANCH_ID;
    row.targetCommitId = seed.targetCommitId;
    row.expectedHeadRevision = seed.expectedHeadRevision;
    row.expectedWorkingTreeRevision = seed.expectedWorkingTreeRevision;
    row.status = seed.status;
    row.activeKey = seed.status === 'committed' ? null : SCENE_BRANCH_ID;
    row.createdAt = new Date('2026-01-01T00:00:00.000Z');
    row.updatedAt = new Date('2026-01-01T00:00:00.000Z');
    probe.seed(WorkingTreeRestoreSession, [row]);
    return row;
  };

  for (const seed of options.entries ?? []) addEntry(seed);

  return {
    database,
    adapter,
    manager: database.workingTree,
    probe,
    branchId: SCENE_BRANCH_ID,
    context: createCommitWriteContext(adapter),
    addEntry,
    addRestoreSession
  };
}

/** {@link seedCommit} 塞进历史里的那条变更单元；内容不重要，自洽才重要。 */
const commitUnitOf = (unitId: string): CommitChangeUnit => {
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId,
    transactionId: null,
    namespace: SCENE_NOTE.namespace,
    entity: SCENE_NOTE.name,
    entityId: `note-${unitId}`,
    operation: 'update',
    patch: { title: '改后' },
    inversePatch: { title: '改前' },
    baseFingerprint: 'fp-base',
    origin: 'local'
  };
  return { ...base, fingerprint: computeChangeUnitFingerprint(base) };
};

/**
 * 往场景里塞一个**自洽**的 commit（含它的 changeSet 行）。
 *
 * @param scene - 目标场景
 * @param id - commit id；`headCommitId` 拨成非 `null` 时必须有一条 id 对得上的
 * @param parentIds - 父节点；空数组造出的是 baseline
 * @returns 塞进去的那一行
 *
 * @remarks
 * 拨了 `headCommitId` 却不 seed 对应的 commit 行，场景就是一个**可达父链断掉**的库：
 * `commit()` / `discard()` / `restore()` 三条入口在真正干活之前都会过
 * {@link assertCommitGraphIntact}，于是用例会拿到一个 `commit_graph_corrupted`，
 * 而它想测的那件事一次都没跑到。行由 `buildCommitRows()` 造而不是手搓：
 * `contentFingerprint` 与 `changeSetCount` 由写路径自己算出来，守卫才会认。
 */
export const seedCommit = (
  scene: WorkingTreeScene,
  id: string,
  parentIds: readonly string[] = [],
  units: readonly CommitChangeUnit[] = [commitUnitOf(`${id}-unit`)]
): Commit => {
  const baseline = parentIds.length === 0;
  const { commit, changeSets } = buildCommitRows(scene.database.entityManager, {
    id,
    kind: baseline ? 'baseline' : 'normal',
    parentIds: [...parentIds],
    message: baseline ? null : `commit ${id}`,
    author: baseline ? null : 'alice',
    operationId: `00000000-0000-4000-8000-${id.replace(/\W/g, '').padStart(12, '0').slice(-12)}`,
    units: [...units]
  });
  scene.probe.seed(Commit, [commit]);
  scene.probe.seed(CommitChangeSet, changeSets);
  return commit;
};

/** 取场景里那一行工作树状态；断言 `workingTreeRevision` / `entryCount` 时用。 */
export const stateRowOf = (scene: WorkingTreeScene): WorkingTreeState =>
  scene.probe.rowsOf(WorkingTreeState)[0] as WorkingTreeState;

/** 取场景里那一行 ref；断言 `headRevision` / `headCommitId` 时用。 */
export const refRowOf = (scene: WorkingTreeScene): CommitBranchRef =>
  scene.probe.rowsOf(CommitBranchRef)[0] as CommitBranchRef;

/** 取场景里当前还在的工作树条目。 */
export const entryRowsOf = (scene: WorkingTreeScene): WorkingTreeEntry[] =>
  scene.probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[];
