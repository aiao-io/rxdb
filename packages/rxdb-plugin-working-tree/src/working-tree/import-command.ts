/**
 * @fileoverview `importCommits(commits, options)` —— 把服务端下发的一段提交原样写进当前分支，分支头快进到最后一个（US-316）。
 *
 * @remarks
 * 一次导入做三件事，全在调用方的一个写事务里：提交节点按原 id、父链、作者、消息、时间与内容指纹入库；第一父链上新到的
 * 每个提交依次把它的 ChangeSet 叠到业务表上；分支头按修订号比较交换推进到批次的最后一个提交。工作树前后都是 clean，
 * 导入的变化一条都不进工作树——它们已经是提交了。
 *
 * ## 数据模型：每个提交的 ChangeSet 是相对第一父的增量
 *
 * 合并提交也一样（`commit.entity.ts` 的 `CommitKind`）。于是「分支头沿第一父链快进」与「把第一父链上新到的 ChangeSet
 * 依次叠上去」是同一件事：此刻的业务表等于当前头的数据（工作树 clean），叠上下一个提交的增量就等于那个提交的数据。
 * 合并提交非第一父那一侧的提交（侧枝）只作为历史节点入库，它们的 ChangeSet **不**落业务表——它们对这条线的全部影响
 * 已经折进了合并提交相对第一父的那份增量里，再叠一遍就是叠两遍。
 *
 * ## 批次的形状（{@link CommitImportBatchProblem}）
 *
 * - **拓扑序**：每个提交的父要么本库已有，要么在批次里排在它前面。
 * - **最后一个就是新头**：其余每个提交都必须是它的祖先（沿全部父链），批次里没有挂在新头之外的提交。
 * - **全部父都要在**：合并提交的第二父（被合并进来的任务分支头）本地没有，就得在同一批里排在前面。缺了就整批拒绝
 *   （`missing_parent`），不收「浅」父——`assertCommitGraphIntact()` 把「可达父链指向一个读不回来的提交」判成损坏，
 *   收下一个浅父就等于亲手写进一处损坏，下一次 `commit()` 会把这条分支闩成只读。支持浅父得先给守卫一份「已知的浅边界」，
 *   那是一次规格变更，不在本故事里。
 *
 * ## 快进的判定
 *
 * 从新头沿第一父链往回走：
 *
 * 1. 走到当前头——当前头之后、新头为止的那一段就是要叠上去的提交，分支头快进到新头；
 * 2. 走到根也没碰到当前头——只有当前分支是**空分支**时才接受（链从根开始）：HEAD 为 `null`，或 HEAD 是一个系统根节点
 *    （启用时写下的基线 / 建分支写下的分支基线，没有任何用户提交），且这条分支的受版本控制的业务表一行都没有。
 *    第二台设备第一次导入就是这个形状：它启用时写下的是它自己的基线，服务端不认识，链从服务端那一份根开始。
 *    业务表必须是空的，因为链根代表空状态——本地基线下压着的那批存量数据不在任何提交里，换根之后就成了说不清来历的数据；
 * 3. 都不是——新头已经在当前分支的历史里（同一批再导入一次、或导入之后又本地提交过）就是什么都不做的成功；否则拒绝
 *    `not_fast_forward`：当前头不在新头的第一父链上，本地有服务端不知道的提交，或者服务端把本地这条线作为非第一父并进了
 *    另一条主线。前者先上传再导入，后者要服务端以本地当前头为第一父建合并提交。
 *
 * 已在本库的提交不重复写节点，但**落没落到这条分支的业务表上看的是可达性，不是存在性**：提交节点不属于任何分支
 * （`rxdb_commit` 上没有 `branchId`），一个在别的分支上提交过、被服务端快进进主线的提交，在本分支上照样要叠一遍它的 ChangeSet。
 *
 * ## 前像核对
 *
 * 叠业务表之前，第一父链上每个单元写之前的那一行都要与叠到它时的业务行对得上：插入时这一行不在，修改与删除时这一行在、
 * 且 `inversePatch` 覆盖的跟踪业务列逐个相等（规则与理由见 `import-precondition.ts`）。服务端按一份与本机不同的数据
 * 算了增量时，叠上去不会报错——打空的 UPDATE / DELETE 静默落空，打在旧值上的 UPDATE 拼出一个谁都没见过的组合——
 * 两台设备就此静默分叉。对不上即整批 `precondition_mismatch`，零写入。
 *
 * ## 幂等与同 id 不同内容
 *
 * 判同一性只看 id 与内容指纹：已有且指纹相同就是同一个提交，跳过（保留本地那一份时间，历史不改写）；已有而指纹不同就是
 * `commit_id_conflict`，整批拒绝。时间不进指纹，也不进这条判定——服务端改写了时间不该让一次正常的回传失败。
 *
 * ## 被拒是返回值、零写入
 *
 * 全部判定排在第一条写语句之前，被拒的每一种都是 `ok: false` 的**返回值**，持久状态零变化。诊断只带 id、实体名与枚举，
 * 不带消息、作者或补丁内容（FR-043）。两类情况**抛**而不是返回：加密列里躺着明文（`CommitEncryptedAtRestError`，
 * 安全违规，与本地提交同一道门）与补丁里有落不进 JSON 列的值（`RxDBError`，调用方没按 JSON 值传）。
 *
 * ## 业务表回写：登记表 #15，入口投影重写，触发器开着
 *
 * 见 {@link applyImportedCommit} 与核心 `TrustedWriteIntent.remote_commit_import`。导入的变化进变更日志，所以切分支、
 * 分支对比与合并预览、撤销栈都与业务表一致；代价是它们对通用实体同步而言就是待推送的本地变更，于是导入拒绝写
 * 任何走 changelog 推送的实体（`unsupported_entity` / `synced`）。**导入与通用实体同步同时用在同一批实体上不受支持。**
 *
 * ## 边界
 *
 * - **只在主检出位导入**（epic-006「只有主检出位同步」）：挂在可写检出位上时返回 `not_main_checkout`。
 * - **不经 `commits$` 发事件**：那条流的订阅者通常是上传逻辑，导入的提交本就来自服务端，再发一次就是回声。
 * - **撤销栈上多一步**：外层是带事务日志的受管事务，整次导入是一个 `TRANSACTION` 项；撤销它会把业务表退回导入之前，
 *   退回的改动经撤销入口落成工作树条目（相对新 HEAD），与 US-317 的 discard 同一个结果。
 */

import type { EntitySyncResolver, EntityType, SwitchVersionActions, TransactionExecutor } from '@aiao/rxdb';
import { declareTrustedWrite, getEntityMetadata, needsPush, TrustedWriteIntent } from '@aiao/rxdb';
import type { CommitChangeUnitContent, CommitChangeUnitOperation } from '../commit/change-unit.js';
import { computeCommitExchangeRecordFingerprint } from '../commit/change-unit.js';
import { isCommitReachable } from '../commit/commit-ancestry.js';
import { CommitBranchRef } from '../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../commit/commit-change-set.entity.js';
import { assertCommitUnitsEncryptedAtRest, decodeCommitChangeSetUnit } from '../commit/commit-codec.js';
import type { CommitWriteContext } from '../commit/commit-context.js';
import type { CommitExchangeRecord } from '../commit/commit-exchange.js';
import { readCommitForkPoint, recordCommitForkPoint } from '../commit/commit-fork-point.js';
import { assertCommitGraphIntact } from '../commit/commit-graph-guard.js';
import { deriveImportedCommitOperationId } from '../commit/commit-idempotency.js';
import type { Commit } from '../commit/commit.entity.js';
import { loadCommitsByIds, readCommitBranchRef } from '../commit/list-commits.js';
import { buildAdvanceHeadCas, buildCommitRows } from '../commit/write-commit.js';
import { readActiveBranchToken, readWorkingTreeStateRow } from './capture-runtime.js';
import { findCommitConflict, type CommitConflict, type WorkingTreeCredentials } from './commit-conflict.js';
import { checkCommitExchangeBatch, type CommitImportBatchProblem } from './import-batch.js';
import { findImportPreconditionMismatch, type ImportApplyingCommit } from './import-precondition.js';
import { hasProjectionWrites, projectionActionsOf } from './projection-actions.js';
import { readActiveRestoreSessionRow } from './restore-session-transitions.js';
import type { VersionedDomain } from './versioned-domain.js';
import { buildWorkingTreeImportTransitionSql } from './working-tree-state-sql.js';
import { WorkingTreeState } from './working-tree-state.entity.js';

/**
 * 一次 `importCommits()` 的入参：三个捕获位，与 `discard()` / `restore()` 同一组凭据。
 *
 * @remarks
 * 导入推进 HEAD，`expectedHeadRevision` 就是那条比较交换的锚点；另外两个位让「我看的是这条分支、这棵干净的工作树」
 * 有据可查——缺省成「内部读一次当前值」的话，比较恒等、CAS 永远命中，正是 FR-031 点名的退化形态。
 *
 * @public
 */
export type CommitImportOptions = WorkingTreeCredentials;

export type { CommitImportBatchProblem } from './import-batch.js';

/**
 * 实体不能导入的原因（`unsupported_entity` 的 `problem`）。
 *
 * - `unregistered`：本客户端没注册这个实体——认不出它的加密列，也写不了它的表（任何一个提交的任何单元都查）
 * - `untracked`：实体不受版本控制（QueryCache 实体、关闭了变更日志的实体）；它不该出现在提交里（只查要叠到业务表上的单元）
 * - `synced`：实体走通用实体同步的 changelog 推送（`needsPush()` 为真）；导入写下的变更日志会被它当成本地编辑推回去（只查要叠到业务表上的单元）
 *
 * @public
 */
export type CommitImportEntityProblem = 'unregistered' | 'untracked' | 'synced';

/**
 * 一次 `importCommits()` 的结果。
 *
 * @remarks
 * 判别位是 `ok` 与 `reason`，被拒的每一种都是**返回值**而不是异常：调用本身成功了，结论是「这批不能收」——
 * 与 `restore()` 的被拒出口同一个口径。被拒时持久状态零变化。
 *
 * 成功出口里，`importedCount: 0` 加 `appliedCount: 0` 就是什么都没做的 no-op（同一批再导入一次），不另立布尔位。
 *
 * @public
 */
export type CommitImportResult =
  | {
      /** 导入已落库（或是一次 no-op）：业务表等于 `headCommitId` 的数据，工作树 clean */
      readonly ok: true;
      /** 导入之后的分支头 */
      readonly headCommitId: string | null;
      /** 导入之后的 HEAD 修订号；快进了一次就加一，no-op 时是原值 */
      readonly headRevision: number;
      /** 本次新写入的提交节点数；已在本库的不算 */
      readonly importedCount: number;
      /** 分支头越过的提交数，即 ChangeSet 被叠到业务表上的提交数；侧枝提交不算 */
      readonly appliedCount: number;
    }
  | {
      /** 三个捕获位中有一个对不上，或 HEAD 那条 CAS 没命中 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'conflict';
      /** 诊断值；**不入库** */
      readonly conflict: CommitConflict;
    }
  | {
      /** 挂在可写检出位上；只在主检出位导入 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'not_main_checkout';
    }
  | {
      /** 工作树里有未提交条目，或有未结束的恢复会话；先 commit 或 discard */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'dirty_working_tree';
    }
  | {
      /** 批次形状不对，见 {@link CommitImportBatchProblem} */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'invalid_batch';
      /** 哪一种毛病 */
      readonly problem: CommitImportBatchProblem;
      /** 出毛病的那个提交；`empty_batch` 与认不出 id 的记录为 `null` */
      readonly commitId: string | null;
    }
  | {
      /** 有单元指向一个不能导入的实体，见 {@link CommitImportEntityProblem} */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'unsupported_entity';
      /** 哪一种不能 */
      readonly problem: CommitImportEntityProblem;
      /** 那个单元所在的提交 */
      readonly commitId: string;
      /** 实体命名空间 */
      readonly namespace: string;
      /** 实体名 */
      readonly entity: string;
    }
  | {
      /** 按内容复算的指纹与记录声明的 `contentFingerprint` 不符 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'fingerprint_mismatch';
      /** 指纹不符的那个提交 */
      readonly commitId: string;
    }
  | {
      /** 本库已有同 id 的提交，内容指纹却不同 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'commit_id_conflict';
      /** 撞上的那个 id */
      readonly commitId: string;
    }
  | {
      /** 某个提交的父既不在本库、也不在批次里排在它前面 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'missing_parent';
      /** 缺父的那个提交 */
      readonly commitId: string;
      /** 缺的那个父 */
      readonly parentId: string;
    }
  | {
      /** 当前头不在新头的第一父链上，且当前分支不是空分支 */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'not_fast_forward';
      /** 当前分支此刻的头 */
      readonly headCommitId: string | null;
    }
  | {
      /**
       * 某个要叠到业务表上的单元，它写之前的那一行与叠到它时的业务行对不上：插入时这一行已经在，修改 / 删除时这一行不在、
       * 或 `inversePatch` 覆盖的跟踪业务列与当前值不同——服务端的增量不是相对本机这份数据算的
       */
      readonly ok: false;
      /** 判别位 */
      readonly reason: 'precondition_mismatch';
      /** 那个单元所在的提交 */
      readonly commitId: string;
      /** 那个单元 */
      readonly unitId: string;
      /** 实体命名空间 */
      readonly namespace: string;
      /** 实体名 */
      readonly entity: string;
      /** 行的主键；只有身份，不带任何字段值 */
      readonly entityId: string;
      /** 单元的操作 */
      readonly operation: CommitChangeUnitOperation;
    };

/** {@link CommitImportResult} 里被拒的那些分支。 */
type CommitImportRejection = Extract<CommitImportResult, { ok: false }>;

/**
 * 导入要向库问的三件事：哪些实体受版本控制、库里有哪些业务实体、实体走不走通用同步推送。
 *
 * @remarks
 * 由门面从本纪元的适配器与 `RxDB` 上现取（`working-tree-facade.ts`），命令体不自己去找：版本化域必须与捕获运行时
 * 是同一份清单（`database-versioned-domain.ts`），同步配置必须是实例解析器那一份（含实例覆盖）。
 */
export interface CommitImportEnvironment {
  /** 版本化域；判 `untracked`，判空分支时选要数行的表 */
  readonly domain: VersionedDomain;
  /** 这个库注册的业务实体（去掉系统表） */
  readonly businessEntities: readonly EntityType[];
  /** 实例的同步配置解析器（`rxdb.entitySync`）；判 `synced` */
  readonly entitySync: EntitySyncResolver;
}

/** 造一个 `unsupported_entity` 拒绝。 */
const unsupportedEntity = (
  problem: CommitImportEntityProblem,
  commitId: string,
  unit: Pick<CommitChangeUnitContent, 'namespace' | 'entity'>
): CommitImportRejection => ({
  ok: false,
  reason: 'unsupported_entity',
  problem,
  commitId,
  namespace: unit.namespace,
  entity: unit.entity
});

/**
 * 第一个指向本客户端没注册的实体的单元。
 *
 * @remarks
 * 排在 at-rest 断言之前：那道断言要拿实体元数据才知道哪几列是加密列，认不出实体时它直接抛
 * `UnknownWorkingTreePatchEntityError`——而「客户端太旧，认不得这个实体」是一个该交给用户的判定结果，不是崩溃。
 */
const findUnregisteredEntity = (
  context: CommitWriteContext,
  commits: readonly CommitExchangeRecord[]
): CommitImportRejection | undefined => {
  for (const record of commits) {
    const unit = record.units.find(
      candidate => !context.codec.resolveTargetMetadata(candidate.entity, candidate.namespace)
    );
    if (unit) return unsupportedEntity('unregistered', record.commitId, unit);
  }
  return undefined;
};

/**
 * 内容上的判定：实体认不认得、加密列是不是信封、指纹对不对、同 id 的提交是不是同一个、父都在不在。
 *
 * @returns 第一处被拒的原因，与本库已有的那些提交
 * @throws {@link CommitEncryptedAtRestError} 加密列里躺着明文时（与本地提交同一道门，理由见 `commit-codec.ts`）
 *
 * @remarks
 * at-rest 断言必须排在复算指纹之前（FR-038）：先算指纹再查，一个明文落进加密列的记录会让这次复算成为明文的确认预言机。
 *
 * 复算走 `computeCommitExchangeRecordFingerprint()`：与写路径、损坏守卫同一套摘要（`change-unit.ts` 是唯一口径），
 * 取记录的**原样**消息与作者、不 trim——落库的就是这一份，守卫日后按落库值复算出的也是这一个。服务端经 `./exchange`
 * 复算用的也是它，两端对「这条记录的指纹是多少」只有一个答案。
 */
const verifyContent = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  commits: readonly CommitExchangeRecord[]
): Promise<{ readonly rejection?: CommitImportRejection; readonly existing: ReadonlyMap<string, Commit> }> => {
  const none = new Map<string, Commit>();
  const unregistered = findUnregisteredEntity(context, commits);
  if (unregistered) return { rejection: unregistered, existing: none };
  assertCommitUnitsEncryptedAtRest(
    context.codec,
    commits.flatMap(record => record.units)
  );
  const mismatch = commits.find(record => computeCommitExchangeRecordFingerprint(record) !== record.contentFingerprint);
  if (mismatch)
    return { rejection: { ok: false, reason: 'fingerprint_mismatch', commitId: mismatch.commitId }, existing: none };

  const existing = new Map(
    (
      await loadCommitsByIds(
        executor,
        commits.map(record => record.commitId)
      )
    ).map(commit => [commit.id, commit])
  );
  const conflicting = commits.find(record => {
    const local = existing.get(record.commitId);
    return local !== undefined && local.contentFingerprint !== record.contentFingerprint;
  });
  if (conflicting)
    return { rejection: { ok: false, reason: 'commit_id_conflict', commitId: conflicting.commitId }, existing };
  return { rejection: await findMissingParent(executor, commits, existing), existing };
};

/**
 * 第一个缺父的新提交。
 *
 * @remarks
 * 只查本库还没有的提交：已有的那些在它们第一次落库时父就都在。父在批次里的已由形状判定保证排在前面；
 * 剩下的父一次 `in` 读完——空集合时不发这条查询（空的 `IN ()` 在六个后端上写法各不相同）。
 */
const findMissingParent = async (
  executor: TransactionExecutor,
  commits: readonly CommitExchangeRecord[],
  existing: ReadonlyMap<string, Commit>
): Promise<CommitImportRejection | undefined> => {
  const batchIds = new Set(commits.map(record => record.commitId));
  const fresh = commits.filter(record => !existing.has(record.commitId));
  const outside = [...new Set(fresh.flatMap(record => record.parentIds).filter(parentId => !batchIds.has(parentId)))];
  const present =
    outside.length === 0 ?
      new Set<string>()
    : new Set((await loadCommitsByIds(executor, outside)).map(commit => commit.id));
  for (const record of fresh) {
    const parentId = record.parentIds.find(candidate => !batchIds.has(candidate) && !present.has(candidate));
    if (parentId !== undefined) return { ok: false, reason: 'missing_parent', commitId: record.commitId, parentId };
  }
  return undefined;
};

/**
 * 一个提交的第一父：批次里的从记录读，本库的从节点读。
 *
 * @returns 第一父；根提交为 `null`；本库也读不回来时为 `undefined`
 */
const firstParentOf = async (
  executor: TransactionExecutor,
  batchById: ReadonlyMap<string, CommitExchangeRecord>,
  commitId: string
): Promise<string | null | undefined> => {
  const record = batchById.get(commitId);
  if (record) return record.parentIds[0] ?? null;
  const [local] = await loadCommitsByIds(executor, [commitId]);
  return local ? (local.parentIds[0] ?? null) : undefined;
};

/** 从新头沿第一父链往回走的结局。 */
interface FirstParentWalk {
  /** 走过的提交，新头在前；不含停下的那一个 */
  readonly walked: readonly string[];
  /** `head`：碰到了当前头（空 HEAD 时走到根就算碰到）；`root`：走到根也没碰到；`broken`：读不回来或成环 */
  readonly end: 'head' | 'root' | 'broken';
}

/**
 * 从新头沿第一父链往回走，直到碰到当前头。
 *
 * @remarks
 * 链的下半段可能落在本库已有的提交上（一个在别的分支上提交过、被服务端快进进主线的提交），所以每一步先查批次、
 * 再查本库。读不回来或成环就停下，交给调用方按「不是快进」处理——不在这里判损坏，那是 `assertCommitGraphIntact()` 的事。
 */
const walkFirstParents = async (
  executor: TransactionExecutor,
  batchById: ReadonlyMap<string, CommitExchangeRecord>,
  headCommitId: string,
  currentHead: string | null
): Promise<FirstParentWalk> => {
  const walked: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = headCommitId;
  while (cursor !== currentHead) {
    if (cursor === null) return { walked, end: 'root' };
    if (seen.has(cursor)) return { walked, end: 'broken' };
    seen.add(cursor);
    walked.push(cursor);
    const next = await firstParentOf(executor, batchById, cursor);
    if (next === undefined) return { walked, end: 'broken' };
    cursor = next;
  }
  return { walked, end: 'head' };
};

/** 这个提交是不是系统根节点：系统种类、没有父、没有单元。 */
const isSystemRoot = (commit: Commit): boolean =>
  (commit.kind === 'baseline' || commit.kind === 'branch_baseline') &&
  commit.parentIds.length === 0 &&
  commit.changeSetCount === 0;

/**
 * 当前分支是不是空分支：HEAD 是系统根节点，且受版本控制的业务表一行都没有。
 *
 * @remarks
 * 只在「新头的第一父链走到根也没碰到当前头」时问（HEAD 为 `null` 时走到根就算碰到，不进这里）。逐张表数行，
 * 一张表一次 `count`——表的个数是实体注册数，不随数据量涨，而这个判定一台设备一生只走一次（第一次导入）。
 * 数的是受版本控制的那些：QueryCache 实体与关闭变更日志的实体本就不进提交，它们有没有行与链根代表什么无关。
 */
const isEmptyBranch = async (
  executor: TransactionExecutor,
  environment: CommitImportEnvironment,
  headCommitId: string
): Promise<boolean> => {
  const [head] = await loadCommitsByIds(executor, [headCommitId]);
  if (!head || !isSystemRoot(head)) return false;
  const tracked = environment.businessEntities.filter(EntityType => {
    const { name, namespace } = getEntityMetadata(EntityType);
    return environment.domain.classifyEntity(name, namespace) === 'tracked';
  });
  for (const EntityType of tracked) {
    const rows = await executor.getRepository(EntityType).count({ where: { combinator: 'and', rules: [] } });
    if (rows > 0) return false;
  }
  return true;
};

/** 快进判定的三种结论。 */
type FastForwardPlan =
  | {
      /** 判别位：可以快进；`commitIds` 为空就是新头恰好就是当前头 */
      readonly kind: 'advance';
      /** 要叠到业务表上的提交，老的在前，最后一个是新头 */
      readonly commitIds: readonly string[];
    }
  | {
      /** 判别位：新头已经在当前分支的历史里，什么都不做 */
      readonly kind: 'contained';
    }
  | {
      /** 判别位：不是快进 */
      readonly kind: 'not_fast_forward';
    };

/**
 * 判这批提交能不能让当前分支快进到最后一个，能就交回要叠上去的那一段。
 *
 * @remarks
 * 三条判据的理由写在本文件头「快进的判定」。「已经在历史里」排在「不是快进」之前判：同一批再导入一次、导入之后又在本地
 * 提交过一次，两种都是正常的重放，不该被当成分叉拒掉。
 */
const planFastForward = async (
  executor: TransactionExecutor,
  environment: CommitImportEnvironment,
  commits: readonly CommitExchangeRecord[],
  currentHead: string | null
): Promise<FastForwardPlan> => {
  const head = commits[commits.length - 1];
  const batchById = new Map(commits.map(record => [record.commitId, record]));
  const walk = await walkFirstParents(executor, batchById, head.commitId, currentHead);
  const chain = [...walk.walked].reverse();
  if (walk.end === 'head') return { kind: 'advance', commitIds: chain };
  if (walk.end === 'root' && currentHead !== null && (await isEmptyBranch(executor, environment, currentHead))) {
    return { kind: 'advance', commitIds: chain };
  }
  if (await isCommitReachable(executor, currentHead, head.commitId)) return { kind: 'contained' };
  return { kind: 'not_fast_forward' };
};

/** 一个要叠到业务表上的提交：id 与它的落库形态单元（前像核对收的就是这一种）。 */
type ApplyingCommit = ImportApplyingCommit;

/**
 * 读一个本库已有、却不在批次里的提交的单元。
 *
 * @remarks
 * 只在快进链的下半段落在本库已有的提交上时才走到（见 {@link walkFirstParents}）。排序在 JS 侧做——`sequence` 决定叠上去的次序。
 */
const readLocalUnits = async (executor: TransactionExecutor, commitId: string): Promise<CommitChangeUnitContent[]> => {
  const rows = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commitId }] }
  });
  return [...rows]
    .sort((left, right) => left.sequence - right.sequence)
    .map(row => ({
      unitId: row.unitId,
      transactionId: row.transactionId,
      namespace: row.namespace,
      entity: row.entity,
      entityId: row.entityId,
      operation: row.operation,
      patch: row.patch,
      inversePatch: row.inversePatch,
      origin: row.origin
    }));
};

/** 快进链上每个提交的单元：批次里的取记录，本库的取落库行。 */
const unitsAlong = async (
  executor: TransactionExecutor,
  commits: readonly CommitExchangeRecord[],
  commitIds: readonly string[]
): Promise<ApplyingCommit[]> => {
  const batchById = new Map(commits.map(record => [record.commitId, record]));
  const applying: ApplyingCommit[] = [];
  for (const commitId of commitIds) {
    const record = batchById.get(commitId);
    applying.push({ commitId, units: record ? record.units : await readLocalUnits(executor, commitId) });
  }
  return applying;
};

/**
 * 要叠到业务表上的单元里，第一个指向不能写的实体的。
 *
 * @remarks
 * 只查快进链上的单元：侧枝提交不落业务表，它们指向什么实体与这条分支的数据无关（注册与否已经在 {@link findUnregisteredEntity} 里查过）。
 * 本库已有、不在批次里的提交也要再查一遍注册：它们落库之后，客户端可能已经去掉了那个实体。
 */
const findUnwritableEntity = (
  context: CommitWriteContext,
  environment: CommitImportEnvironment,
  applying: readonly ApplyingCommit[]
): CommitImportRejection | undefined => {
  for (const commit of applying) {
    for (const unit of commit.units) {
      const problem = writeProblemOf(context, environment, unit);
      if (problem) return unsupportedEntity(problem, commit.commitId, unit);
    }
  }
  return undefined;
};

/** 一个单元的实体能不能由导入写：注册了、受版本控制、不走通用同步推送。 */
const writeProblemOf = (
  context: CommitWriteContext,
  environment: CommitImportEnvironment,
  unit: CommitChangeUnitContent
): CommitImportEntityProblem | undefined => {
  const metadata = context.codec.resolveTargetMetadata(unit.entity, unit.namespace);
  if (!metadata) return 'unregistered';
  if (environment.domain.classifyEntity(unit.entity, unit.namespace) === 'untracked') return 'untracked';
  return needsPush(metadata, environment.entitySync) ? 'synced' : undefined;
};

/**
 * 一个提交的单元叠到业务表上要落的增删改。
 *
 * @remarks
 * 先过 codec 解码（`bigint` / `binary` 还原，加密列保持信封——适配器解锁之后解开再重新加密写回，与切分支、撤销同一条路径），
 * 再交给 discard / restore 同一份折叠：单元按 `sequence` 正向叠，同一行写两次也折得对；UPDATE 上的簿记字段不回写。
 */
const actionsOf = (context: CommitWriteContext, units: readonly CommitChangeUnitContent[]): SwitchVersionActions =>
  projectionActionsOf(
    units.map(unit => decodeCommitChangeSetUnit(context.codec, unit)),
    'apply'
  );

/**
 * 把一个导入提交的 ChangeSet 叠到业务表上：受信调用点登记表 #15。
 *
 * @param executor - 调用方那个写事务的执行器；声明挂在它上面，由挂载点 2 当场取走
 * @param actions - {@link actionsOf} 算出的增删改
 *
 * @remarks
 * 三处裁决与 discard / restore 的回写（#13 / #14）同形，理由不同：
 *
 * - **入口是投影重写**：导入自己维护提交图与 HEAD，业务表跟着新 HEAD 走；被挂载点 2 按领域重算捕获的话，
 *   刚导入的提交会在工作树里再出现一遍，`status()` 报脏、下一次 `commit()` 把远端的改动当成本地的再提交一次。
 * - **触发器开着**：导入是当前分支上的一次新写入，变更日志要跟着它走——切分支按日志撤投影、按日志重放，分支对比与
 *   合并预览读的也是日志，提交的分叉点（`commit-fork-point.ts`）记的也是日志上的位置。关掉的话，切到别的分支再切回来，
 *   导入的数据不跟着分支走；从导入的提交建分支，读到的也不是那次提交的数据。同步拉取（#7~#9）关触发器是为了不回推；
 *   导入不回推靠的是另一道闸——拒绝写走 changelog 推送的实体（{@link writeProblemOf}）。
 * - **声明绑执行器**：`mergeChanges` 的声明在排队拿到事务之后才被取走，绑适配器实例会让两个并发的写互相覆盖。
 *   没有要写的（空 ChangeSet 的合并提交、系统根节点、只剩簿记字段的 UPDATE）就连声明都不留——没有写的调用也会取走声明，
 *   留下的声明会被挂载点 1 在事务末尾取走，把整笔事务里别的写都按投影重写放过去。
 */
const applyImportedCommit = async (executor: TransactionExecutor, actions: SwitchVersionActions): Promise<void> => {
  if (!hasProjectionWrites(actions)) return;
  declareTrustedWrite(executor, {
    file: 'import-command.ts',
    symbol: 'applyImportedCommit',
    intent: TrustedWriteIntent.remote_commit_import
  });
  await executor.mergeChanges(actions, undefined, false);
};

/**
 * 把批次里本库还没有的提交写成节点与变更集行。
 *
 * @remarks
 * 行由 `buildCommitRows()` 造：内容指纹、`changeSetCount`、`firstParentId` 由写路径自己算出来，损坏守卫才认——指纹在这之前
 * 已经与记录声明的那个核对过，算出来的就是它。`operationId` 由提交 id 派生（`deriveImportedCommitOperationId`）。
 * 节点先于变更集行写：后者对前者挂着外键。
 */
const insertImportedCommits = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  records: readonly CommitExchangeRecord[]
): Promise<void> => {
  if (records.length === 0) return;
  const rows = records.map(record =>
    buildCommitRows(context.entityManager, {
      id: record.commitId,
      kind: record.kind,
      parentIds: record.parentIds,
      message: record.message,
      author: record.authorId,
      operationId: deriveImportedCommitOperationId(record.commitId),
      units: record.units,
      createdAt: record.createdAt
    })
  );
  await executor.saveMany(rows.map(row => row.commit));
  const changeSets = rows.flatMap(row => row.changeSets);
  if (changeSets.length > 0) await executor.saveMany([...changeSets]);
};

/**
 * 叠完一个提交之后记下它的分叉点；已经有了就不动。
 *
 * @remarks
 * 分叉点让「从这个提交建分支」（US-314）读到它刚完成时的数据：它记的是此刻变更日志上本分支停在哪。在别的分支上提交过、
 * 被快进进本分支的提交已经有一条（主键是提交 id，表只追加），沿用那一条——它指的也是那个提交刚完成时的数据。
 */
const recordForkPointOnce = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  commitId: string,
  branchId: string
): Promise<void> => {
  if (await readCommitForkPoint(executor, commitId)) return;
  await recordCommitForkPoint(executor, context.entityManager, commitId, branchId);
};

/** 把 HEAD 那条 CAS 的落空翻译成 {@link CommitConflict}；重读一次只为报出真实的当前值。 */
const toHeadConflict = async (
  executor: TransactionExecutor,
  branchId: string,
  expected: number
): Promise<CommitConflict> => {
  const ref = await readCommitBranchRef(executor, branchId);
  return { kind: 'head_revision', expected, actual: ref.headRevision, branchId };
};

/** {@link writeImport} 的入参；单列成型只为把主函数的参数表压短。 */
interface ImportWrite {
  /** 当前 active 分支 */
  readonly branchId: string;
  /** 事务内读出的 ref 行 */
  readonly ref: CommitBranchRef;
  /** 本库还没有、要写成节点的提交，批次顺序 */
  readonly fresh: readonly CommitExchangeRecord[];
  /** 要叠到业务表上的提交，老的在前，最后一个是新头 */
  readonly applying: readonly ApplyingCommit[];
}

/**
 * 落盘：先打 HEAD 的 CAS，命中了才写节点、叠业务表、记分叉点、推工作树基线。
 *
 * @remarks
 * **CAS 排在任何写之前**，与 `writeCommit()` 同一条理由：落空是返回值不是异常，返回的那一刻事务照常提交——写在前面的行
 * 就成了没人指向的孤儿。节点排在叠业务表之前：叠的那一步是唯一可能因为业务数据本身失败的写（存储约束、外键、解不开的信封），
 * 它抛错时整笔回滚，节点、业务表与 HEAD 一起回到导入之前。
 *
 * 逐个提交叠、逐个记分叉点，而不是把整段折成一次写：分叉点要的是「这个提交刚完成时」日志停在哪，折成一次就只剩最后一个
 * 提交的位置对得上；切分支、撤销读到的日志也因此与提交一一对应。
 */
const writeImport = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  input: ImportWrite
): Promise<CommitImportResult> => {
  const { branchId, ref, applying } = input;
  const headCommitId = applying[applying.length - 1].commitId;
  const cas = await executor.query(
    buildAdvanceHeadCas(
      executor.tableRef(CommitBranchRef),
      { branchId, branchGeneration: ref.generation, expectedHeadRevision: ref.headRevision },
      headCommitId
    )
  );
  if (cas.rowsAffected === 0) {
    return { ok: false, reason: 'conflict', conflict: await toHeadConflict(executor, branchId, ref.headRevision) };
  }

  await insertImportedCommits(executor, context, input.fresh);
  for (const commit of applying) {
    await applyImportedCommit(executor, actionsOf(context, commit.units));
    await recordForkPointOnce(executor, context, commit.commitId, branchId);
  }
  await executor.query(
    buildWorkingTreeImportTransitionSql(executor.tableRef(WorkingTreeState), {
      branchId,
      baseHeadCommitId: headCommitId
    })
  );
  return {
    ok: true,
    headCommitId,
    headRevision: ref.headRevision + 1,
    importedCount: input.fresh.length,
    appliedCount: applying.length
  };
};

/**
 * 把一段远端提交原样导入当前分支，分支头快进到最后一个（US-316）。
 *
 * @param executor - 调用方那个写事务的执行器；本函数**不自己开事务**
 * @param context - 见 {@link CommitWriteContext}：造节点行的实体管理器，与解码、at-rest 判定的 codec 上下文
 * @param environment - 见 {@link CommitImportEnvironment}
 * @param commits - 批次：父先于子，最后一个是新头（见本文件头「批次的形状」）
 * @param options - 见 {@link CommitImportOptions}；三个捕获位全部必填
 * @returns 见 {@link CommitImportResult}
 * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏时（FR-051）
 * @throws {@link CommitEncryptedAtRestError} 某个单元的加密列里躺着明文时
 * @throws {@link RxDBError} 某个补丁里有落不进 JSON 列的值时（复算指纹时抛）
 *
 * @remarks
 * 步骤顺序全是有理由的：
 *
 * 1. **先判检出位**：挂在可写检出位上时，后面那些「当前分支」读到的是检出位持有的那一条，判得再对也不能导。
 * 2. **损坏守卫先于一切**：反过来的话，一条自己都校验不过的链上会被接上一段新历史（FR-051）。
 * 3. **三个捕获位、clean**：工作树有条目时业务表不等于当前头，叠上去的增量落在错的起点上；有未结束的恢复会话时，
 *    HEAD 一动它就成了一个谁都没造出来的 `conflicted` 会话——两者都先 commit 或 discard。
 * 4. **批次形状、内容、快进、实体、前像**，全部是只读判定，任一不过即返回被拒出口，此时没有任何东西需要回滚。
 *    前像排在最后：它要读业务表，而读哪些行、按哪条链的顺序读，要等快进判定交出那一段之后才知道。
 * 5. **CAS、写节点、叠业务表、记分叉点、推基线**，全在调用方那一个事务里（见 {@link writeImport}）。
 */
export const importWorkingTreeCommits = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  environment: CommitImportEnvironment,
  commits: readonly CommitExchangeRecord[],
  options: CommitImportOptions
): Promise<CommitImportResult> => {
  if (!executor.tableSet.isMain) return { ok: false, reason: 'not_main_checkout' };
  const token = await readActiveBranchToken(executor);
  await assertCommitGraphIntact(executor, token.branchId);
  const ref = await readCommitBranchRef(executor, token.branchId);
  const state = await readWorkingTreeStateRow(executor, token.branchId);
  const conflict = findCommitConflict(options, {
    token,
    headRevision: ref.headRevision,
    workingTreeRevision: state.workingTreeRevision
  });
  if (conflict) return { ok: false, reason: 'conflict', conflict };
  if (state.entryCount !== 0 || (await readActiveRestoreSessionRow(executor, token.branchId))) {
    return { ok: false, reason: 'dirty_working_tree' };
  }

  const malformed = checkCommitExchangeBatch(commits);
  if (malformed) return { ok: false, reason: 'invalid_batch', ...malformed };
  const { rejection, existing } = await verifyContent(executor, context, commits);
  if (rejection) return rejection;

  const plan = await planFastForward(executor, environment, commits, ref.headCommitId);
  if (plan.kind === 'not_fast_forward') {
    return { ok: false, reason: 'not_fast_forward', headCommitId: ref.headCommitId };
  }
  if (plan.kind === 'contained' || plan.commitIds.length === 0) {
    return {
      ok: true,
      headCommitId: ref.headCommitId,
      headRevision: ref.headRevision,
      importedCount: 0,
      appliedCount: 0
    };
  }
  const applying = await unitsAlong(executor, commits, plan.commitIds);
  const unwritable = findUnwritableEntity(context, environment, applying);
  if (unwritable) return unwritable;
  const mismatch = await findImportPreconditionMismatch(executor, context, environment.domain, applying);
  if (mismatch) return { ok: false, reason: 'precondition_mismatch', ...mismatch };

  const fresh = commits.filter(record => !existing.has(record.commitId));
  return writeImport(executor, context, { branchId: token.branchId, ref, fresh, applying });
};
