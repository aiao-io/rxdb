/**
 * @fileoverview 首次切到一条 metadata-only 分支时，把远端快照物化成本地历史（FR-044/049）。
 *
 * @remarks
 * `branch-materialization.ts` 提供的是**原语**：登记意图、逐页落库、封口、作废、提交屏障。
 * 本模块提供的是把它们串起来的那条流水线；「远端快照从哪来、一页怎么变成投影」在
 * {@link BranchMaterializationSource} 那一侧——来源由官方同步插件在装配时登记进
 * {@link RxDB.branchMaterializationSource}，本包一个业务实体都不认识。
 *
 * 两者分开是因为**事务形状不同**。原语各自跑在调用方给的一个执行器里，本模块反过来——
 * 它自己开好几笔事务，中间夹着网络 I/O：
 *
 * 1. 一笔只读事务：判能力位、判物化状态、过前置条件、捕获 active token、取最近一份 staging
 *    并问来源方它冻结之后漂没漂；
 * 2. 漂了的那份用一笔事务作废；没有可续用的 staging 时，**在任何事务之外** `freezeIntent()`
 *    （网络 I/O，握着写事务不放会把库锁到超时），再用一笔事务开头行；
 * 3. **每页一笔事务**：崩在第 7 页时前 7 页留在库里，这正是 FR-044 要的性质；
 * 4. 一笔事务封口；
 * 5. 一次 `adapter.switchBranch()`：屏障跑在它的 `prepare` 里，与适配器随后的重建触发器、
 *    翻 active 同一笔事务，同生共死；提交之后由适配器发分支更新与切换事件。
 *
 * 第 5 步写业务表，却**不产生**工作树单元。受信调用点登记表里两行各管一段：
 *
 * - **#10** 是那次 `adapter.switchBranch()` 本身，与 #1（`VersionManager.switchBranch`）同一个
 *   意图、同一个原语。声明挂在适配器上，由挂载点 3 在调 `prepare` **之前**同步取走；
 * - **#11** 是屏障里落投影的那几次 `executor.mergeChanges()`。#10 那张票在 `prepare` 跑起来
 *   之前就已经用掉了，罩不住里面的原语，所以每一批各自声明，由挂载点 2 当场取走。
 *
 * 于是它接在 {@link RxDBSystemContribution.takeOverBranchSwitch} 上，而不是
 * `prepareBranchSwitch` 上：后者拿到的是切换事务**已经开好的**执行器，前四步一步都塞不进去——
 * 网络 I/O 不能握着写事务，逐页落库要求每页各自可提交。接管方先把四步做完，再自己发起那次切换。
 */

import type {
  BranchMaterializationIntent,
  BranchMaterializationPage,
  BranchMaterializationSource,
  LocalRxDBAdapter,
  RxDB,
  RxDBBranchSwitchTakeover,
  RxDBBranchSwitchTakeoverContext,
  SwitchVersionActions,
  TransactionExecutor
} from '@aiao/rxdb';
import {
  declareTrustedWrite,
  RxDBBranch,
  RxDBChange,
  RxDBError,
  takeDeclaredWrite,
  TrustedWriteIntent,
  uuid
} from '@aiao/rxdb';
import { compute_switch_branch_actions } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { isCommitCapabilityEnabled } from '../commit/commit-capability.js';
import {
  abortMaterializationAttempt,
  appendBranchMaterializationPage,
  beginBranchMaterializationStage,
  BranchNotMaterializedError,
  classifyBranchMaterialization,
  commitBranchMaterialization,
  findLatestMaterializationAttempt,
  sealBranchMaterializationStage,
  type LatestMaterializationAttempt
} from './branch-materialization.js';
import { readActiveBranchToken } from './capture-runtime.js';
import { assertSwitchBranchPreconditions } from './switch-branch-options.js';
import type { ActiveBranchToken } from './write-entry.js';

/** 这条连接上没有物化来源时，`switchBranch()` 拿到的东西。 */
const rejectWithoutSource = (targetBranchId: string): never => {
  throw new BranchNotMaterializedError(
    targetBranchId,
    null,
    'source_unavailable',
    '这条分支本地只有 metadata，切过去要先把远端快照物化成本地历史，' +
      '而这条连接上没有分支物化来源——官方来源由 @aiao/rxdb-plugin-sync 在装配时登记，装上它再试。'
  );
};

/** 要物化时，只读事务交出来的现场。 */
interface MaterializationReady {
  readonly kind: 'materialize';

  /** 进入时捕获的 active token；屏障拿它做 CAS */
  readonly activeToken: ActiveBranchToken;

  /** 已经确认存在的那个来源 */
  readonly source: BranchMaterializationSource;

  /** 目标分支上最近一份没作废的 staging；没有时为 `null` */
  readonly latest: LatestMaterializationAttempt | null;

  /** 那份 staging 冻结之后本地配置的漂移原因；没漂或没有 staging 时为 `undefined` */
  readonly latestDrift: string | undefined;
}

/** 开拉之前那笔只读事务的结论。 */
type MaterializationPrelude =
  /** 这次切换与本条路径无关：库未启用能力，或目标本来就已物化 */
  | { readonly kind: 'skip' }
  /** 要物化 */
  | MaterializationReady;

/**
 * 开拉之前的那一笔只读事务：要问的一次问完。
 *
 * @remarks
 * 合在**一笔**事务里而不是各问各的：判据之间的每一条缝都是一个别人可以改变现场的窗口，
 * 而这次物化随后要拿着其中的 `activeToken` 一路走到屏障。分开问的话，读到的那条 active
 * 可能已经不是过前置条件时的那条了。
 *
 * 只读——**一行都不写**。切换事务里那句 `advanceActivationRevision()` 在这条路径上没有对应物：
 * 代际由屏障里的 `bumpActivationRevision()` CAS 推进，那才是这次切换真正发生的时刻
 * （见 {@link commitBranchMaterialization}）。在这里先推一次的话，屏障手上的 token 当场作废。
 * 漂了的 staging 也不在这里作废：那是一次写，留给 {@link openStaging} 另开一笔。
 */
const readPrelude = async (
  executor: TransactionExecutor,
  context: RxDBBranchSwitchTakeoverContext,
  source: BranchMaterializationSource | undefined
): Promise<MaterializationPrelude> => {
  // 未启用的库整套语义都是短路的（FR-037/046）：它没有 ref 行、没有 staging 表上的行，
  // 这条路径对它无从谈起。照常走普通切换。
  if (!(await isCommitCapabilityEnabled(executor))) return { kind: 'skip' };
  // 判物化状态**先于**判有没有来源：目标本来就已物化时，没有来源是完全正常的，
  // 反过来先判来源会让每一个没装同步层的库连普通切换都做不了。
  const state = await classifyBranchMaterialization(executor, context.targetBranchId);
  if (state.kind !== 'metadata_only') return { kind: 'skip' };
  if (!source) return rejectWithoutSource(context.targetBranchId);
  // 前置条件在这里先过一遍：拉页是一趟网络，调用方提的条件不成立时不该白拉。
  // 屏障里还会再过一遍——两者之间隔着整趟拉页，这里的结论到屏障时未必还成立。
  await assertSwitchBranchPreconditions(executor, context.preconditions);
  const activeToken = await readActiveBranchToken(executor);
  const latest = await findLatestMaterializationAttempt(executor, context.targetBranchId);
  const latestDrift =
    latest ?
      await source.resolveIntentDrift({ targetBranchId: context.targetBranchId, intent: latest.intent, executor })
    : undefined;
  return { kind: 'materialize', activeToken, source, latest, latestDrift };
};

/** 开拉前定下的落脚点：用哪条 attempt、按哪份意图、从第几页接、还要不要封口。 */
interface StagingCursor {
  /** 这次用的 attempt id */
  readonly attemptId: string;

  /** 这份 staging 冻结的意图；续用时是行上那份，不是新冻结的 */
  readonly intent: BranchMaterializationIntent;

  /** 从第几页接着拉 */
  readonly fromPageIndex: number;

  /** 已落库的最后一页；来源方从它的 payload 里读出续拉游标 */
  readonly previousPage: BranchMaterializationPage | null;

  /** 已经封过口了吗；`true` 时直接走屏障 */
  readonly sealed: boolean;
}

/**
 * 在任何事务之外冻结一份新意图。
 *
 * @throws {@link BranchNotMaterializedError} 来源方抛出时（`source_failed`，原始错误挂在 `cause` 上）
 *
 * @remarks
 * 包一层而不是让原始错误直接上抛：调用方要按成因分支处理切换失败，而一个裸的网络错误
 * 说不出「这是物化的哪一步、库里留下了什么」。这一步失败时库里还没有任何一行 staging，
 * 所以 `attemptId` 是 `null`。
 */
const freezeIntent = async (
  source: BranchMaterializationSource,
  targetBranchId: string
): Promise<BranchMaterializationIntent> => {
  try {
    return await source.freezeIntent(targetBranchId);
  } catch (error) {
    throw new BranchNotMaterializedError(
      targetBranchId,
      null,
      'source_failed',
      '来源方冻结意图时抛了（原始错误见 cause），库里还没有任何一行 staging。',
      error
    );
  }
};

/**
 * 续用最近一份没漂的 staging；没有就作废漂了的那份（如果有），冻结一份新意图，开一份新的。
 *
 * @remarks
 * 续用时**沿用行上冻结的那份意图，不重新冻结**：重新冻结的水位会比行上的新，接着拉下来的
 * 后半截与已落库的前半截属于两个时刻。于是冻结排在查 staging **之后**——能续用的时候
 * 那一趟网络本来就不该发生。
 *
 * 漂了的那份是**作废**而不是删：它不能再续，但那半份 payload 与它的 `scopeManifest`
 * 正是诊断「上一次为什么没接上」要看的东西。
 */
const openStaging = async (
  rxdb: RxDB,
  adapter: LocalRxDBAdapter,
  targetBranchId: string,
  prelude: MaterializationReady
): Promise<StagingCursor> => {
  const { latest, latestDrift, source } = prelude;
  if (latest && latestDrift === undefined) {
    return {
      attemptId: latest.attemptId,
      intent: latest.intent,
      fromPageIndex: latest.nextPageIndex,
      previousPage: latest.lastPage,
      sealed: latest.sealed
    };
  }
  if (latest) await adapter.transaction(executor => abortMaterializationAttempt(executor, latest.attemptId));

  const intent = await freezeIntent(source, targetBranchId);
  const attemptId = uuid();
  await adapter.transaction(executor =>
    beginBranchMaterializationStage(rxdb.entityManager, executor, {
      attemptId,
      targetBranchId,
      frozenRemoteWatermark: intent.frozenRemoteWatermark,
      syncScope: intent.syncScope
    })
  );
  return { attemptId, intent, fromPageIndex: 0, previousPage: null, sealed: false };
};

/**
 * 逐页落库；**每页各一笔事务**。
 *
 * @throws {@link BranchNotMaterializedError} 来源方交页时抛出（`source_failed`），或落库被拒时
 *
 * @remarks
 * 页号由这里发放并自增，而不是让 `appendBranchMaterializationPage` 自己去数库里有几页：
 * 自己数的话两次并发追加会算出同一个页号，而这一趟本来就知道自己发到哪了。
 *
 * 循环体里**不吞异常**。第 N 页失败就地抛出，前 N 页留在库里等下一次接着拉——把它 catch 住
 * 继续拉下一页，留下的就是一份页号带洞的 staging，而洞要到封口那一刻才被发现。
 *
 * 两类失败包法不同：来源方抛的包成 `source_failed`（原始错误挂在 `cause` 上），落库那一步抛的
 * 原样上抛——`page_conflict` / `stage_tampered` 本来就是带成因的物化错误，再包一层成因就错了。
 */
const pullPages = async (
  rxdb: RxDB,
  adapter: LocalRxDBAdapter,
  source: BranchMaterializationSource,
  targetBranchId: string,
  cursor: StagingCursor
): Promise<void> => {
  let pageIndex = cursor.fromPageIndex;
  let appending = false;
  try {
    const pages = source.pages({
      targetBranchId,
      intent: cursor.intent,
      fromPageIndex: cursor.fromPageIndex,
      previousPage: cursor.previousPage
    });
    for await (const page of pages) {
      appending = true;
      const at = pageIndex;
      await adapter.transaction(executor =>
        appendBranchMaterializationPage(rxdb.entityManager, executor, {
          attemptId: cursor.attemptId,
          targetBranchId,
          pageIndex: at,
          page
        })
      );
      appending = false;
      pageIndex += 1;
    }
  } catch (error) {
    if (appending) throw error;
    throw new BranchNotMaterializedError(
      targetBranchId,
      cursor.attemptId,
      'source_failed',
      `来源方交第 ${pageIndex} 页时抛了（原始错误见 cause）；` +
        `已落库的 ${pageIndex} 页留着，下一次切换从第 ${pageIndex} 页接着拉。`,
      error
    );
  }
};

/**
 * 发起那次切换，把屏障交给适配器在切换事务里跑。
 *
 * @param adapter - 本地适配器
 * @param targetBranchId - 要切过去的目标分支 id
 * @param barrier - 屏障本体；跑在 `prepare` 里，拿到的是切换事务的执行器
 * @throws RxDBError 适配器没有调用 `prepare` 时
 *
 * @remarks
 * `actions` **故意为空**：适配器在 `prepare` 返回之后才套用 actions，而撤掉来源分支的投影、
 * 铺目标分支的快照都得排在建 baseline / 建 ref 之前——只有屏障自己按次序做得到。
 *
 * 声明（登记表 #10）紧贴在调用前：挂载点 3 在调 `prepare` 之前同步取走它。适配器在那之前就抛了的话
 * 它还挂在适配器上，`finally` 里收回——留着的话，这张票会被下一次适配器级写取走。
 */
const switchWithMaterialization = async (
  adapter: LocalRxDBAdapter,
  targetBranchId: string,
  barrier: (executor: TransactionExecutor) => Promise<void>
): Promise<void> => {
  let prepared = false;
  // 这次切换写下的是目标分支的**投影**，不是用户的编辑——与 `VersionManager.switchBranch()`
  // 那次（登记表 #1）同一个意图、同一个原语。
  declareTrustedWrite(adapter, {
    file: 'materialize-branch.ts',
    symbol: 'switchWithMaterialization',
    intent: TrustedWriteIntent.branch_materialization
  });
  try {
    await adapter.switchBranch({
      branchId: targetBranchId,
      actions: { deletes: new Map(), updates: new Map(), inserts: new Map() },
      prepare: async ({ executor }) => {
        prepared = true;
        await barrier(executor);
      }
    });
  } finally {
    takeDeclaredWrite(adapter);
  }
  if (!prepared) {
    throw new RxDBError(
      `适配器 ${adapter.constructor.name} 的 switchBranch 没有调用 options.prepare：` +
        `分支已经切到 ${targetBranchId}，但这次物化一页都没落。` +
        '适配器必须在解析出目标分支之后、动第一行之前 await 它（见 rxdb-adapter.ts › SwitchBranchOptions.prepare）。'
    );
  }
};

/**
 * 按次序把几批投影写进切换事务。
 *
 * @param executor - 切换事务的执行器
 * @param batches - 先撤来源分支、再逐页铺目标分支的那几批
 *
 * @remarks
 * 每一批各自声明（登记表 #11），由挂载点 2 当场取走：声明是一次一取的，一张票罩不住两次原语。
 * 空批跳过而不是照样调：没有写的调用也会取走声明，却什么都不落——跳过的话连声明都不留。
 *
 * 触发器关着写（`disableTriggers = true`），与同步层拉取落库同一个口径：这些行是远端的快照，
 * 不是本机的编辑，记进变更日志的话，下一次推送会把它们当成本机的写再推回去。
 *
 * 逐批 `await` 而不是并发：后一批可能正是前一批同一行的更新，次序就是语义。
 */
const applyMaterializedActions = async (
  executor: TransactionExecutor,
  batches: readonly SwitchVersionActions[]
): Promise<void> => {
  for (const batch of batches) {
    if (batch.deletes.size + batch.updates.size + batch.inserts.size === 0) continue;
    declareTrustedWrite(executor, {
      file: 'materialize-branch.ts',
      symbol: 'applyMaterializedActions',
      intent: TrustedWriteIntent.branch_materialization
    });
    await executor.mergeChanges(batch, undefined, true);
  }
};

/**
 * 屏障里的物化那一步：撤掉来源分支的投影 → 逐页投影 → 结算来源方的水位。
 *
 * @remarks
 * 撤销按普通切换的同一口径算（{@link compute_switch_branch_actions}），用的是执行器上的仓库——
 * 绑在适配器上的本地仓库会在同一条连接上等切换事务自己，死锁。
 *
 * 投影**全部算完再落**：来源方算投影时可能要读本地现场，边算边落的话，后一页读到的是
 * 前一页写过的库。
 */
const materializePages = async (
  source: BranchMaterializationSource,
  executor: TransactionExecutor,
  target: { readonly targetBranchId: string; readonly intent: BranchMaterializationIntent },
  pages: readonly BranchMaterializationPage[]
): Promise<void> => {
  const revert = await compute_switch_branch_actions(
    { branchRepository: executor.getRepository(RxDBBranch), changeRepository: executor.getRepository(RxDBChange) },
    target.targetBranchId
  );
  const projected: SwitchVersionActions[] = [];
  for (const page of pages) projected.push(await source.projectPage({ ...target, executor, page }));
  await applyMaterializedActions(executor, [revert, ...projected]);
  await source.settle({ ...target, executor });
};

/**
 * 接管一次切到 metadata-only 分支的切换（FR-044/049）。
 *
 * @param rxdb - 宿主实例；物化来源从 {@link RxDB.getBranchMaterializationSource} 取
 * @param context - 核心交下来的切换现场
 * @returns `'switched'` 表示 active 已经切过去了；`'not_applicable'` 表示照常走普通切换
 * @throws {@link BranchNotMaterializedError} 目标要物化、而这条连接上没有来源（`source_unavailable`），
 * 来源方冻结意图或交页时抛出（`source_failed`），或屏障判依据不足时；active 都停在来源分支上
 * @throws {@link StaleActiveBranchError} 拉页期间别的连接切过分支时（屏障的 CAS 落空）
 *
 * @remarks
 * 五段各自的事务边界见本文件的 @fileoverview。三处**故意**没做的事：
 *
 * - **失败时不清 staging**。那半份 payload 连同它的 `scopeManifest` 正是诊断「上一次为什么
 *   没接上」需要的东西，也是下一次续拉的起点。清理是 FR-044 单列的一条能力
 *   （`discardMaterializationAttempt()`），是调用方的决定，不是失败的副作用。
 * - **不重试**。哪一种失败该重试只有调用方答得出：`stage_tampered` 要整份丢掉重拉，
 *   `StaleActiveBranchError` 要先弄清另一条连接为什么切了分支，而网络失败重试几次是同步层的口径。
 * - **不在只读事务里推进 activation revision**。这条路径上推进它的是屏障里的 CAS，
 *   而不是 `prepareBranchSwitch` 里那句 `advanceActivationRevision()`。
 *
 * 前置条件过**两遍**：只读事务里一遍（条件不成立时不白拉），屏障里再一遍（两者之间隔着整趟拉页）。
 * 其它贡献方的 `prepareBranchSwitch` 在这条路径上不跑——接管是二选一的，见
 * {@link RxDBSystemContribution.takeOverBranchSwitch}。
 */
export const takeOverBranchSwitchWithMaterialization = async (
  rxdb: RxDB,
  context: RxDBBranchSwitchTakeoverContext
): Promise<RxDBBranchSwitchTakeover> => {
  const adapter = await firstValueFrom(rxdb.localAdapter$);
  const source = rxdb.getBranchMaterializationSource();
  const prelude = await adapter.transaction(executor => readPrelude(executor, context, source));
  if (prelude.kind === 'skip') return 'not_applicable';

  const targetBranchId = context.targetBranchId;
  const cursor = await openStaging(rxdb, adapter, targetBranchId, prelude);
  if (!cursor.sealed) {
    await pullPages(rxdb, adapter, prelude.source, targetBranchId, cursor);
    await adapter.transaction(executor =>
      sealBranchMaterializationStage(executor, { attemptId: cursor.attemptId, targetBranchId })
    );
  }

  const target = { targetBranchId, intent: cursor.intent };
  await switchWithMaterialization(adapter, targetBranchId, async executor => {
    await assertSwitchBranchPreconditions(executor, context.preconditions);
    await commitBranchMaterialization(rxdb.entityManager, executor, {
      attemptId: cursor.attemptId,
      targetBranchId,
      expectedActiveBranch: prelude.activeToken,
      frozenRemoteWatermark: cursor.intent.frozenRemoteWatermark,
      syncScope: cursor.intent.syncScope,
      resolveIntentDrift: executor => prelude.source.resolveIntentDrift({ ...target, executor }),
      materialize: (pages, executor) => materializePages(prelude.source, executor, target, pages)
    });
  });
  return 'switched';
};
