/**
 * @fileoverview `@aiao/rxdb-plugin-working-tree` 的装配入口。
 *
 * @remarks
 * 插件本身只做三件事，其余全部语义在 `working-tree/` 与 `commit/` 两个目录里：
 *
 * 1. **挂入口**：`use()` 的那一刻把 {@link WorkingTreeManager} 定义成 `rxdb.workingTree`。
 * 2. **声明系统贡献**：12 张系统表、新库的初始行、既有库的引导迁移、既有库连接时的接通，
 *    以及每条新分支的贡献行，一次性交给宿主按 {@link RxDBSystemContribution} 编排。
 *
 * 3. **接住别人的启用**：`install()` 里登记一个 `CAPABILITY_ENABLED` 监听器（FR-037），
 *    把「另一条连接刚启用了本能力」变成本连接上的一次接通。
 */

import {
  CAPABILITY_ENABLED_EVENT,
  RxDBPluginBase,
  assertSingleActiveBranch,
  type CapabilityEnabledEvent,
  type EntityType,
  type IRxDBPlugin,
  type Plugin,
  type RxDB,
  type RxDBSystemContribution
} from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { filter } from 'rxjs';
import { PACKAGE_SPECIFIER, WORKING_TREE_CAPABILITY } from './capability-identity.js';
import type { RxDBPluginWorkingTreeOptions } from './checkout/worktree-options.js';
import { findReclaimCandidates, hasOrphanedWorktree } from './checkout/worktree-startup-reclaim.js';
import { recordCheckoutBranch } from './checkout/worktree-writable.js';
import { Worktree } from './checkout/worktree.entity.js';
import { removeBranchCommitRows, writeNewBranchCommitRows } from './commit/branch-commit-rows.js';
import { CommitBranchRef } from './commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from './commit/commit-capability-state.entity.js';
import { isCommitCapabilityEnabled } from './commit/commit-capability.js';
import { CommitChangeSet } from './commit/commit-change-set.entity.js';
import { CommitForkPoint } from './commit/commit-fork-point.entity.js';
import { latchBranchCorruption } from './commit/commit-graph-guard.js';
import { Commit } from './commit/commit.entity.js';
import {
  createWorkingTreeCommitsInitialRows,
  createWorkingTreeCommitsMigration
} from './migrations/0004-working-tree-commits.js';
import { advanceActivationRevision } from './working-tree/activation-cas.js';
import { installWorkingTreeCapture } from './working-tree/capture-install.js';
import { takeOverBranchSwitchWithMaterialization } from './working-tree/materialize-branch.js';
import { assertSwitchBranchPreconditions, assertSwitchTargetIntact } from './working-tree/switch-branch-options.js';
import { WorkingTreeActivationState } from './working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from './working-tree/working-tree-entry.entity.js';
import { WorkingTreeManager } from './working-tree/working-tree-facade.js';
import { WorkingTreeMaterializationPage } from './working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from './working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from './working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from './working-tree/working-tree-state.entity.js';

/**
 * 本能力写进水位行的版本号
 *
 * @remarks
 * 与 `COMMIT_PROTOCOL_VERSION` / `COMMIT_GRAPH_SCHEMA_VERSION` 是**三根不同的轴**，不要合并。
 * 那两个描述「提交图的内容怎么编码」，由 `assertSupportedCommitCapability()` 在能力行上逐字段
 * 严格比对；这一个只描述「这个库被哪一版的本插件动过」，核心拿它写水位行、并**不比对**
 * （见 {@link RxDBSystemContribution.version}）。
 *
 * 合成一根轴的代价很具体：提交图编码改一版，水位行名（`__rxdb_capability__:workingTree:N:…`）
 * 就跟着改，而改名等于既有库上那条认领**不再匹配**——守卫会把一批装着插件的库判成未认领。
 */
export const WORKING_TREE_CAPABILITY_VERSION = 1;

/**
 * 本插件贡献的 12 张系统表，顺序即建表顺序。
 *
 * @remarks
 * 前 10 张照 `data-model.md` §1 的 1→10 抄，第 11 张是只读检出位的登记表（US-313），第 12 张是提交的分叉点（US-314）。
 * 与一致性套件里那份手写清单
 * （`working-tree/testing/capture.suite.ts` 的 `EPIC_006_SYSTEM_ENTITIES`）逐项一致。
 * 那份清单故意**不**从这里算差集：新增一张表必须先让它编译失败，逐条过一遍 §1.5 的三条断言。
 *
 * 既有库上不需要迁移：连接时核心补建缺的贡献表。
 */
const WORKING_TREE_SYSTEM_ENTITIES: readonly EntityType[] = [
  CommitCapabilityState,
  WorkingTreeActivationState,
  Commit,
  CommitChangeSet,
  CommitBranchRef,
  WorkingTreeState,
  WorkingTreeEntry,
  WorkingTreeRestoreSession,
  WorkingTreeMaterializationStage,
  WorkingTreeMaterializationPage,
  Worktree,
  CommitForkPoint
];

/** 连接期的启动清理判定要回给插件实例的两件事（只读检出位，US-313）。 */
interface StartupReclaimHooks {
  /** 装插件时给了 `worktrees`；没给就连登记表都不读 */
  readonly configured: () => boolean;
  /** 这次连接之后要不要在后台回收一次；每次既有库的连接都覆盖上一次的结论 */
  readonly decide: (reclaim: boolean) => void;
}

/**
 * 造出本插件的系统层贡献。
 *
 * @param rxdb - 宿主实例；只有 `bootstrapExisting()` 用得到（装捕获要读它的实体登记）
 * @param startup - 启动清理判定的回写口
 * @returns 交给宿主在建表那一刻编排的声明
 *
 * @remarks
 * 抽成模块级工厂而不是写成类字段的字面量：八个注册点各自带着一段「漏了会怎样」的理由，
 * 塞进类体会让插件类的形状被一段一百行的初始化器盖住，而那个类真正要说的只有
 * 「入口挂在构造器、`install()` 是空的」两句。
 *
 * 注册点里有两个**在这一刻读不到自己要的东西**：`takeOverBranchSwitch` 要的分支物化来源
 * 由同步插件在每个连接纪元的 `install()` 里才登记进 `rxdb.branchMaterializationSource()`，
 * 而 `rxdb.workingTree` 本身要等插件构造器的函数体（本工厂跑在字段初始化器里，早于它）。
 * 两处都写成**调用时**才去取——取一次存下来的话，前者永远是 `undefined`（重连后更是旧纪元的
 * 那一个），后者当场 `undefined`。
 */
const createSystemContribution = (rxdb: RxDB, startup: StartupReclaimHooks): RxDBSystemContribution => ({
  capability: WORKING_TREE_CAPABILITY,
  version: WORKING_TREE_CAPABILITY_VERSION,
  packageSpecifier: PACKAGE_SPECIFIER,
  entities: WORKING_TREE_SYSTEM_ENTITIES,
  createInitialRows: (entityManager, context) => createWorkingTreeCommitsInitialRows(entityManager, context.branchIds),
  createMigrations: entityManager => [createWorkingTreeCommitsMigration(entityManager)],
  bootstrapExisting: async ({ adapter }) => {
    // 一次读、三个用途：能力位、active 分支基数校验（FR-048）与启动清理的判定合进同一个引导事务。
    // 前两者分成两次读的话，两次之间隔着一个别的进程可以把能力位翻掉的窗口，于是可能
    // 「按未启用跳过校验、却按已启用装上捕获」。
    //
    // 走 bootstrapTransaction 而不是 transaction：整条引导链路都用前者，换成后者就得依赖
    // 「completeBootstrap() 确实已经把就绪门打开了」这个跨行推理。transactionLog 传 false ——
    // 这里一行都不写。
    const { enabled, reclaimCandidates } = await adapter.bootstrapTransaction(async executor => {
      // 基数校验**以能力已启用为前提**：未启用的库整套提交/工作树语义都是短路的（FR-037），
      // 拿一个它还没进入的不变量把它挡在连接之外，等于让升级本身变成一次破坏性变更。
      const capabilityEnabled = await isCommitCapabilityEnabled(executor);
      // 校验排在装捕获**之前**：捕获一旦装上，这次事务就多绕一层转发——它一行都不写，
      // 绕一层只是白费，出错时还多一层要排除的嫌疑。
      if (capabilityEnabled) await assertSingleActiveBranch(executor);
      // 启动清理的判定也在这一笔里读：连上之后再开一笔事务去看，正赶上别的连接拿系统迁移锁时它就连不上，
      // 见 `worktree-startup-reclaim.ts`。未启用的库上 checkouts 整体不可用，不读。没配快照库也要读：
      // 可写检出位（US-314）的表在主库里，不靠快照库就收得了，只读检出位那时不算
      const candidates = capabilityEnabled ? await findReclaimCandidates(executor, startup.configured()) : [];
      return { enabled: capabilityEnabled, reclaimCandidates: candidates };
    }, false);
    // 未启用的库上一次都不装，于是四个写原语连一层转发都没有——FR-046 要求的「零行为差异」
    // 在这种形状下是结构性的，不依赖运行时每次写都去问一句能力位。
    if (enabled) installWorkingTreeCapture(rxdb, adapter);
    startup.decide(await hasOrphanedWorktree(rxdb.config.dbName, reclaimCandidates));
  },
  prepareBranchSwitch: async ({ executor, targetBranchId, preconditions }) => {
    // 未启用的库整套语义都是短路的（FR-037/046）：它没有 ref 行、没有工作树状态行，
    // 拿一个它还没进入的不变量把切换挡下来，等于让启用能力本身变成一次破坏性变更。
    if (!(await isCommitCapabilityEnabled(executor))) return;
    // 损坏优先于调用方提出的条件（与 `commit()` 里「损坏优先于 CAS」同一条次序）：
    // 反过来的话，一次 CAS 失败会把「这条分支的历史已经重放不出来」盖住，
    // 而用户会照着 CAS 的建议动作重试——重试多少次都不会成功。
    await assertSwitchTargetIntact(executor, targetBranchId);
    await assertSwitchBranchPreconditions(executor, preconditions);
    // 两道校验都过了，这次切换从此刻起必然发生——推进激活代际就落在这里。
    // 它跑在**切换事务内部**，所以不是 CAS：仲裁由这个独占事务本身做掉了
    // （见 `activation-cas.ts` › advanceActivationRevision）。
    // 漏掉这一步的代价是 `main → feature → main` 走完之后代际原地不动，
    // 于是走之前捕获的 token 在走回来之后仍然验得过——三位并发仲裁里的第一位变成常数。
    // 推进的是本实例挂的那套表的那一行：可写检出位里切分支不动主检出位的凭据（US-314 B2.2）。
    await advanceActivationRevision(executor);
    // 可写检出位里切分支：登记行的分支跟着走，与切换一起提交、一起回滚
    if (!executor.tableSet.isMain) await recordCheckoutBranch(executor, executor.tableSet, targetBranchId);
  },
  takeOverBranchSwitch: context =>
    // 接管判据整个在 `materialize-branch.ts`：它要连着开五六笔事务、中间夹着网络 I/O，
    // 而这里手上一个执行器都没有——这正是本钩子与 `prepareBranchSwitch` 分开的理由
    // （见 {@link RxDBBranchSwitchTakeoverContext}）。
    //
    // 来源由它自己**每次现取**（`rxdb.getBranchMaterializationSource()`）：同步插件按连接纪元
    // 登记与撤销，而本工厂跑在插件的字段初始化器里，比第一次登记早得多。
    takeOverBranchSwitchWithMaterialization(rxdb, context),
  settleBranchSwitchFailure: async ({ error }) => {
    // 只认损坏这一种，其余原样放过——判类型的是 `latchBranchCorruption` 自己。
    //
    // 取 `localAdapterIfConnected` 而不是 `await firstValueFrom(localAdapter$)`：后者在
    // 断连期间**永远不决**，而本函数跑在 `catch` 里、紧接着要把原始错误重新抛出去。
    // 挂在这里等于把一次失败的切换变成一个永不返回的 promise。
    const adapter = rxdb.localAdapterIfConnected;
    if (!adapter) return;
    await latchBranchCorruption(adapter, error);
  },
  writeBranchRows: (entityManager, { executor, branchId, fromCommitId }) =>
    // 「这两行里装的是什么」全在 `branch-commit-rows.ts`：共享源分支 HEAD、复制一份独立工作树，
    // 还是给历史分叉点写一个 `branch_baseline` 锚点，判据是库里那两个值（FR-017）；
    // 点名了源提交（从提交建分支，US-314）就让 HEAD 指向它，仍以库里的分叉点核对。
    writeNewBranchCommitRows(executor, entityManager, branchId, fromCommitId),
  removeBranchRows: ({ executor, branchId }) =>
    // 建行与删行同住一个模块：「一条分支在本能力里占了哪几张表」只有那里知道，
    // 而两半分家的那一天，新加的表会只在其中一半里被记得（FR-044）。
    //
    // **不判能力位。** 这六张表里的行与 `enable()` 无关——ref 与工作树状态行由
    // `createInitialRows` / `writeBranchRows` 无条件写下，未启用的库上照样有。
    // 照着 `prepareBranchSwitch` 抄一句短路进来，残留的就正是那些库上的行。
    removeBranchCommitRows(executor, branchId)
});

/**
 * 把工作树与提交历史装到单个 RxDB 实例上的插件生命周期对象。
 *
 * @remarks
 * 与 `@aiao/rxdb-plugin-storage` 那类插件的形状差别，全部来自**时点**：storage 的服务是连接期
 * 资源（它握着 OPFS 句柄），所以三件事都登记在作用域里、断连时逆序退回；本插件挂的入口是
 * 进程内库版本的属性，贡献的表要赶在建表那一刻之前就位——两者都早于 `install()`，也都没有
 * 对称的拆卸义务。真正落在作用域里的只有那个跨连接的能力启用监听器（见 {@link RxDBPluginWorkingTree.install}）。
 */
export class RxDBPluginWorkingTree extends RxDBPluginBase implements IRxDBPlugin {
  /** 装插件时给了 `worktrees`：连接期要判定有没有只读检出位的孤儿。 */
  readonly #worktreesConfigured: boolean;

  /** 本连接纪元的引导判定有孤儿：连上之后在后台回收一次；回收前就地清掉，一次判定只回收一次。 */
  #reclaimPending = false;

  /** 已迁移到作用域拆卸，宿主不再调用 `destroy()`。 */
  readonly lifecycle = 'scoped' as const;

  /** RxDB 插件唯一名称。 */
  readonly name = WORKING_TREE_CAPABILITY;

  /** 系统层贡献；宿主在 `use()` 里**同步读**这个字段，见 {@link RxDBSystemContribution}。 */
  readonly system: RxDBSystemContribution = createSystemContribution(this.rxdb, {
    configured: () => this.#worktreesConfigured,
    decide: reclaim => {
      this.#reclaimPending = reclaim;
    }
  });

  /**
   * 建插件对象，并把 `rxdb.workingTree` 挂上去。
   *
   * @param rxdb - 宿主实例
   * @param options - 插件选项；`worktrees` 给只读检出位用
   *
   * @remarks
   * 挂载放在**构造器**而不是 `install()`：`use()` 里插件工厂是同步求值的，于是入口从 `use()`
   * 那一刻起就在，早于 `init()` / `connect()`。`install()` 跑在 `init()` 内部，用它挂就会让
   * 「入口存不存在」变成连接纪元的函数——而 contracts/core-api.md §1 要它是**进程内库版本**
   * 的属性。{@link WorkingTreeManager} 自己不持有任何纪元资源（适配器每次调用现取），
   * 所以也没有对称的拆卸义务。
   *
   * `configurable: false` / `writable: false`：`status$()` 一类订阅依赖入口的**稳定身份**，
   * 可重定义的属性允许第二个插件实例在订阅者背后把它换掉。同一实例上已经挂过就直接返回，
   * 谁装的就是谁的——与 storage 插件的 `hasOwnProperty` 守卫同一条理由。
   */
  constructor(rxdb: RxDB, options?: RxDBPluginWorkingTreeOptions) {
    super(rxdb);
    this.#worktreesConfigured = options?.worktrees !== undefined;
    if (Object.prototype.hasOwnProperty.call(rxdb, 'workingTree')) return;
    Object.defineProperty(rxdb, 'workingTree', {
      value: new WorkingTreeManager(rxdb, options?.worktrees),
      enumerable: false,
      configurable: false,
      writable: false
    });
  }

  /**
   * 只登记一件事：跨连接的能力启用通知（FR-037）。
   *
   * @param scope - 本次连接纪元的激活作用域
   *
   * @remarks
   * 另外三件事都**不**在这里，各有自己的时点：
   *
   * - `rxdb.workingTree` 在**构造时**挂上（见构造器），必须早于 `init()`；
   * - 12 张表、初始行与引导迁移经 {@link RxDBPluginWorkingTree.system} 声明，由宿主在建表
   *   那一刻编排——走 `install()` 的贡献永远赶不上自己的表（见 {@link RxDBSystemContribution}）；
   * - 本连接自己的接通由 `bootstrapExisting()`（既有库读能力位）与
   *   {@link WorkingTreeManager.enable}（本连接刚启用）完成。
   *
   * 留给这里的只有第四种排列：**别的连接启用了，而本连接早已连上**。它落在这里而不是
   * `bootstrapExisting()` 里，尽管那边手边就有 adapter——因为那个钩子**只在既有库上调**
   * （见 {@link RxDBSystemContribution.bootstrapExisting} 的 @remarks）。把监听器挂在那里，
   * 建库的那个客户端就一次都收不到，而「A 建库、B 连上、B 启用」正是这条通道最该救的排列。
   *
   * 登记在作用域里而不是裸挂：监听器指着**本纪元**的适配器解析路径，漏摘的话下一纪元会有
   * 两个监听器，各自把钩子往自己那一代上装。
   */
  install(scope: LifecycleScope): void {
    const onCapabilityEnabled = (event: CapabilityEnabledEvent): void => {
      // 本库将来不止一个能力贡献方：不比对能力名的话，别人的启用通知会被当成本能力的接通。
      if (event.capability !== WORKING_TREE_CAPABILITY) return;
      // 走非抛的 localAdapterIfConnected，且**同步**取：
      // `await firstValueFrom(localAdapter$)` 会让出一个微任务，而这条通道存在的全部意义
      // 就是「在下一次写之前装上」——那个缝隙里的写入照样不留痕迹。
      // 断连期间飘到的通知取不到适配器，静默返回：事件什么时候来不由接收方决定。
      const adapter = this.rxdb.localAdapterIfConnected;
      if (!adapter) return;
      // 幂等（`setWorkingTreeCaptureHook` 先卸后装），且能力位是只进不退的闩——
      // 没有与之对称的「收到就拆」，所以装重了也不需要撤销。
      installWorkingTreeCapture(this.rxdb, adapter);
    };

    scope.acquire(() => {
      this.rxdb.addEventListener(CAPABILITY_ENABLED_EVENT, onCapabilityEnabled);
      return () => this.rxdb.removeEventListener(CAPABILITY_ENABLED_EVENT, onCapabilityEnabled);
    }, 'workingTree:capability-enabled');

    // 检出位（US-313 / US-314）：连接期的引导事务判定有孤儿时，连上之后在后台回收一次。
    // 关掉或崩掉的标签页留下的会话归属检出位，丢了持有分支的可写检出位，就靠这一次被收走。
    // 没配快照库也装：可写检出位不需要快照库。
    //
    // 等的是 `adapterConnected$` 而不是 `localAdapter$`：后者在 `init()` 时就发出适配器，那时这条连接的引导判定
    // 还没做；前者在 `bootstrapExisting()` 之后才置位，而且只是通知，不会替应用发起连接。
    //
    // 每次连上都接，不只接第一次：还有别的适配器连着时只断本地再连回来，插件不重装、订阅还是这一个，
    // 引导事务却会重新判定。一次判定只回收一次由 `#reclaimPending` 管，不靠订阅的次数
    const localAdapterName = this.rxdb.config.sync.local?.adapter;
    if (localAdapterName === undefined) return;
    scope.acquire(() => {
      const subscription = this.rxdb
        .adapterConnected$(localAdapterName)
        .pipe(filter(Boolean))
        .subscribe(() => void this.#pruneWorktrees());
      return () => subscription.unsubscribe();
    }, 'workingTree:worktree-prune');
  }

  /**
   * 后台回收一次检出位；引导期没判定出孤儿就什么都不做。
   *
   * @remarks
   * 判定只在既有库的连接期做（`bootstrapExisting()`），新库的登记表是这次建表刚建的，必然没有孤儿。
   * 没有调用方可以把错误交回去，打到控制台：回收失败只是留下几个没删的快照库或影子表，下一个连接纪元会再试。
   */
  async #pruneWorktrees(): Promise<void> {
    if (!this.#reclaimPending) return;
    this.#reclaimPending = false;
    try {
      await this.rxdb.workingTree.checkouts.prune();
    } catch (error) {
      console.error('[rxdb-plugin-working-tree] 回收检出位失败', error);
    }
  }
}

/**
 * RxDB 工作树插件工厂。
 *
 * @example
 * ```ts
 * rxdb.use(rxDBPluginWorkingTree, {
 *   // 只读检出位的快照库：与主库同一种后端，按 db.config.dbName 给每个检出位单独的存储
 *   worktrees: { adapter: db => new RxDBAdapterPGlite(db, { store: 'memory' }) }
 * });
 * ```
 */
export const rxDBPluginWorkingTree: Plugin<RxDBPluginWorkingTreeOptions> = (db, options) =>
  new RxDBPluginWorkingTree(db, options);

declare module '@aiao/rxdb' {
  interface RxDB {
    /**
     * 工作树与提交历史的入口；装了本插件即**恒存在**。
     *
     * @remarks
     * 这里**故意**不标成可选。「有没有这个入口」是进程内库版本的属性——装没装
     * `@aiao/rxdb-plugin-working-tree`，是构建期就定下的；「能不能用」才是这个数据库的属性，
     * 由能力位决定，未启用时以 `commit_capability_disabled` 拒绝。
     *
     * 标可选的代价是全部调用点长出 `?.`，而 `database.workingTree?.commit(msg)` 在未启用的库上
     * **静默求值为 `undefined`**：用户点了提交、什么也没发生、也没有错误。没装本包时该表达式
     * 是编译错误，那才是这个问题该有的形态。
     */
    workingTree: WorkingTreeManager;
  }
}
