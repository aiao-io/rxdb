/**
 * @fileoverview metadata-only 远端分支的识别、durable staging 与首次物化屏障（FR-044/049）。
 *
 * @remarks
 * `syncBranches()` 只同步 metadata，**不**为远端分支伪造 baseline / `CommitBranchRef`。于是本地
 * 对这样一条分支只知道「它存在」，而它的完整状态在远端。这个模块管的就是从「只知道它存在」
 * 走到「可以切过去」的那一段，三件事分属三个入口：
 *
 * 1. {@link classifyBranchMaterialization}——它现在算哪一种；
 * 2. {@link stageBranchMaterialization}——把一份冻结下来的远端快照逐页落进 staging；
 * 3. {@link commitBranchMaterialization}——把一份**已经落全**的 staging 变成一条切过去的分支。
 *
 * 四条不可让步的性质：
 *
 * - **判据是分支行上的 `local` / `remote`，不是 HEAD 空不空。** `headCommitId === null` 在远端
 *   分支上给出正确答案，却会把 `enable()` 之前的每一条**本地**分支一并送进远端物化路径——那条
 *   路要拉远端 payload，而本地分支的完整状态就在本机。同理，本地分支缺 ref 是**迁移没跑完**，
 *   必须抛；把两种成因合流到「都当 metadata-only」上，损坏就此无声（FR-049）。
 * - **逐页落库，落全之前不写 `staged`。** 攒在内存里最后一把写，所有「页都在、`pageCount` 对」
 *   的断言照样全绿，代价要到分页崩溃那天才显形：FR-044 要求分页崩溃可恢复，而没落库的页恢复
 *   不了。提前写 `staged` 则是反过来——宣布一份半截 payload 可用（data-model.md §2.9）。
 * - **九件事同属一道屏障。** 最自然的拆法是「先物化完、再切过去」，中间崩一次就留下一条投影
 *   已经换成目标分支、active 却还在来源分支的现场：用户看见的是别人的数据，而界面上的分支名是
 *   自己的。所以拒绝路径一律**零写入零语句**，不是「写了会回滚」——回滚发生在事务边界之外
 *   （或者进程崩在中间）留下的正是那半棵切过去的工作树。
 * - **复核比的是 staging 行上冻结下来的那份意图。** 拿调用方给的水位/scope 重算一个指纹再与自己
 *   比是恒等的，什么都证明不了；分页开始那一刻的意图只有那一行知道，中间漂过没有也只有它知道。
 *
 * **物化那一步由调用方注入 `applyPage`，本模块不认识业务实体**：要写进投影的行来自配置的
 * sync scope，那份登记在宿主上，内联进来就把十张系统表的知识与整个业务实体登记绑死了。
 *
 * **本模块不进 `working-tree/index.ts`。** 与它形态相同的 `commit/enable-migration.ts`
 * （`BranchNotMaterializableError` 的落点）同样不在 `commit/index.ts` 上：这两条路都由本包的
 * 编排层调用，暴露出去等于承诺一份还没有契约的外部 API。
 */

import type { EntityManager, EntityMetadata, TransactionExecutor } from '@aiao/rxdb';
import {
  ACTIVE_BRANCH_KEY,
  getEntityColumnName,
  getEntityMetadata,
  quoteSqlIdentifier,
  RxDBBranch,
  RxDBError,
  sha256Hex,
  sqlBooleanLiteral,
  sqlStringLiteral,
  sqlTimestampLiteral,
  uuid
} from '@aiao/rxdb';
import { createBranchCommitRows } from '../commit/branch-commit-rows.js';
import { CommitBranchRef } from '../commit/commit-branch-ref.entity.js';
import { CommitErrorCode } from '../commit/commit-error-codes.js';
import { deriveCommitOperationId } from '../commit/commit-idempotency.js';
import { buildCommitRows, SYSTEM_COMMIT_MESSAGES } from '../commit/write-commit.js';
import { bumpActivationRevision } from './activation-cas.js';
import { allocateBranchGeneration } from './activation-state.js';
import { readActiveBranchToken } from './capture-runtime.js';
import { WorkingTreeMaterializationPage } from './working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from './working-tree-materialization-stage.entity.js';
import { WorkingTreeState } from './working-tree-state.entity.js';
import { StaleActiveBranchError, type ActiveBranchToken } from './write-entry.js';

/**
 * 一条分支在本地的物化程度。
 *
 * @remarks
 * 做成可辨识联合而不是一个布尔：`metadata_only` 那一支手上**没有** ref 可交，交一个
 * `headCommitId: null` 的占位行出去，调用方就分不清「本地还没有它的历史」与「它的历史是空的」。
 */
export type BranchMaterializationState =
  /** 本地有这条分支的完整提交图入口 */
  | { readonly kind: 'materialized'; readonly ref: CommitBranchRef }
  /** 本地只有它的 metadata，首次切换要先物化（FR-044/049） */
  | { readonly kind: 'metadata_only'; readonly branchId: string };

/** 一页远端快照的内容；页序由 {@link appendBranchMaterializationPage} 的调用方发放。 */
export interface BranchMaterializationPagePayload {
  /** 该页的快照 payload，原样落库 */
  readonly payload: Record<string, unknown>;

  /**
   * 该页指纹，必须等于 {@link branchMaterializationPageFingerprint} 对 `payload` 的复算值
   *
   * @remarks
   * 仍然由来源方填、而不是落库时现算：这一格的用途正是**让来源方和本地各算一遍再比**。
   * 落库时现算的话，两边永远相等，这一列就成了 payload 的一个纯函数——它挡不住任何东西。
   */
  readonly fingerprint: string;
}

/** 落库之后带上页序的一页快照；屏障按页序把它交给 `applyPage`。 */
export interface BranchMaterializationPage extends BranchMaterializationPagePayload {
  /** 页序，从 0 起密集发放 */
  readonly pageIndex: number;
}

/** 一次物化被拒的成因；调用方据此决定重试、重新拉一遍还是放弃。 */
export type BranchNotMaterializedReason =
  /** 库里压根没有这条 attempt */
  | 'stage_missing'
  /** 有 attempt，但那份 payload 不完整——`status` 没写成 `staged`，或页数与 `pageCount` 对不上 */
  | 'stage_incomplete'
  /** 调用方手上的水位/scope 与 staging 行上冻结下来的那份不一致 */
  | 'intent_drift'
  /** 目标分支已经有 baseline 了，这次物化没有位置可放 */
  | 'target_already_materialized'
  /** 落库的那批页与它们自己声明的指纹对不上，或页号不是从 0 起的密集序列 */
  | 'stage_tampered'
  /** 这条连接上没有登记远端快照来源，拉不到要物化的那份 payload */
  | 'source_unavailable';

/**
 * 物化依据不足，整次尝试以 `branch_not_materialized` 全量回滚（FR-044）。
 *
 * @remarks
 * 六个成因的分辨力全在这个类上，所以它不是一个裸 {@link RxDBError}：`stage_missing` 要重新拉一遍，
 * `stage_incomplete` 可以接着上次拉，`intent_drift` 要换一份意图重来，`stage_tampered` 要把这份
 * staging 整个丢掉重拉（接着拉只会把坏页留在原地），`target_already_materialized` 说明这条分支
 * 本来就不该走这条路，而 `source_unavailable` 与库里的状态无关——它说的是这条连接还没登记
 * 快照来源。合并成一个错误码之后，调用方只能一律重来。
 *
 * 抛出时 staging **不被顺手删掉**：那半份 payload 连同它的 `scopeManifest` 正是诊断「上一次为什么
 * 没接上」需要的东西。清理是 FR-044 单列的一条能力（{@link discardMaterializationAttempt}），
 * 是调用方的决定，不是判定的副作用。
 */
export class BranchNotMaterializedError extends RxDBError {
  /** 错误码，恒为 {@link CommitErrorCode.branch_not_materialized} */
  readonly code: CommitErrorCode = CommitErrorCode.branch_not_materialized;

  /**
   * @param branchId - 物化失败的目标分支 id
   * @param attemptId - 本次尝试的 attempt id，可据此清理或续用
   * @param reason - 成因
   * @param detail - 人读的补充说明
   */
  constructor(
    readonly branchId: string,
    readonly attemptId: string,
    readonly reason: BranchNotMaterializedReason,
    readonly detail: string
  ) {
    super(`分支 '${branchId}' 的物化尝试 '${attemptId}' 依据不足（${reason}）：${detail}`);
    this.name = 'BranchNotMaterializedError';
    Object.setPrototypeOf(this, BranchNotMaterializedError.prototype);
  }
}

/**
 * 指纹的域分隔前缀。
 *
 * @remarks
 * 与 `commit-idempotency.ts` 同一个手法：不带域前缀时，另一处恰好也拿「水位 + scope」算摘要的
 * 代码会与本处撞上同一个值，而两边的语义并不相同。
 */
const MATERIALIZATION_FINGERPRINT_DOMAIN = 'rxdb.working-tree.materialization.v1';

/** 算指纹用的编码器；每次现 new 一个是白白的分配。 */
const textEncoder = new TextEncoder();

/**
 * 把一个 JSON 值折成**键序无关**的字符串。
 *
 * @param value - 任意 JSON 可表达的值
 * @returns 同一份内容恒得同一个字符串
 *
 * @remarks
 * 直接 `JSON.stringify` 不行：`{a:1,b:2}` 与 `{b:2,a:1}` 是同一份意图，序列化出来却是两个字符串，
 * 于是同一次续用判定会随对象字面量的书写顺序给出两种答案。
 *
 * 留在模块内而不是抽成公共工具：本仓已经有两份各自服务一处的规范化器
 * （`change-unit.ts` 的 SHA-256 路径、`capture-runtime.ts` 的 FNV-1a 路径），它们的收敛口径
 * 各不相同（前者对路径形状还要拒绝）。第三份公共化之后，三处的口径要一起改或一起不改，
 * 而这里的值只与本函数自己的另一次输出比较，跨模块一致性不是它的义务。
 */
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
};

/** 把一份 sync scope 折成落库的清单形状；顺序照抄配置，不排序也不去重。 */
const scopeManifestOf = (syncScope: readonly string[]): Record<string, unknown> => ({ entities: [...syncScope] });

/**
 * 分页指纹的域分隔前缀；与 {@link MATERIALIZATION_FINGERPRINT_DOMAIN} 分开。
 *
 * @remarks
 * 两者算的是同一条链路上的两样东西（一份意图、一页内容），共用前缀的话，一份恰好等于
 * `{entities:[...]}` 的 payload 会与它自己那份 scope 清单算出同一个指纹。
 */
const MATERIALIZATION_PAGE_FINGERPRINT_DOMAIN = 'rxdb.working-tree.materialization.page.v1';

/**
 * 算一页快照 payload 的指纹——**这是分页指纹的公开口径**（FR-044）。
 *
 * @param payload - 该页原样落库的那份 payload
 * @returns 十六进制 SHA-256
 *
 * @remarks
 * 导出而不是留在模块内：屏障要在任何 `applyPage` 之前拿存下来的 payload 复算一遍再与
 * {@link BranchMaterializationPagePayload.fingerprint} 比（见 {@link assertStagingUsable}），
 * 而来源方那一侧得算得出同一个值——口径只存在于本模块内部的话，来源方只能靠试出来，
 * 试出来的那一份会在本函数改版那天静默失配。
 *
 * 只吃 payload，不掺页号、attempt id 或目标分支：掺进去之后，同一页内容在续用一份旧
 * attempt 时会因为页号错位而"变了内容"，而页号是否错位由 {@link assertStagingUsable} 的
 * 密集性检查单独回答。两件事合进一个值，报出来的成因就永远只有一个。
 *
 * 走 {@link canonicalJson} 而不是 `JSON.stringify`：`{a:1,b:2}` 与 `{b:2,a:1}` 是同一页内容，
 * 直接序列化却得两个指纹——于是一份完好的 staging 会因为来源方换了个 JSON 库而被判成被篡改。
 */
export const branchMaterializationPageFingerprint = (payload: Record<string, unknown>): string =>
  sha256Hex(textEncoder.encode(`${MATERIALIZATION_PAGE_FINGERPRINT_DOMAIN} ${canonicalJson(payload)}`));

/**
 * 算一次 attempt 的指纹：只看冻结下来的那份意图。
 *
 * @remarks
 * 续用判定要在**拉页之前**就能比，所以指纹只能算在意图上。把 payload 掺进去，指纹就得等整份
 * 快照落完才有，那时已经没什么可续用的了。
 */
const materializationFingerprint = (
  frozenRemoteWatermark: Record<string, unknown>,
  syncScope: readonly string[]
): string =>
  sha256Hex(
    textEncoder.encode(
      `${MATERIALIZATION_FINGERPRINT_DOMAIN} ${canonicalJson(frozenRemoteWatermark)} ${canonicalJson(
        scopeManifestOf(syncScope)
      )}`
    )
  );

/** 按主键读一条分支行；缺行抛错，不当成「没有这条分支」。 */
const readBranchRow = async (executor: TransactionExecutor, branchId: string): Promise<RxDBBranch> => {
  const [row] = await executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (!row) throw new RxDBError(`分支 ${branchId} 的 rxdb_branch 行不存在，无法判定它的物化程度。`);
  return row;
};

/** 按主键读一条 ref；**不**补行、**不**抛错——「没有这一行」正是这里要区分的一种状态。 */
const findBranchRef = async (executor: TransactionExecutor, branchId: string): Promise<CommitBranchRef | undefined> => {
  const [row] = await executor.getRepository(CommitBranchRef).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  return row;
};

/** 按主键读一条工作树状态行；缺行返回 `undefined`，由调用方决定补不补。 */
const findWorkingTreeState = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<WorkingTreeState | undefined> => {
  const [row] = await executor.getRepository(WorkingTreeState).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  return row;
};

/**
 * 判定一条分支在本地算不算已物化（FR-049）。
 *
 * @param executor - 调用方那个事务的执行器；本函数只读，一行都不补
 * @param branchId - 要判定的分支 id
 * @returns 见 {@link BranchMaterializationState}
 * @throws {@link RxDBError} 分支行缺失时，或**本地**分支缺 ref 时
 *
 * @remarks
 * 三条判据的次序是有意的：先看分支行上的 `local` / `remote`，再看有没有 ref，最后才看 HEAD。
 *
 * - **远端分支**没有 ref、或 ref 的 HEAD 为空，都是 metadata-only：前者是 0004 之后同步进来的，
 *   后者是 0004 给既有库补过行的。两种形态来自同一件事——本地没有它的完整状态；按有没有那一行
 *   给出两种结论，等于让「用户什么时候升的级」决定切分支时走哪条路。
 * - **本地分支**缺 ref 一律抛：那是迁移没跑完，不能降级成 metadata-only（降级之后切过去会去拉
 *   一份远端 payload，而这条分支的完整状态本来就在本机）。
 *
 * 本函数**不补行**：`ensureBranchCommitRows` 就在一次调用之外，而它对远端分支是禁用的——
 * 补出来的那一行等于本地凭空宣称「这条远端分支有一个空 HEAD」。
 */
export const classifyBranchMaterialization = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<BranchMaterializationState> => {
  const branch = await readBranchRow(executor, branchId);
  const ref = await findBranchRef(executor, branchId);
  const remoteOnly = branch.remote === true && branch.local === false;

  if (remoteOnly) {
    if (!ref || ref.headCommitId === null) return { kind: 'metadata_only', branchId };
    return { kind: 'materialized', ref };
  }
  if (!ref) {
    throw new RxDBError(
      `本地分支 ${branchId} 没有 CommitBranchRef 行：迁移 0004-working-tree-commits 没为它建行。` +
        '这不是 metadata-only——本地分支的完整状态就在本机，按远端物化路径走会去拉一份不存在的 payload。'
    );
  }
  return { kind: 'materialized', ref };
};

/** {@link beginBranchMaterializationStage} 的入参。 */
export interface BeginBranchMaterializationStageInput {
  /** 本次尝试的 attempt id；同时是 staging 头行的主键 */
  readonly attemptId: string;

  /** 要物化的目标分支 id */
  readonly targetBranchId: string;

  /** attempt 开始那一刻的终止水位；本函数深拷一份落库，之后调用方那份再动也不跟 */
  readonly frozenRemoteWatermark: Record<string, unknown>;

  /** **完整配置**的 sync scope，不是本次有页的那几个实体 */
  readonly syncScope: readonly string[];
}

/** {@link appendBranchMaterializationPage} 的入参。 */
export interface AppendBranchMaterializationPageInput {
  /** 这一页挂在哪条 attempt 上 */
  readonly attemptId: string;

  /** 那条 attempt 记的目标分支；与头行对不上就拒 */
  readonly targetBranchId: string;

  /** 这一页的页序，从 0 起密集发放 */
  readonly pageIndex: number;

  /** 这一页的内容与它自己声明的指纹 */
  readonly page: BranchMaterializationPagePayload;
}

/** 一份 staging 封口之后的交代。 */
export interface BranchMaterializationStaging {
  /** 本次 attempt id */
  readonly attemptId: string;

  /** 实际落库的页数 */
  readonly pageCount: number;

  /** 本次意图的指纹，见 {@link materializationFingerprint} */
  readonly fingerprint: string;
}

/**
 * 三段式 staging 的公共前置：把头行读出来，并确认它还收得下页（FR-044）。
 *
 * @remarks
 * `staged` 的头行一律拒：封口之后再追加一页，页数就与 `pageCount` 对不上了，而屏障那边
 * 报出来的成因会是 `stage_incomplete`——一个把"有人往封好的 staging 里塞东西"说成
 * "这份 staging 没落全"的成因。
 */
const requirePendingStage = async (
  executor: TransactionExecutor,
  attemptId: string,
  targetBranchId: string
): Promise<WorkingTreeMaterializationStage> => {
  const stage = await findStage(executor, attemptId, targetBranchId);
  if (!stage) {
    throw new BranchNotMaterializedError(
      targetBranchId,
      attemptId,
      'stage_missing',
      '库里没有这条 attempt 的头行，或它记的目标分支不是这一条——头行要先由 beginBranchMaterializationStage() 落下。'
    );
  }
  if (stage.status !== 'pending') {
    throw new BranchNotMaterializedError(
      targetBranchId,
      attemptId,
      'stage_incomplete',
      `这条 attempt 的 status 已经是 '${stage.status}'，不再收页。`
    );
  }
  return stage;
};

/**
 * 开一份 durable staging：只落头行，一页都不写（FR-044）。
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param executor - 一个**只装这一步**的写事务的执行器
 * @param input - 见 {@link BeginBranchMaterializationStageInput}
 * @returns 本次意图的指纹；attempt id 是调用方自己给的，不再回传
 *
 * @remarks
 * `entityManager` 由调用方给而不是从 `executor` 上摸，与 `createBranchCommitRows` 同一个手法：
 * 多个库共用同一个实体类时 `new WorkingTreeMaterializationStage()` 判断不出目标库。
 *
 * **三段分开，是因为它们必须分属三个事务。** 头行、每一页、封口各自提交之后才做下一步：
 * 一个事务装完全程的写法能让事后断言全绿，而它恰恰把「崩在分页中途还留得住」这唯一的
 * 设计目标抹掉了——进程崩在第 7 页，回滚的是从头行开始的全部 7 页，下一次只能从 0 重来。
 * 测试里那种「在事务体内部 catch 掉异常然后正常提交」的半份 staging，真实进程一次都产生不了。
 *
 * 头行先落还有一条独立理由：崩在第一页之前也要留下一条**可按 attempt 清理**的记录，
 * 否则那批页无主，而按目标分支清理会把旁观的另一次尝试一起带走。
 *
 * 水位走 `structuredClone` 而不是存引用：远端在分页期间照常推进，存引用的话 staging 就成了
 * 一份跨水位的拼接。`scopeManifest` 写的是**完整配置**——按「出现过的实体」写清单，一个当时恰好
 * 没有行的实体会从清单里消失，续用判定于是把一份范围更窄的旧 attempt 判成可续用。
 */
export const beginBranchMaterializationStage = async (
  entityManager: EntityManager,
  executor: TransactionExecutor,
  input: BeginBranchMaterializationStageInput
): Promise<string> => {
  const frozenRemoteWatermark = structuredClone(input.frozenRemoteWatermark);
  const fingerprint = materializationFingerprint(frozenRemoteWatermark, input.syncScope);

  const stage = entityManager.instantiate(WorkingTreeMaterializationStage);
  stage.id = input.attemptId;
  stage.targetBranchId = input.targetBranchId;
  stage.frozenRemoteWatermark = frozenRemoteWatermark;
  stage.scopeManifest = scopeManifestOf(input.syncScope);
  stage.fingerprint = fingerprint;
  stage.status = 'pending';
  stage.pageCount = 0;
  await executor.saveMany([stage]);
  return fingerprint;
};

/**
 * 往一份开着的 staging 里追加一页（FR-044）。
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param executor - 一个**只装这一页**的写事务的执行器
 * @param input - 见 {@link AppendBranchMaterializationPageInput}
 * @throws {@link BranchNotMaterializedError} 头行不在、已经封口，或这一页的指纹与内容对不上时
 *
 * @remarks
 * **一次调用 = 一页 = 一个事务**，这是崩溃续传的全部依据：上一页提交之后才去拉下一页，
 * 于是任何时刻库里那批页都是「已经确认落盘的前缀」，`findResumableMaterializationAttempt()`
 * 数出来的 `nextPageIndex` 才是真的接续位置。
 *
 * 指纹在**落库这一刻**就复算一遍，不留到屏障：坏页越早拒越省——拒在这里，重拉的是这一页；
 * 拒在屏障，重拉的是整份快照。屏障那一遍照样要做（见 {@link assertStagingUsable}），
 * 因为这一遍防的是「来源方传坏了」，那一遍防的是「落库之后被改了」，不是同一件事。
 *
 * **页号由调用方给，本函数不自己数。** 自己数（读一次当前页数当页号）的话，两个并发的
 * 追加会算出同一个页号，而其中一个的失败要等到唯一索引那一层才显形；调用方那边本来就
 * 拿着 `nextPageIndex`，让它报出来，(stageId, pageIndex) 上的唯一索引才是在替它把关。
 * 页号连续性由封口与屏障两处统一验（密集从 0 起），不在每一页上各读一次页数来验——
 * 那是每页多一次查询，换来的判断与封口那一次完全一样。
 */
export const appendBranchMaterializationPage = async (
  entityManager: EntityManager,
  executor: TransactionExecutor,
  input: AppendBranchMaterializationPageInput
): Promise<void> => {
  await requirePendingStage(executor, input.attemptId, input.targetBranchId);

  const recomputed = branchMaterializationPageFingerprint(input.page.payload);
  if (recomputed !== input.page.fingerprint) {
    throw new BranchNotMaterializedError(
      input.targetBranchId,
      input.attemptId,
      'stage_tampered',
      `第 ${input.pageIndex} 页声明的指纹是 ${input.page.fingerprint}，按 payload 复算得到的是 ${recomputed}。`
    );
  }

  const row = entityManager.instantiate(WorkingTreeMaterializationPage);
  row.id = uuid();
  row.stageId = input.attemptId;
  row.pageIndex = input.pageIndex;
  row.payload = input.page.payload;
  row.fingerprint = input.page.fingerprint;
  await executor.saveMany([row]);
};

/**
 * 给一份落全的 staging 封口：把 `status` 置成 `staged` 并记下页数（FR-044）。
 *
 * @param executor - 一个**只装这一步**的写事务的执行器
 * @param input - 要封口的 attempt 与它的目标分支
 * @returns 见 {@link BranchMaterializationStaging}
 * @throws {@link BranchNotMaterializedError} 头行不在、已经封口，或落库的页号不是从 0 起的密集序列时
 *
 * @remarks
 * 页数由**数出来**而不是由调用方报：调用方报的是「我打算拉几页」，而这里要写的是
 * 「库里现在有几页」。两者在续传之后天然不同（这一趟只追加了后半截），照调用方报的写
 * 会让屏障那边的页数校验恒不成立。
 *
 * 封口**最后**写，且走 `repository.update()` 而不是再 `saveMany()` 一次头行：全部页落库之前
 * `status` 必须是 `pending`——提前写等于宣布一份半截 payload 可用；而 `saveMany` 是一次插入，
 * 会在表里留下第二条同主键的 attempt。
 *
 * 密集性在这里先验一遍，屏障那边还要再验一遍（{@link assertStagingUsable}）：这一遍挡的是
 * 「这一趟自己就漏发了一页」，那一遍挡的是「封口之后有人动了页表」。只留屏障那一遍的话，
 * 漏页要等到用户真的切分支那一刻才报出来，而那时这一趟的上下文早就没了。
 */
export const sealBranchMaterializationStage = async (
  executor: TransactionExecutor,
  input: { readonly attemptId: string; readonly targetBranchId: string }
): Promise<BranchMaterializationStaging> => {
  const stage = await requirePendingStage(executor, input.attemptId, input.targetBranchId);
  const pages = await findStagePages(executor, input.attemptId);
  assertDensePageOrder(pages, {
    branchId: input.targetBranchId,
    attemptId: input.attemptId
  });

  await executor
    .getRepository(WorkingTreeMaterializationStage)
    .update(stage, { status: 'staged', pageCount: pages.length });
  return { attemptId: input.attemptId, pageCount: pages.length, fingerprint: stage.fingerprint };
};

/**
 * 页号必须是从 0 起、步长 1 的密集序列。
 *
 * @param pages - 已按 `pageIndex` 升序取回的那批页
 * @param attempt - 报错时用来定位的目标分支与 attempt id
 * @throws {@link BranchNotMaterializedError} 有缺口、有重号或不从 0 起时
 *
 * @remarks
 * `(stageId, pageIndex)` 上的唯一索引只保证不重号，**不保证连续**：缺了第 3 页之后再补两页
 * 到第 5、6 号，页数照样对得上一个被改过的 `pageCount`。而屏障是按取回顺序逐页交给
 * `applyPage` 的——缺口那一页的内容就此静默消失，物化却宣布成功。
 */
const assertDensePageOrder = (
  pages: readonly WorkingTreeMaterializationPage[],
  attempt: { readonly branchId: string; readonly attemptId: string }
): void => {
  const gap = pages.findIndex((page, index) => page.pageIndex !== index);
  if (gap === -1) return;
  throw new BranchNotMaterializedError(
    attempt.branchId,
    attempt.attemptId,
    'stage_tampered',
    `页号不是从 0 起的密集序列：第 ${gap} 位上的页号是 ${pages[gap].pageIndex}。`
  );
};

/** 读一条 attempt 的头行；按 `(id, targetBranchId)` 一对定位，不只按 id。 */
const findStage = async (
  executor: TransactionExecutor,
  attemptId: string,
  targetBranchId: string
): Promise<WorkingTreeMaterializationStage | undefined> => {
  const [row] = await executor.getRepository(WorkingTreeMaterializationStage).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'id', operator: '=', value: attemptId },
        { field: 'targetBranchId', operator: '=', value: targetBranchId }
      ]
    },
    limit: 1
  });
  return row;
};

/** 读一条 attempt 的全部分页，按页序升序。 */
const findStagePages = (executor: TransactionExecutor, attemptId: string): Promise<WorkingTreeMaterializationPage[]> =>
  executor.getRepository(WorkingTreeMaterializationPage).find({
    where: { combinator: 'and', rules: [{ field: 'stageId', operator: '=', value: attemptId }] },
    orderBy: [{ field: 'pageIndex', sort: 'asc' }]
  });

/** 判两份意图是不是同一份：比的是**行上冻结下来的**水位与 scope。 */
const intentMatches = (
  stage: WorkingTreeMaterializationStage,
  frozenRemoteWatermark: Record<string, unknown>,
  syncScope: readonly string[]
): boolean =>
  canonicalJson(stage.frozenRemoteWatermark) === canonicalJson(frozenRemoteWatermark) &&
  canonicalJson(stage.scopeManifest) === canonicalJson(scopeManifestOf(syncScope));

/** {@link commitBranchMaterialization} 的入参。 */
export interface CommitBranchMaterializationInput {
  /** 要收尾的 attempt id */
  readonly attemptId: string;

  /** 要切过去的目标分支 id */
  readonly targetBranchId: string;

  /** 调用方进入这次切换时捕获到的 active token；屏障在任何写入之前回看一次 */
  readonly expectedActiveBranch: ActiveBranchToken;

  /** 调用方手上那份冻结水位；与 staging 行上的比对，不一致即 `intent_drift` */
  readonly frozenRemoteWatermark: Record<string, unknown>;

  /** 调用方手上那份完整 sync scope；同样与行上的比对 */
  readonly syncScope: readonly string[];

  /** 把一页快照写进投影；由调用方注入，本模块不认识业务实体 */
  readonly applyPage: (page: BranchMaterializationPage) => Promise<void>;
}

/** 一次物化成功之后的交代。 */
export interface BranchMaterializationResult {
  /** 新写下的 `kind=branch_baseline` 那一条的 id */
  readonly baselineCommitId: string;

  /** 目标分支拿到的不可变代际 */
  readonly generation: number;

  /** 推进之后的 activation revision */
  readonly activationRevision: number;
}

/** 屏障拒绝时抛的那个错；四个成因共用这一个出口。 */
const reject = (
  input: CommitBranchMaterializationInput,
  reason: BranchNotMaterializedReason,
  detail: string
): never => {
  throw new BranchNotMaterializedError(input.targetBranchId, input.attemptId, reason, detail);
};

/**
 * 复核这次收尾的全部依据，交回已经落全的那批页。
 *
 * @remarks
 * 次序是「自洽先于关系」：`status` 与 `pageCount` 是写页那一方自己写下的两个值，它们先得
 * 互相对得上；水位与 scope 是**调用方与这一行之间**的关系，只有在这一行自洽之后才谈得上比。
 * 倒过来的话，一份半截 staging 会因为意图恰好没漂而先被判成「意图相符」，成因就报错了。
 */
const assertStagingUsable = async (
  executor: TransactionExecutor,
  input: CommitBranchMaterializationInput
): Promise<WorkingTreeMaterializationPage[]> => {
  const stage = await findStage(executor, input.attemptId, input.targetBranchId);
  if (!stage) reject(input, 'stage_missing', '库里没有这条 attempt，或它记的目标分支不是这一条。');
  const row = stage as WorkingTreeMaterializationStage;

  if (row.status !== 'staged') {
    reject(input, 'stage_incomplete', `attempt 的 status 是 '${row.status}'，只有 'staged' 才是一份完整快照。`);
  }
  const pages = await findStagePages(executor, input.attemptId);
  if (pages.length !== row.pageCount) {
    reject(input, 'stage_incomplete', `落库 ${pages.length} 页，行上记的是 ${row.pageCount} 页。`);
  }
  if (!intentMatches(row, input.frozenRemoteWatermark, input.syncScope)) {
    reject(
      input,
      'intent_drift',
      '调用方手上的水位/scope 与 staging 冻结下来的那份不一致，这份快照不是为这次切换攒的。'
    );
  }
  return pages;
};

/** 取 `RxDBBranch` 上一列的真实列名并加引号；写字面量会在列改名那天拼出一条打在不存在的列上的合法 SQL。 */
const branchColumn = (metadata: EntityMetadata, field: 'id' | 'activated' | 'activeKey' | 'updatedAt'): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`RxDBBranch 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/**
 * 拼「熄灭旧 active、点亮目标分支」那**两条**语句。
 *
 * @remarks
 * 两条而不是一条 `SET activated = CASE ... END`：`activeKey` 的唯一索引是逐行立即检查的，
 * 在同一条语句里把哨兵值从 A 行搬到 B 行，会按行处理顺序瞬时撞上自己。与
 * `rxdb-adapter-pglite/src/version/switch_branch.ts` 同一条理由、同一个形状。
 *
 * `updatedAt` 只在**真正翻转**的行上推进：熄灭那条的 WHERE 已经把没翻转的行排除干净，
 * 所以无条件推进；点亮那条会扫到「本来就是当前分支」的行，条件必须留着。
 * 时刻走 `sqlTimestampLiteral` 而不是 `CURRENT_TIMESTAMP`——后者在 SQLite 上求值成
 * `'YYYY-MM-DD HH:MM:SS'`，与本仓日期列的 ISO 存储形态对不上。
 */
const buildActiveBranchSwitchStatements = (tableRef: string, targetBranchId: string): [string, string] => {
  const metadata = getEntityMetadata(RxDBBranch);
  const id = branchColumn(metadata, 'id');
  const activated = branchColumn(metadata, 'activated');
  const activeKey = branchColumn(metadata, 'activeKey');
  const updatedAt = branchColumn(metadata, 'updatedAt');
  const now = sqlTimestampLiteral(new Date());
  const target = sqlStringLiteral(targetBranchId);

  return [
    [
      `UPDATE ${tableRef}`,
      `SET ${activated} = ${sqlBooleanLiteral(false)}, ${activeKey} = NULL, ${updatedAt} = ${now}`,
      `WHERE ${activated} = ${sqlBooleanLiteral(true)} AND ${id} != ${target}`
    ].join(' '),
    [
      `UPDATE ${tableRef}`,
      `SET ${activated} = ${sqlBooleanLiteral(true)}, ${activeKey} = ${sqlStringLiteral(ACTIVE_BRANCH_KEY)},`,
      `${updatedAt} = CASE WHEN ${activated} = ${sqlBooleanLiteral(false)} THEN ${now} ELSE ${updatedAt} END`,
      `WHERE ${id} = ${target}`
    ].join(' ')
  ];
};

/**
 * 给目标分支落下 ref 与工作树状态两行。
 *
 * @remarks
 * 两条支线的分别只在**有没有那一行**：
 *
 * - **0004 留下的占位 ref**（`headCommitId: null`）**就地接管**，走一次按主键的 `update()`。
 *   再 `saveMany()` 一条新的等于同主键写两行——在真库上是一次唯一约束冲突。代际沿用它已经
 *   发过的那个，不再重发：那一行的代际早已被别处引用过。
 * - **没有 ref**（0004 之后同步进来的那种）才现发代际、现建两行。
 *
 * HEAD 在这里**直接写下**，不走 `writeCommit()` 那条推进 CAS：那条 CAS 卡的是
 * `headRevision`，而目标分支此刻的 HEAD 恒为空（非空的已经被 `target_already_materialized`
 * 挡在外面），没有第二个调用方能合法地与本次抢同一个根。真正管用的两道闸在别处——
 * 屏障开头的 active token 复核与结尾的 activation revision CAS。
 */
const plantTargetBranchRows = async (
  entityManager: EntityManager,
  executor: TransactionExecutor,
  target: {
    readonly branchId: string;
    readonly generation: number;
    readonly baselineCommitId: string;
    readonly existingRef: CommitBranchRef | undefined;
    readonly existingState: WorkingTreeState | undefined;
  }
): Promise<void> => {
  const [freshRef, freshState] = createBranchCommitRows(entityManager, target.branchId, target.generation);

  if (target.existingRef) {
    await executor.getRepository(CommitBranchRef).update(target.existingRef, {
      headCommitId: target.baselineCommitId,
      headRevision: target.existingRef.headRevision + 1
    });
  } else {
    freshRef.headCommitId = target.baselineCommitId;
    freshRef.headRevision = 1;
    await executor.saveMany([freshRef]);
  }

  if (!target.existingState) await executor.saveMany([freshState]);
};

/**
 * 把一份已经落全的 staging 变成一条切过去的分支——九件事同属这一道屏障（FR-044）。
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param executor - 调用方那个写事务的执行器；本函数不自己开事务，九件事靠它同生共死
 * @param input - 见 {@link CommitBranchMaterializationInput}
 * @returns 见 {@link BranchMaterializationResult}
 * @throws {@link StaleActiveBranchError} active token 过期，或 activation revision 的 CAS 落空时
 * @throws {@link BranchNotMaterializedError} 四种物化依据不足时；staging 原样留着
 *
 * @remarks
 * 九件事的次序是契约本身：
 *
 * 1. **复核 active token**——排在任何写入之前。写完发现不对再撤，撤销发生在事务边界之外
 *    （或者进程崩在中间）留下的是半棵切过去的工作树，而用户以为自己的操作被拒绝了。
 * 2. **判目标身份**——目标分支已经有 baseline 就停手。覆盖过去会让那条分支上已经提交的历史
 *    整段失去根；跳过则更糟——active 切过去了，而投影还是上一次物化的内容。
 * 3. **复核 staging**（见 {@link assertStagingUsable}）。
 * 4. **逐页物化**，排在建 baseline / 建 ref **之前**：建了 ref 再往投影里写，等于让一条
 *    「已经有根」的分支在物化中途对外可见。
 * 5. **写 `kind=branch_baseline`**，幂等键由本条分支的代际与 attempt id 合成——代际全局单调
 *    不复用，于是同一次 attempt 的重放认得出自己，而两条分支的基线不会互相误认。
 * 6. **落 ref 与工作树状态**（见 {@link plantTargetBranchRows}）。
 * 7. **推进 activation revision**，走 T119 那条持久化 CAS；落空说明别的标签页刚切过分支，
 *    这次整体作废。
 * 8. **切 active**，两条裸 SQL。
 * 9. **删本次 attempt 的 staging**：分页先删、头行后删，两次 `removeMany` 而不是一次——
 *    `getEntityMutations` 按实体分组，一次调用里的跨表顺序不由调用方决定，而分页对头行挂着
 *    一条真正的外键。删除**带 attempt 条件**：不带的话两张表会被清空，而「本次的没了」照样成立。
 */
export const commitBranchMaterialization = async (
  entityManager: EntityManager,
  executor: TransactionExecutor,
  input: CommitBranchMaterializationInput
): Promise<BranchMaterializationResult> => {
  const actual = await readActiveBranchToken(executor);
  if (
    actual.branchId !== input.expectedActiveBranch.branchId ||
    actual.activationRevision !== input.expectedActiveBranch.activationRevision
  ) {
    throw new StaleActiveBranchError(input.expectedActiveBranch, actual);
  }

  const existingRef = await findBranchRef(executor, input.targetBranchId);
  if (existingRef && existingRef.headCommitId !== null) {
    reject(
      input,
      'target_already_materialized',
      `它的 HEAD 已经是 ${existingRef.headCommitId}，这次物化没有位置可放。`
    );
  }

  const pages = await assertStagingUsable(executor, input);
  for (const page of pages) {
    await input.applyPage({ pageIndex: page.pageIndex, payload: page.payload, fingerprint: page.fingerprint });
  }

  const generation = existingRef ? existingRef.generation : await allocateBranchGeneration(executor);
  const { commit } = buildCommitRows(entityManager, {
    id: uuid(),
    kind: 'branch_baseline',
    parentIds: [],
    message: SYSTEM_COMMIT_MESSAGES.branch_baseline,
    author: null,
    operationId: deriveCommitOperationId({ branchGeneration: generation, operationId: input.attemptId }),
    units: []
  });
  await executor.saveMany([commit]);

  await plantTargetBranchRows(entityManager, executor, {
    branchId: input.targetBranchId,
    generation,
    baselineCommitId: commit.id,
    existingRef,
    existingState: await findWorkingTreeState(executor, input.targetBranchId)
  });

  const bump = await bumpActivationRevision(executor, input.expectedActiveBranch.activationRevision);
  if (!bump.ok) {
    throw new StaleActiveBranchError(input.expectedActiveBranch, {
      branchId: bump.conflict.branchId,
      activationRevision: bump.conflict.actual
    });
  }

  const tableRef = executor.tableRef(RxDBBranch);
  for (const statement of buildActiveBranchSwitchStatements(tableRef, input.targetBranchId)) {
    await executor.query(statement);
  }

  await discardMaterializationAttempt(executor, input.attemptId);
  return { baselineCommitId: commit.id, generation, activationRevision: bump.activationRevision };
};

/** {@link findResumableMaterializationAttempt} 的判据。 */
export interface ResumableMaterializationCriteria {
  /** 要物化的目标分支 id */
  readonly targetBranchId: string;

  /** 本次打算冻结的终止水位 */
  readonly frozenRemoteWatermark: Record<string, unknown>;

  /** 本次的完整 sync scope */
  readonly syncScope: readonly string[];
}

/** 一份可续用的 staging。 */
export interface ResumableMaterializationAttempt {
  /** 可以接着用的 attempt id */
  readonly attemptId: string;

  /** 从第几页接着拉；已经落全时它等于总页数，接着的是收尾不是拉页 */
  readonly nextPageIndex: number;
}

/**
 * 找一份意图相同、可以接着拉的旧 attempt（FR-044）。
 *
 * @param executor - 调用方那个事务的执行器；本函数只读，**一行都不删**
 * @param criteria - 见 {@link ResumableMaterializationCriteria}
 * @returns 命中时是接续位置；没有可续用的就是 `null`
 *
 * @remarks
 * 比的是行上**冻结下来的**水位与 `scopeManifest`，不是拿它们重算一个指纹再与 `row.fingerprint`
 * 比：指纹的算法会随版本演进，而一份旧库里的行带着旧算法的值——按指纹比会把每一份跨版本的
 * staging 都判成不可续用，而它们的意图明明没变。指纹在这条链路上的用途在别处（staging 侧的
 * 幂等与去重）。
 *
 * `aborted` 的排除掉，`pending` 与 `staged` 都收：前者是崩在分页中途的那种，后者已经落全，
 * 接续位置恰好等于总页数——调用方拿到之后直接走收尾。
 *
 * **判不可续用不删**。「反正用不了」删掉它，等于把诊断「上一次为什么没接上」需要的
 * `scopeManifest` 与那半份 payload 一起丢了；清理是 FR-044 单列的一条能力，是调用方的决定。
 */
export const findResumableMaterializationAttempt = async (
  executor: TransactionExecutor,
  criteria: ResumableMaterializationCriteria
): Promise<ResumableMaterializationAttempt | null> => {
  const stages = await executor.getRepository(WorkingTreeMaterializationStage).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'targetBranchId', operator: '=', value: criteria.targetBranchId },
        { field: 'status', operator: '!=', value: 'aborted' }
      ]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  const match = stages.find(stage => intentMatches(stage, criteria.frozenRemoteWatermark, criteria.syncScope));
  if (!match) return null;

  const pages = await findStagePages(executor, match.id);
  return { attemptId: match.id, nextPageIndex: pages.length };
};

/**
 * 按 attempt 清理一份 staging（FR-044）。
 *
 * @param executor - 调用方那个写事务的执行器
 * @param attemptId - 要清理的 attempt id
 *
 * @remarks
 * **分页先于头行删，两次 `removeMany` 而不是一次**：`getEntityMutations` 按实体分组，一次调用
 * 里的跨表顺序不由调用方决定，而分页对头行挂着一条真正的外键。与
 * `commit/branch-commit-rows.ts` 的删除路径同一条理由、同一个形状。
 *
 * 条件**只按这一个 attempt**：不带条件的写法会把两张表清空，而「这一条没了」照样成立——
 * 旁观的那次尝试就此消失，且没有任何一行可以露出来。
 *
 * 找不到那条 attempt 时静默返回：清理是幂等的，重复清理与「本来就没有」在这里是同一件事。
 */
export const discardMaterializationAttempt = async (
  executor: TransactionExecutor,
  attemptId: string
): Promise<void> => {
  const pages = await findStagePages(executor, attemptId);
  if (pages.length > 0) await executor.removeMany(pages);

  const stages = await executor.getRepository(WorkingTreeMaterializationStage).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: attemptId }] },
    limit: 1
  });
  if (stages.length > 0) await executor.removeMany(stages);
};
