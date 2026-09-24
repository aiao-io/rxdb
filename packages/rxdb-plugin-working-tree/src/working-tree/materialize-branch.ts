/**
 * @fileoverview 首次切到一条 metadata-only 分支时，把远端快照物化成本地历史（FR-044/049）。
 *
 * @remarks
 * `branch-materialization.ts` 提供的是**四段原语**：登记意图、逐页落库、封口、提交屏障。
 * 本模块提供的是把它们串起来的那条流水线，以及它与外界的唯一接缝
 * {@link BranchMaterializationSource}——「远端快照从哪来、一页怎么写进投影」全在接缝那一侧，
 * 本包一个业务实体都不认识。
 *
 * 两者分开是因为**事务形状不同**。原语各自跑在调用方给的一个执行器里，本模块反过来——
 * 它自己开好几笔事务，中间夹着网络 I/O：
 *
 * 1. 一笔只读事务：判能力位、判物化状态、过前置条件、捕获 active token；
 * 2. **没有事务**：`freezeIntent()` 拿终止水位（网络 I/O，握着写事务不放会把库锁到超时）；
 * 3. 一笔事务开头行（或续用一份旧的）；
 * 4. **每页一笔事务**：崩在第 7 页时前 7 页留在库里，这正是 FR-044 要的性质；
 * 5. 一笔事务封口；
 * 6. 一笔事务跑屏障——九件事同生共死，含最后那一步切 active。
 *
 * 第 6 步写业务表，却**不产生**工作树单元：屏障体返回前自报 `branch_materialization`
 * （受信调用点登记表 #10），挂载点 1 据此把整笔判成投影重写。这一行与 #1 意图相同、原语不同——
 * #1 走 `adapter.switchBranch()`，这里走的是屏障自己开的 `adapter.transaction()`。
 *
 * 于是它接在 {@link RxDBSystemContribution.takeOverBranchSwitch} 上，而不是
 * `prepareBranchSwitch` 上：后者拿到的是**切换事务自己的**执行器，上面六步一步都塞不进去，
 * 而第 6 步末尾本来就在切 active——它是那次切换，不是那次切换的前置。
 */

import type {
  LocalRxDBAdapter,
  RxDB,
  RxDBBranchSwitchTakeover,
  RxDBBranchSwitchTakeoverContext,
  TransactionExecutor
} from '@aiao/rxdb';
import { declareTrustedWrite, TrustedWriteIntent, uuid } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { isCommitCapabilityEnabled } from '../commit/commit-capability.js';
import {
  appendBranchMaterializationPage,
  beginBranchMaterializationStage,
  BranchNotMaterializedError,
  classifyBranchMaterialization,
  commitBranchMaterialization,
  findResumableMaterializationAttempt,
  sealBranchMaterializationStage,
  type BranchMaterializationPage,
  type BranchMaterializationPagePayload
} from './branch-materialization.js';
import { readActiveBranchToken } from './capture-runtime.js';
import { assertSwitchBranchPreconditions } from './switch-branch-options.js';
import type { ActiveBranchToken } from './write-entry.js';

/**
 * 一次物化的意图：拉到哪为止、拉哪些东西。
 *
 * @remarks
 * 两格都是**冻结值**，由来源方在开拉之前一次性定下（FR-049）。不冻的话，分页中途远端又来了
 * 新数据，第 1 页与第 9 页属于两个不同的时刻——拼出来的基线是一份从未在远端存在过的状态。
 *
 * 它同时是**续用判据**：崩了重来时，意图逐字相同的那份 staging 才接得上
 * （见 {@link findResumableMaterializationAttempt}）。
 */
export interface BranchMaterializationIntent {
  /** 本次冻结的终止水位；形状由来源方定，本包只做键序无关的比对 */
  readonly frozenRemoteWatermark: Record<string, unknown>;

  /** 本次要物化的完整 sync scope */
  readonly syncScope: readonly string[];
}

/** 向来源方要页时交代的三件事。 */
export interface BranchMaterializationPageRequest {
  /** 要物化的目标分支 id */
  readonly targetBranchId: string;

  /** 本次冻结下来的意图；续用一份旧 staging 时，它与那一行上冻结的逐字相同 */
  readonly intent: BranchMaterializationIntent;

  /**
   * 从第几页开始给；续用时不是 0
   *
   * @remarks
   * 这一格是「可续拉」的全部：不给的话，续用只能从头拉一遍，而崩在第 900 页的那次尝试
   * 留下的 900 页会被原样重写——留得住也就没有意义了。
   */
  readonly fromPageIndex: number;
}

/** 把一页写进投影时交给来源方的现场。 */
export interface BranchMaterializationApplyContext {
  /** 正在物化的目标分支 id */
  readonly targetBranchId: string;

  /** 这一页；`pageIndex` 是它落库时拿到的页序 */
  readonly page: BranchMaterializationPage;

  /**
   * 屏障那笔事务的执行器；**必须用它写**
   *
   * @remarks
   * 自己开事务的实现写下的那一页，会在屏障后续任何一步失败时留在库里——用户看见的是
   * 一半目标分支的数据，而 active 还停在来源分支上。
   */
  readonly executor: TransactionExecutor;
}

/**
 * 远端快照来源：本包与业务数据之间的唯一接缝。
 *
 * @remarks
 * 三个成员对应流水线上三个本包答不出来的问题：**拉到哪为止**（意图从远端的游标来）、
 * **内容是什么**（分页协议是同步层的事）、**一页怎么落地**（业务实体本包不认识）。
 * 除此之外的一切——页序、指纹复核、续用判定、屏障那九件事——都在本包里，来源方碰不到。
 *
 * 由 {@link WorkingTreeManager.registerMaterializationSource} 登记，一条连接**至多一个**：
 * 两个来源意味着同一条分支可以被两份互不相识的快照各物化一次，而第二次看到的现场
 * 已经是第一次的结果。
 */
export interface BranchMaterializationSource {
  /**
   * 冻结这次物化的意图。
   *
   * @param targetBranchId - 要物化的目标分支 id
   * @returns 见 {@link BranchMaterializationIntent}
   *
   * @remarks
   * 跑在**任何事务之外**：它要问远端，而网络 I/O 握着写事务不放会把整个库锁到超时。
   */
  freezeIntent(targetBranchId: string): Promise<BranchMaterializationIntent>;

  /**
   * 按页交出这份快照。
   *
   * @param request - 见 {@link BranchMaterializationPageRequest}
   * @returns 从 `fromPageIndex` 那一页起的异步序列；给完即止
   *
   * @remarks
   * 做成 `AsyncIterable` 而不是「一次给一个数组」：整份快照可能是几十万行，一次性驻留内存
   * 与 FR-044 的分页落库互相抵消。做成异步而不是同步序列：每一页背后是一次请求。
   *
   * **每一页由本包各自开一笔事务落库**，所以序列在第 N 页上抛出时，前 N 页已经在库里了
   * ——下一次切换会接着第 N 页拉。
   */
  pages(request: BranchMaterializationPageRequest): AsyncIterable<BranchMaterializationPagePayload>;

  /**
   * 把一页快照写进投影。
   *
   * @param context - 见 {@link BranchMaterializationApplyContext}
   *
   * @remarks
   * 跑在**屏障那笔事务**里，按页序逐页调，且排在建 baseline / 建 ref 之前——一条
   * 「已经有根」的分支不该在物化中途对外可见。
   *
   * 经执行器做的普通写**不产生**工作树单元：屏障整笔自报 `branch_materialization`（登记表 #10）。
   * 这张票只罩得住普通写——在同一个执行器上调受信写原语（`mergeChanges` 等）的实现
   * 要自己声明并登记，否则按未知入口被拒。
   */
  applyPage(context: BranchMaterializationApplyContext): Promise<void>;
}

/** 这条连接还没登记 {@link BranchMaterializationSource} 时，`switchBranch()` 拿到的东西。 */
const rejectWithoutSource = (targetBranchId: string): never => {
  throw new BranchNotMaterializedError(
    targetBranchId,
    null,
    'source_unavailable',
    '这条分支本地只有 metadata，切过去要先把远端快照物化成本地历史，' +
      '而这条连接没有登记 BranchMaterializationSource——' +
      '调一次 rxdb.workingTree.registerMaterializationSource(source) 再试。'
  );
};

/** 开拉之前那笔只读事务的结论。 */
type MaterializationPrelude =
  /** 这次切换与本条路径无关：库未启用能力，或目标本来就已物化 */
  | { readonly kind: 'skip' }
  /** 要物化；带上进入时捕获的 active token 与已经确认存在的那个来源 */
  | {
      readonly kind: 'materialize';
      readonly activeToken: ActiveBranchToken;
      readonly source: BranchMaterializationSource;
    };

/**
 * 开拉之前的那一笔只读事务：四件事一次问完。
 *
 * @remarks
 * 合在**一笔**事务里而不是各问各的：四个判据之间的每一条缝都是一个别人可以改变现场的窗口，
 * 而这次物化随后要拿着其中的 `activeToken` 一路走到屏障。分开问的话，读到的那条 active
 * 可能已经不是过前置条件时的那条了。
 *
 * 只读——**一行都不写**。切换事务里那句 `advanceActivationRevision()` 在这条路径上没有对应物：
 * 代际由屏障末尾的 `bumpActivationRevision()` CAS 推进，那才是这次切换真正发生的时刻
 * （见 {@link commitBranchMaterialization}）。在这里先推一次的话，屏障手上的 token 当场作废。
 */
const readPrelude = async (
  executor: TransactionExecutor,
  context: RxDBBranchSwitchTakeoverContext,
  source: BranchMaterializationSource | null
): Promise<MaterializationPrelude> => {
  // 未启用的库整套语义都是短路的（FR-037/046）：它没有 ref 行、没有 staging 表上的行，
  // 这条路径对它无从谈起。照常走普通切换。
  if (!(await isCommitCapabilityEnabled(executor))) return { kind: 'skip' };
  // 判物化状态**先于**判有没有来源：目标本来就已物化时，没登记来源是完全正常的，
  // 反过来先判来源会让每一个没装同步层的库连普通切换都做不了。
  const state = await classifyBranchMaterialization(executor, context.targetBranchId);
  if (state.kind !== 'metadata_only') return { kind: 'skip' };
  if (!source) return rejectWithoutSource(context.targetBranchId);
  // 前置条件在这里过，而不是留给普通路径：这次切换从此不再经过 `prepareBranchSwitch`，
  // 漏掉这一句的话 `requireClean` / `expectedActivationRevision` 在物化路径上会静默失效。
  await assertSwitchBranchPreconditions(executor, context.preconditions);
  return { kind: 'materialize', activeToken: await readActiveBranchToken(executor), source };
};

/** 一次开拉前定下的落脚点：用哪条 attempt、从第几页接、还要不要封口。 */
interface StagingCursor {
  readonly attemptId: string;
  readonly fromPageIndex: number;
  readonly sealed: boolean;
}

/**
 * 续用一份意图相同的旧 staging，没有就开一份新的。
 *
 * @remarks
 * 续用与新开两条支线共用**同一笔**事务：查与开之间的缝里，另一条连接可以开出第二份意图相同的 staging，
 * 于是两份各拉一半、哪一份都封不了口。
 */
const openStaging = async (
  rxdb: RxDB,
  executor: TransactionExecutor,
  targetBranchId: string,
  intent: BranchMaterializationIntent
): Promise<StagingCursor> => {
  const resumable = await findResumableMaterializationAttempt(executor, {
    targetBranchId,
    frozenRemoteWatermark: intent.frozenRemoteWatermark,
    syncScope: intent.syncScope
  });
  if (resumable) {
    return { attemptId: resumable.attemptId, fromPageIndex: resumable.nextPageIndex, sealed: resumable.sealed };
  }
  const attemptId = uuid();
  await beginBranchMaterializationStage(rxdb.entityManager, executor, {
    attemptId,
    targetBranchId,
    frozenRemoteWatermark: intent.frozenRemoteWatermark,
    syncScope: intent.syncScope
  });
  return { attemptId, fromPageIndex: 0, sealed: false };
};

/**
 * 逐页落库；**每页各一笔事务**。
 *
 * @returns 落完之后的下一个页号
 *
 * @remarks
 * 页号由这里发放并自增，而不是让 `appendBranchMaterializationPage` 自己去数库里有几页：
 * 自己数的话两次并发追加会算出同一个页号，而这一趟本来就知道自己发到哪了。
 *
 * 循环体里**不吞异常**。第 N 页失败就地抛出，前 N 页留在库里等下一次接着拉——把它 catch 住
 * 继续拉下一页，留下的就是一份页号带洞的 staging，而洞要到封口那一刻才被发现。
 */
const appendPages = async (
  rxdb: RxDB,
  adapter: LocalRxDBAdapter,
  attempt: { readonly attemptId: string; readonly targetBranchId: string },
  fromPageIndex: number,
  pages: AsyncIterable<BranchMaterializationPagePayload>
): Promise<number> => {
  let pageIndex = fromPageIndex;
  for await (const page of pages) {
    const at = pageIndex;
    await adapter.transaction(executor =>
      appendBranchMaterializationPage(rxdb.entityManager, executor, {
        attemptId: attempt.attemptId,
        targetBranchId: attempt.targetBranchId,
        pageIndex: at,
        page
      })
    );
    pageIndex += 1;
  }
  return pageIndex;
};

/**
 * 接管一次切到 metadata-only 分支的切换（FR-044/049）。
 *
 * @param rxdb - 宿主实例
 * @param source - 本连接登记的快照来源；没登记就是 `null`
 * @param context - 核心交下来的切换现场
 * @returns `'switched'` 表示 active 已经切过去了；`'not_applicable'` 表示照常走普通切换
 * @throws {@link BranchNotMaterializedError} 目标要物化、而本连接没有来源，或依据不足时
 * @throws {@link StaleActiveBranchError} 拉页期间别的连接切过分支时（屏障的 CAS 落空）
 *
 * @remarks
 * 六段各自的事务边界见本文件的 @fileoverview。三处**故意**没做的事：
 *
 * - **失败时不清 staging**。那半份 payload 连同它的 `scopeManifest` 正是诊断「上一次为什么
 *   没接上」需要的东西，也是下一次续拉的起点。清理是 FR-044 单列的一条能力
 *   （`discardMaterializationAttempt()`），是调用方的决定，不是失败的副作用。
 * - **不重试**。哪一种失败该重试只有调用方答得出：`stage_tampered` 要整份丢掉重拉，
 *   `StaleActiveBranchError` 要先弄清另一条连接为什么切了分支，而网络失败重试几次是同步层的口径。
 * - **不推进 activation revision**。这条路径上切 active 的是屏障末尾的 CAS，
 *   而不是 `prepareBranchSwitch` 里那句 `advanceActivationRevision()`。
 */
export const takeOverBranchSwitchWithMaterialization = async (
  rxdb: RxDB,
  source: BranchMaterializationSource | null,
  context: RxDBBranchSwitchTakeoverContext
): Promise<RxDBBranchSwitchTakeover> => {
  const adapter = await firstValueFrom(rxdb.localAdapter$);
  const prelude = await adapter.transaction(executor => readPrelude(executor, context, source));
  if (prelude.kind === 'skip') return 'not_applicable';

  const targetBranchId = context.targetBranchId;
  // 拿 prelude 里那个来源，而不是入参上的：两者是同一个对象，但只有前者带着
  // 「readPrelude 已经确认它不是 null」这个事实，于是这里不需要第二次判空。
  const confirmed = prelude.source;
  // 事务之外：这一步要问远端。
  const intent = await confirmed.freezeIntent(targetBranchId);
  const cursor = await adapter.transaction(executor => openStaging(rxdb, executor, targetBranchId, intent));

  if (!cursor.sealed) {
    await appendPages(
      rxdb,
      adapter,
      { attemptId: cursor.attemptId, targetBranchId },
      cursor.fromPageIndex,
      confirmed.pages({ targetBranchId, intent, fromPageIndex: cursor.fromPageIndex })
    );
    await adapter.transaction(executor =>
      sealBranchMaterializationStage(executor, { attemptId: cursor.attemptId, targetBranchId })
    );
  }

  await adapter.transaction(async executor => {
    await commitBranchMaterialization(rxdb.entityManager, executor, {
      attemptId: cursor.attemptId,
      targetBranchId,
      expectedActiveBranch: prelude.activeToken,
      frozenRemoteWatermark: intent.frozenRemoteWatermark,
      syncScope: intent.syncScope,
      applyPage: (page, executor) => confirmed.applyPage({ targetBranchId, page, executor })
    });
    // applyPage 写的是目标分支的**投影**，不是用户的编辑——与 `VersionManager.switchBranch()` 那次
    // 物化（登记表 #1）同一个意图。不声明的话，挂载点 1 在事务体返回后按 `crud` 捕获，
    // 切一次分支就把整份快照记成一批未提交变更。
    // 声明放在屏障**之后**而不是开头：挂载点 2 取声明时先问执行器，开头那张票会被 applyPage 里
    // 嵌套的 `executor.mergeChanges()` 先取走——那次嵌套写被当成物化放行，屏障自己反倒落回 `crud`。
    // 放在之后，嵌套原语没带自己的声明就当场被拒（fail-closed）。
    declareTrustedWrite(executor, {
      file: 'materialize-branch.ts',
      symbol: 'takeOverBranchSwitchWithMaterialization',
      intent: TrustedWriteIntent.branch_materialization
    });
  });
  return 'switched';
};
