/**
 * @fileoverview `RxDB.workingTree` 入口与它的能力门禁（契约见 contracts/core-api.md §1/§2）。
 *
 * @remarks
 * 这里只有两件事：**入口恒存在**，以及**未启用即拒绝**。工作树的实际语义
 * （`status()` / `diff()` / `commit()` / `discard()` / `listCommits()` / `restore()`）由后续阶段挂上来，
 * 它们一律经 {@link WorkingTreeManager.runEnabled} 进入，不自己开事务、不自己读能力行。
 *
 * 入口做成可选属性（`workingTree?: WorkingTreeManager`）省事得多，代价是全部调用点
 * 长出 `?.`，而 `database.workingTree?.commit(msg)` 在未启用的库上**静默求值为
 * `undefined`**——用户点了提交、什么也没发生、也没有错误。契约 §1 要的是相反的
 * 东西：入口恒在，调用即拒。同理，未启用时返回空结果（`entryCount: 0`）也不行：
 * 那是把「这个库没开这功能」伪装成「这个库没有未提交变更」。FR-046 的「零行为差异」
 * 说的是**不调用它就什么都没发生**，不是调用了要假装成功。
 */

import type { LocalRxDBAdapter, RxDB, TransactionExecutor } from '@aiao/rxdb';
import { RxDBChange, RxDBError } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { WORKING_TREE_CAPABILITY } from '../capability-identity.js';
import type { CommitCapabilityInfo } from '../commit/commit-capability.js';
import {
  assertSupportedCommitCapability,
  enableCommitCapability,
  isCommitCapabilityEnabled,
  readCommitCapability
} from '../commit/commit-capability.js';
import { readCommitChangeSetPage, type CommitChangeSetPage } from '../commit/commit-changes.js';
import { createCommitWriteContext } from '../commit/commit-context.js';
import { CommitErrorCode } from '../commit/commit-error-codes.js';
import { latchBranchCorruption } from '../commit/commit-graph-guard.js';
import { readCommitLogPage, type CommitLogOptions, type CommitLogPage } from '../commit/commit-log.js';
import { ENABLE_MIGRATION_OPERATION_ID, runEnableMigration } from '../commit/enable-migration.js';
import { installWorkingTreeCapture } from './capture-install.js';
import { readActiveBranchToken } from './capture-runtime.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from './commit-command.js';
import { readWorkingTreeDiff, type WorkingTreeDiff, type WorkingTreeDiffOptions } from './diff.js';
import {
  discardWorkingTree,
  type WorkingTreeDiscardOptions,
  type WorkingTreeDiscardResult
} from './discard-command.js';
import {
  readActiveRestoreSession,
  restoreWorkingTree,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult,
  type WorkingTreeRestoreSessionInfo,
  type WorkingTreeRestoreTarget
} from './restore-command.js';
import { readWorkingTreeStatus, type WorkingTreeStatus } from './status.js';

/**
 * 在未启用提交能力的数据库上调用了受管成员。
 *
 * @remarks
 * 判别位给了两个：`name` 供本进程内 `instanceof` 之外的兜底判断，`code` 供跨 realm
 * 场景（日志、上报、三框架绑定的错误分支）。只给 `name` 的话，跨 realm 的一端只能
 * 匹配错误文案；只给 `code` 的话，本进程内每次判断都得先 import 一个常量模块。
 *
 * 与「版本不兼容」（{@link assertSupportedCommitCapability} 抛的
 * `UnsupportedRxDBSystemVersionError`）是两件事：这里说的是**还没启用**，
 * 出路是调用 {@link WorkingTreeManager.enable}；那边说的是**启用了但号对不上**，
 * 出路是升客户端或跑迁移。
 */
export class WorkingTreeCapabilityDisabledError extends RxDBError {
  /** epic-006 指定的稳定错误码，取自 {@link CommitErrorCode} */
  readonly code = CommitErrorCode.commit_capability_disabled;

  /**
   * 由 `WorkingTreeManager` 受管成员统一走的那道门禁（`runEnabled()`）构造，不收参数。
   *
   * @remarks
   * 不带「你调的是哪个成员」：出路对每个受管成员都是同一件事——先 `enable()`，
   * 带上成员名只会让同一个失败长出十份文案，而定位所需的调用点本就在堆栈里。
   * 判别位统一由 `name` 与 `code` 承担（见类注释）。
   */
  constructor() {
    super(
      '这个数据库尚未启用提交能力：除 isEnabled() / enable() / enableIfEmpty() 之外的 workingTree 成员都不可用。' +
        '先调用 database.workingTree.enable()，或让应用在启动时用 enableIfEmpty() 空库自动启用。'
    );
    this.name = 'WorkingTreeCapabilityDisabledError';
    Object.setPrototypeOf(this, WorkingTreeCapabilityDisabledError.prototype);
  }
}

/**
 * {@link WorkingTreeManager.enableIfEmpty} 的三种结局。
 *
 * @remarks
 * 做成判别联合而不是 `{ enabled: boolean; … }`：三种结局各有各的载荷——`enabled` 与
 * `already_enabled` 带能力信息，`not_empty` 什么都没有。拍平成一个对象就要给「没发生的
 * 那次启用」编造一份能力信息（或可空字段），调用方被迫处理四种组合，其中两种是假的。
 */
export type WorkingTreeEnableIfEmptyResult =
  | {
      /** 判别位：本次调用完成了启用 */
      readonly kind: 'enabled';
      /** 启用后的能力信息 */
      readonly capability: CommitCapabilityInfo;
    }
  | {
      /** 判别位：库本来就已启用，本次调用什么都没改 */
      readonly kind: 'already_enabled';
      /** 现状的能力信息 */
      readonly capability: CommitCapabilityInfo;
    }
  | {
      /** 判别位：库里已有内容，按规则不自动启用；手动 `enable()` 仍可用 */
      readonly kind: 'not_empty';
    };

/**
 * 工作树与提交历史的入口（契约见 contracts/core-api.md §1）。
 *
 * @remarks
 * 实例在 `use(rxDBPluginWorkingTree)` 的那一刻建好（插件构造器里），与库是否启用提交能力
 * 无关——「有没有这个入口」是**进程内库版本**的属性，「能不能用」才是**这个数据库**的属性。
 * 两者混在一起的话，同一份代码在两个库上会长出不同的对象形状。
 *
 * 抽包之后这条分工反而更硬：入口的存在与否变成「装没装 `@aiao/rxdb-plugin-working-tree`」，
 * 仍是构建期属性，而没装该包时 `database.workingTree` 是**编译错误**而不是静默 `undefined`。
 * 挂载因此必须留在插件构造器里，不能挪进 `install()`——后者跑在 `init()` 内部，会把入口
 * 变成连接纪元的函数。
 */
export class WorkingTreeManager {
  readonly #rxdb: RxDB;

  /**
   * 由插件构造器调用，一个 RxDB 实例一个。
   *
   * @param rxdb - 宿主实例；整个门面只持有它这一个引用
   *
   * @remarks
   * 持整个 RxDB 而不是在这里就取出本地适配器：受管成员每次调用都要**当场**重新解析
   * （`#runInTransaction` 每次都走一遍 `localAdapter$`），因为 `enable()` 与重连都会换掉
   * 适配器实例。构造那一刻取一次存下来，等于把门面钉死在第一个连接纪元上，
   * 症状是重连之后所有命令仍然写向已经废弃的那个适配器。
   */
  constructor(rxdb: RxDB) {
    this.#rxdb = rxdb;
  }

  /**
   * 这个数据库启用提交能力了吗。
   *
   * @returns 已启用返回 `true`
   *
   * @remarks
   * 与 {@link enable} / {@link enableIfEmpty} 同为未启用库上仅有的三个可用成员，因此**不经**
   * {@link runEnabled}——经了就成了「只有启用的库才能查自己启没启用」。
   */
  async isEnabled(): Promise<boolean> {
    return this.#runInTransaction(executor => isCommitCapabilityEnabled(executor));
  }

  /**
   * 启用这个数据库的提交能力（幂等）。
   *
   * @returns 启用后的能力状态
   * @throws {@link BranchNotMaterializableError} 任一本地分支沿 `rxdb_change` 链物化不了时
   *
   * @remarks
   * 「启用」是两件事，而且**必须在同一个事务里**：翻能力位，以及给每条本地分支补上根节点
   * （FR-021/049）。拆成两个事务的话，中间崩一次就停在「已启用、但分支没有根」——此后每次
   * `commit()` 都往一个无根分支上挂节点，而库自称一切正常。迁移抛错时整笔回滚，能力位一并
   * 退回未启用，于是重试面对的还是同一个起点。
   *
   * **迁移每次都跑，不是只跑在 CAS 命中的那一次。** 能力位的 CAS 只在 `false → true` 那一次
   * 命中（幂等与并发仲裁都由它负责），但 `enable()` 的语义是「把库收敛到已启用该有的形状」，
   * 而不是「翻一次位」：库启用之后才出现的本地分支——旧版本客户端建的、或上一次因某条分支
   * 损坏而整体回滚的——只能靠再调一次 `enable()` 补根。真跑过一遍之后重复调用是幂等的，
   * 全部分支都落进 `alreadyInitializedBranchIds`，一条语句都不发。
   *
   * **捕获运行时装在事务提交之后。** 装在事务里的话，捕获会立刻开始拦截这同一个事务余下的
   * 写——而 `runEnableMigration()` 往分支上补的根节点正是在那里面写的，于是「启用」这件事
   * 自己会被记成一批未提交变更。装在提交之后，本进程从下一次写开始捕获；这一笔启用本身
   * 属于 HEAD，不属于工作树。
   *
   * 迁移抛错时整笔回滚、能力位退回未启用，此时 `transaction()` 直接向上抛，装载那一行
   * 走不到——不会留下「没启用却在捕获」的形状。
   */
  async enable(): Promise<CommitCapabilityInfo> {
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    const info = await adapter.transaction(async executor => {
      const enabled = await enableCommitCapability(executor);
      await runEnableMigration(executor, createCommitWriteContext(adapter), {
        operationId: ENABLE_MIGRATION_OPERATION_ID
      });
      return enabled;
    });
    installWorkingTreeCapture(this.#rxdb, adapter);
    // 同源的其他连接此刻还停在「连接期读到的未启用」上，它们的每一次写都绕开捕获且不留痕迹
    // （FR-037）。这一句是它们唯一的通知来源。**无条件发**，包括幂等重调的那一次：
    // `enable()` 是用户显式发起的、稀少的动作，而重发一次正好是「让所有连接重新对齐」的手动杠杆。
    this.#rxdb.broadcastCapabilityEnabled(WORKING_TREE_CAPABILITY);
    return info;
  }

  /**
   * 库为空时自动启用，已有内容时一行不写（应用启动时的自动初始化入口）。
   *
   * @returns 见 {@link WorkingTreeEnableIfEmptyResult}
   * @throws {@link BranchNotMaterializableError} 任一本地分支沿 `rxdb_change` 链物化不了时
   *   （只发生在「空」判定通过、启用迁移开跑之后，与 {@link enable} 同形）
   *
   * @remarks
   * **「空」的判据是 `rxdb_change` 行数为零。** 本地每一次实体写入都会追加一条变更
   * （undo/redo 的数据源），sync pull 走 disableTriggers 不产生行；行数为零 ⟺ 这个库
   * 从来没有过用户内容。判据不用用户实体行数：插件不认识应用注册的实体清单，按实体
   * 逐张表数一遍等于把「什么是内容」摊给每个调用方。
   *
   * **判空、翻能力位、补 baseline 在同一个事务里。** 拆开的话，判空之后、启用之前有别的
   * writer 落进第一批内容，自动启用就会把一份刚出现的用户数据折进 baseline——而这条规则
   * 的全部意义就是「有内容时不替用户做这个决定」。
   *
   * **三种结局分工明确。** `already_enabled` 原样报告、不跑启用迁移：把库收敛到已启用
   * 该有的形状是 {@link enable} 的语义（它的 TSDoc 承诺重复调用补根），这里只回答
   * 「要不要启用」；`not_empty` 返回时能力位仍是关的，手动 `enable()` 面对的是同一个起点。
   * 捕获运行时在两个启用结局之后照常装载，与 `enable()` 重复调用的幂等行为一致；
   * `not_empty` 不装——本进程尚未启用，装了等于在未启用的库上开始捕获。
   *
   * **能力行缺失照常抛**（`readCommitCapability` 自己抛），不按「未启用且空」继续：
   * 那是 `0004` 迁移没跑完的损坏现场，自动启用会把损坏掩埋成一次正常启动。
   */
  async enableIfEmpty(): Promise<WorkingTreeEnableIfEmptyResult> {
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    const result = await adapter.transaction(async executor => {
      const current = await readCommitCapability(executor);
      if (current.enabled) return { kind: 'already_enabled', capability: current } as const;
      const changeCount = await executor.getRepository(RxDBChange).count({ where: { combinator: 'and', rules: [] } });
      if (changeCount > 0) return { kind: 'not_empty' } as const;
      const capability = await enableCommitCapability(executor);
      await runEnableMigration(executor, createCommitWriteContext(adapter), {
        operationId: ENABLE_MIGRATION_OPERATION_ID
      });
      return { kind: 'enabled', capability } as const;
    });
    if (result.kind !== 'not_empty') installWorkingTreeCapture(this.#rxdb, adapter);
    // 只有**这一次调用真的翻了能力位**才广播。`already_enabled` 不发：自动启用是应用每次
    // 启动都会走的入口，在那一支上广播等于每开一次应用就往频道里丢一条谁都不需要的通知
    // ——那时能力早已是开的，后连上的实例在 `bootstrapExisting()` 里自己就读到了。
    if (result.kind === 'enabled') this.#rxdb.broadcastCapabilityEnabled(WORKING_TREE_CAPABILITY);
    return result;
  }

  /**
   * 当前分支的工作树摘要（FR-004）。
   *
   * @returns 见 {@link WorkingTreeStatus}
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   *
   * @remarks
   * **零参**：摘要问的是「当前分支现在怎么样」，而「当前分支」由 active 分支唯一确定
   * （FR-048）。开一个 `branchId` 入参等于允许调用方问别的分支，而那条分支的
   * `workingTreeRevision` 拿回去既不能提交也不能丢弃——三个捕获位只对 active 分支有效。
   */
  async status(): Promise<WorkingTreeStatus> {
    return this.runEnabled(executor => readWorkingTreeStatus(executor));
  }

  /**
   * 当前分支相对 HEAD 的未提交改动（FR-005）。
   *
   * @param options - 粒度、实体过滤与分页；全部可选
   * @returns 见 {@link WorkingTreeDiff}
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   *
   * @remarks
   * **只有一条 diff 轴：`HEAD ↔ 工作树`**（硬裁决 2）。没有 `from` / `to` / `ref` 入参——
   * 那三个形参属于「比任意两个 ref」的模型，而 v1 没有 index，第二条轴无从谈起。
   *
   * 与 {@link status} 同样**不收 `branchId`**：读别的分支的未提交改动，拿回去既不能提交
   * 也不能丢弃，三个捕获位只对 active 分支有效（FR-048）。
   */
  async diff(options: WorkingTreeDiffOptions = {}): Promise<WorkingTreeDiff> {
    return this.runEnabled(async executor => {
      const token = await readActiveBranchToken(executor);
      return readWorkingTreeDiff(executor, token.branchId, options);
    });
  }

  /**
   * 把当前分支工作树里的**全部**未提交单元提交进历史（FR-041）。
   *
   * @param message - 提交消息
   * @param options - 见 {@link CommitOptions}；三个捕获位与作者、操作 id 全部必填
   * @returns 见 {@link CommitResult}；CAS 落败时是 `ok: false` 的**返回值**，不是异常
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏（FR-051）
   * @throws {@link CommitValidationError} 消息为空、或工作树是干净的（`empty_commit`）
   *
   * @remarks
   * **恰好两个位置参数**：没有 selection 入参（硬裁决 1），也没有可选的第三参。
   * 写 commit 与清空工作树在**同一个事务**里（FR-011、SC-007），而那个事务由
   * {@link runEnabled} 开——命令体自己不开事务，否则门禁读到的启用态与写入就分属两笔。
   */
  async commit(message: string, options: CommitOptions): Promise<CommitResult> {
    return this.runEnabled((executor, adapter) =>
      commitWorkingTree(executor, createCommitWriteContext(adapter), message, options)
    );
  }

  /**
   * 把当前分支的工作树整体退回当前 HEAD（FR-016）。
   *
   * @param options - 见 {@link WorkingTreeDiscardOptions}；三个捕获位必填
   * @returns 见 {@link WorkingTreeDiscardResult}；干净工作树上是 `discardedCount: 0` 的 no-op
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏（FR-051）
   *
   * @remarks
   * **恰好一个必填位置参数。** 做成可选的话，「缺省时由本次调用内部读取 revision」就成了
   * 合法用法——内部读到的恒等于当前值，CAS 永远命中，FR-031 对 discard 的那半句当场失效。
   *
   * 参数本身**不在这里校验**：未启用的库该听到的是「去 enable()」，而不是
   * 「expectedBranch 不能为空」——后者在这个库上根本无从谈起。
   */
  async discard(options: WorkingTreeDiscardOptions): Promise<WorkingTreeDiscardResult> {
    return this.runEnabled(executor => discardWorkingTree(executor, options));
  }

  /**
   * 当前分支从 HEAD 沿完整父链可达的提交历史（FR-012）。
   *
   * @param options - 条数上限、时间窗与实体过滤；全部可选
   * @returns 见 {@link CommitLogPage}；一次都没提交过的库是 `entries` 为空的一页
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   * @throws {@link RxDBError} 当前分支的 ref 行缺失时（`0004` 没跑完，不是空历史）
   *
   * @remarks
   * 与 {@link status} / {@link diff} 同样**不收 `branchId`**：读的恒为当前 active 分支
   * （FR-048）。别的分支的历史拿回去，既不能在它上面提交也不能丢弃，而「当前在哪条分支」
   * 由 active 分支唯一确定——开一个入参等于允许调用方问一个它无法作用于的对象。
   *
   * 历史 ≠ `rxdb_commit` 全表：CAS 丢掉的提交与被删分支留下的节点，行都还在，但没有任何
   * ref 指向它们。可达性遍历在 `commit/list-commits.ts`，翻译成公开条目在
   * `commit/commit-log.ts`。
   */
  async listCommits(options: CommitLogOptions = {}): Promise<CommitLogPage> {
    return this.runEnabled(async executor => {
      const token = await readActiveBranchToken(executor);
      return readCommitLogPage(executor, token.branchId, options);
    });
  }

  /**
   * 读一个 commit 的全部变更单元（FR-012 的明细侧）。
   *
   * @param commitId - 要读的 commit id
   * @returns 见 {@link CommitChangeSetPage}；基线节点是没有变更单元的**返回值**，不是异常
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   * @throws {@link RxDBError} 这个 commit 不存在时
   *
   * @remarks
   * 与 {@link listCommits} 的可达性口径不同：这里按 id 直读不可变快照行，不做可达性遍历。
   * 调用方点的是它刚在可达历史里看到的节点；而一个悬挂 commit 的快照行读出来也是它写入
   * 时的真实内容，不是编造的——「这个 commit 在不在当前分支的历史里」由列表侧回答，
   * 明细侧只回答「它写了什么」。
   */
  async commitChanges(commitId: string): Promise<CommitChangeSetPage> {
    return this.runEnabled(async (executor, adapter) =>
      readCommitChangeSetPage(executor, createCommitWriteContext(adapter).codec, commitId)
    );
  }

  /**
   * 把一个可达历史 commit 的内容作为新的未提交变更写回当前工作树（FR-013）。
   *
   * @param target - 见 {@link WorkingTreeRestoreTarget}；`entities` 缺省即整个 commit
   * @param options - 见 {@link WorkingTreeRestoreOptions}；三个捕获位必填
   * @returns 见 {@link WorkingTreeRestoreResult}；不可达 / 脏工作树 / 不兼容都是 `ok: false` 的**返回值**
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   * @throws {@link CommitGraphCorruptedError} 当前分支的提交图已损坏（FR-051）
   *
   * @remarks
   * **恰好两个必填位置参数**，与 {@link commit} 同形。`options` 做成可选的话，「缺省时由本次调用
   * 内部读 revision」就成了合法用法，而内部读到的恒等于当前值、CAS 永远命中——FR-034 对 restore
   * 的那半句当场失效。
   *
   * **没有 `checkout()`，也没有游离 HEAD**（硬裁决 5）：这个成员是「把历史内容搬进工作树」，
   * 不是「把 HEAD 挪过去」。恢复完的工作树是脏的，下一步是 `commit()` 或 `discard()`，与手写变更
   * 走同一条路（FR-015）。
   */
  async restore(
    target: WorkingTreeRestoreTarget,
    options: WorkingTreeRestoreOptions
  ): Promise<WorkingTreeRestoreResult> {
    return this.runEnabled((executor, adapter) =>
      restoreWorkingTree(executor, createCommitWriteContext(adapter), target, options)
    );
  }

  /**
   * 当前分支那个尚未结束的恢复会话（contracts/core-api.md §5）。
   *
   * @returns 见 {@link WorkingTreeRestoreSessionInfo}；没有未结束会话时为 `null`
   * @throws {@link WorkingTreeCapabilityDisabledError} 这个库还没启用提交能力
   *
   * @remarks
   * 与 {@link status} / {@link listCommits} 一样**不收 `branchId`**：会话恒属当前 active 分支
   * （FR-048）。别的分支上的恢复会话拿回来，既不能在它上面提交也不能丢弃。
   *
   * 「还成不成立」不在这里回答：那是 `status()` 的 `restoring` / `conflicted` 两位，判定只有那一份。
   * 这个成员只回答「有没有、来自哪个 commit」。
   */
  async restoreSession(): Promise<WorkingTreeRestoreSessionInfo | null> {
    return this.runEnabled(async executor => {
      const token = await readActiveBranchToken(executor);
      return readActiveRestoreSession(executor, token.branchId);
    });
  }

  /**
   * 受管成员的**唯一**入口：开写事务、过能力门禁、再跑命令体。
   *
   * @param run - 命令体；拿到的执行器与门禁读能力行用的是同一个，第二参是本纪元的本地适配器
   * @returns 命令体的返回值
   * @throws {@link WorkingTreeCapabilityDisabledError} 未启用时
   * @throws {@link RxDBError} 能力行缺失时（`0004` 迁移没写入那一行）
   * @throws {@link UnsupportedRxDBSystemVersionError} 能力版本三元组与本进程不符时
   *
   * @remarks
   * 四步顺序都是有理由的：
   *
   * 1. **先开事务**。门禁读到的启用态与命令体的写入必须同进同出，否则两者之间隔着
   *    一个别人可以 `disable` 的窗口（v1 还没有 disable，但这个窗口不该靠「暂时没人
   *    能用它」来关闭）。
   * 2. **读能力行**，行缺失时让 `readCommitCapability()` 自己抛。缺行是「表建了但没有
   *    那一行」的损坏现场，不是关闭状态；按关闭处理等于让用户以为点一下 `enable()`
   *    就好了，而那条 CAS 会打在一张空表上、命中 0 行。
   * 3. **未启用先于版本比对**。一个还没启用的库，最该听到的是「去 enable()」，
   *    而不是「你的 codec 版本是 1、本进程要 2」——后者对它毫无可操作性。
   * 4. **版本比对复用 `assertSupportedCommitCapability()`**，不在这里另写一遍比较。
   *    两份比较逻辑迟早会在某次 bump 时分岔，而 fail-closed 恰恰依赖它们一致。
   * 5. **提交之后补一次捕获自愈**（`#healCapture()`，理由见它自己的 @remarks）。
   *    它排在事务**外面**，与 `enable()` 里那一句同理由：装在事务里的话，
   *    捕获会开始拦截这同一笔事务余下的写。
   * 6. **回滚之后补一次损坏闩**（`latchBranchCorruption()`）。`commit()` / `restore()` /
   *    `discard()` 三条路径都在这笔事务里跑 `assertCommitGraphIntact()`，而命中损坏的那一笔
   *    注定回滚——标记写在里面等于写完就没。于是三条路径各自去 catch 一次？那三份 catch
   *    会在下一条受管成员加进来时漏掉第四份。放在唯一入口上，新成员**天然**带着这条闩。
   *
   * 那个 catch 只补一件事就把原错**原样**抛回去：它不认识的错误一个字都不改（`latchBranchCorruption`
   * 自己判类型），也绝不让落标记这一步的失败顶替掉手上那个真正的错误。
   *
   * 不再经 `#runInTransaction()`，虽然前三行与它逐字相同：自愈要拿到**这一笔事务用的那个**
   * 适配器，而那个方法只交出命令体的返回值。再走一次 `localAdapter$` 可能取到另一个纪元的
   * 实例——给那一个装钩子，本纪元照旧不捕获。
   *
   * 受管成员的**参数校验必须写在 `run` 里面**：写在调用 `runEnabled()` 之前的话，
   * 未启用的库会先回答「message 不能为空」——一个在这个库上根本无从谈起的问题。
   *
   * **适配器作为第二参交下去，而不是让命令体自己再解析一次。** 需要它的是提交写路径的
   * at-rest 判定槽位（`createCommitWriteContext()`，FR-038）；命令体自己走
   * `rxdb.localAdapterSync` 会在未连接的库上直接抛，而再走一次 `localAdapter$` 则可能取到
   * **另一个纪元**的实例——那个实例的判定器与本事务写的是两个库。只多写一个形参：
   * 少写形参的回调在 TS 里仍然可赋值，不需要它的成员一个字都不用改。
   */
  protected async runEnabled<T>(
    run: (executor: TransactionExecutor, adapter: LocalRxDBAdapter) => Promise<T>
  ): Promise<T> {
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    const result = await this.#runEnabledOnce(adapter, run);
    // 事务已提交，这里才自愈——理由与 `enable()` 那一句完全相同：装在事务里的话，
    // 捕获会立刻开始拦截这同一个事务余下的写。
    this.#healCapture(adapter);
    return result;
  }

  /**
   * 把「能力已启用、这条连接却没有捕获」这个状态修回去。
   *
   * @param adapter - 本纪元的本地适配器；调用方已经确认能力位是开的
   *
   * @remarks
   * **这是自愈，不是修复。** 它只让**今后**的写留下痕迹；此前那些绕开捕获的写不会被追认，
   * 它们已经落进业务表、而工作树里没有对应单元，从这里看不出来也补不回来。
   *
   * 跑这一句的前提由调用方给：{@link runEnabled} 的门禁刚刚在**同一笔事务**里读到
   * `enabled === true`。生产代码里没有任何一处卸载钩子（`setWorkingTreeCaptureHook` 的全部
   * 调用都是装），所以「过了门禁却没有钩子」不存在良性解释，只有一种成因——本连接漏掉了
   * 那条启用通知。
   *
   * 于是它补的正是 {@link RxDB.broadcastCapabilityEnabled} 够不着的那些 realm：跨进程
   * （Electron 主/渲染、Tauri、Node 多进程）与 `multiInstance: false` 的实例。它们收不到
   * BroadcastChannel，但只要调一次工作树 API 就会经过这里。
   *
   * 补不上的仍然记在 `specs/001-working-tree-commits/threat-model.md` §6：一条从不调用工作树
   * API、只顾着写业务表的跨进程连接，这条路也够不着它。
   *
   * 判 `workingTreeCaptureHook` 再装而不是无条件装：{@link installWorkingTreeCapture} 本身是幂等的
   * （先卸后装），但无条件调会让**每一次** `status()` 都换掉一个还在服役的运行时实例，
   * 而换掉的那一刻恰好有别的事务正握着旧实例的话，那笔事务余下的写会记在一个已经被丢弃的
   * 运行时上。
   */
  #healCapture(adapter: LocalRxDBAdapter): void {
    if (adapter.workingTreeCaptureHook) return;
    installWorkingTreeCapture(this.#rxdb, adapter);
  }

  /**
   * 开那笔受管事务；回滚时把损坏闩补上，再把原错原样抛回去。
   *
   * @param adapter - 调用方已经解析好的本纪元适配器；闩要落在**同一个**实例上
   * @param run - 命令体
   * @returns 命令体的返回值
   *
   * @remarks
   * 拆出来只为一件事：{@link runEnabled} 的 `#healCapture()` 必须在**成功**路径上跑，
   * 而这里的 catch 在**失败**路径上跑。写成一个 `try/catch/finally` 的话，自愈会跟着
   * 命中损坏的那一次一起跑——那一次的事务已经回滚，自愈装上的钩子却留了下来，
   * 时点从「提交之后」漂成了「无论提交与否」。
   */
  async #runEnabledOnce<T>(
    adapter: LocalRxDBAdapter,
    run: (executor: TransactionExecutor, adapter: LocalRxDBAdapter) => Promise<T>
  ): Promise<T> {
    try {
      return await adapter.transaction(async executor => {
        const info = await readCommitCapability(executor);
        if (!info.enabled) throw new WorkingTreeCapabilityDisabledError();
        assertSupportedCommitCapability(info);
        return run(executor, adapter);
      });
    } catch (error) {
      await latchBranchCorruption(adapter, error);
      throw error;
    }
  }

  /** 取本地适配器并开一个写事务；适配器一并交给命令体，理由见 {@link runEnabled}。 */
  async #runInTransaction<T>(
    run: (executor: TransactionExecutor, adapter: LocalRxDBAdapter) => Promise<T>
  ): Promise<T> {
    const adapter = await firstValueFrom(this.#rxdb.localAdapter$);
    return adapter.transaction(async executor => run(executor, adapter));
  }
}
