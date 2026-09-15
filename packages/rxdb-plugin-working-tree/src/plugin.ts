/**
 * @fileoverview `@aiao/rxdb-plugin-working-tree` 的装配入口。
 *
 * @remarks
 * 插件本身只做两件事，其余全部语义在 `working-tree/` 与 `commit/` 两个目录里：
 *
 * 1. **挂入口**：`use()` 的那一刻把 {@link WorkingTreeManager} 定义成 `rxdb.workingTree`。
 * 2. **声明系统贡献**：10 张系统表、新库的初始行、既有库的引导迁移、既有库连接时的接通，
 *    以及每条新分支的贡献行，一次性交给宿主按 {@link RxDBSystemContribution} 编排。
 *
 * `install()` 是空的，这是结论不是遗漏——理由见该方法。
 */

import {
  RxDBPluginBase,
  assertSingleActiveBranch,
  type EntityType,
  type IRxDBPlugin,
  type Plugin,
  type RxDB,
  type RxDBSystemContribution
} from '@aiao/rxdb';
import { PACKAGE_SPECIFIER, WORKING_TREE_CAPABILITY } from './capability-identity.js';
import { createBranchCommitRows } from './commit/branch-commit-rows.js';
import { CommitBranchRef } from './commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from './commit/commit-capability-state.entity.js';
import { isCommitCapabilityEnabled } from './commit/commit-capability.js';
import { CommitChangeSet } from './commit/commit-change-set.entity.js';
import { Commit } from './commit/commit.entity.js';
import {
  createWorkingTreeCommitsInitialRows,
  createWorkingTreeCommitsMigration
} from './migrations/0004-working-tree-commits.js';
import { allocateBranchGeneration } from './working-tree/activation-state.js';
import { installWorkingTreeCapture } from './working-tree/capture-install.js';
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
 * 本插件贡献的 10 张系统表，顺序即建表顺序。
 *
 * @remarks
 * 顺序照 `data-model.md` §1 的 1→10 抄，与一致性套件里那份手写清单
 * （`working-tree/testing/capture.suite.ts` 的 `EPIC_006_SYSTEM_ENTITIES`）逐项一致。
 * 那份清单故意**不**从这里算差集：新增一张表必须先让它编译失败，逐条过一遍 §1.5 的三条断言。
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
  WorkingTreeMaterializationPage
];

/**
 * 造出本插件的系统层贡献。
 *
 * @param rxdb - 宿主实例；只有 `bootstrapExisting()` 用得到（装捕获要读它的实体登记）
 * @returns 交给宿主在建表那一刻编排的声明
 *
 * @remarks
 * 抽成模块级工厂而不是写成类字段的字面量：五个注册点各自带着一段「漏了会怎样」的理由，
 * 塞进类体会让插件类的形状被一段六十行的初始化器盖住，而那个类真正要说的只有
 * 「入口挂在构造器、`install()` 是空的」两句。
 */
const createSystemContribution = (rxdb: RxDB): RxDBSystemContribution => ({
  capability: WORKING_TREE_CAPABILITY,
  version: WORKING_TREE_CAPABILITY_VERSION,
  packageSpecifier: PACKAGE_SPECIFIER,
  entities: WORKING_TREE_SYSTEM_ENTITIES,
  createInitialRows: (entityManager, context) => createWorkingTreeCommitsInitialRows(entityManager, context.branchIds),
  createMigrations: entityManager => [createWorkingTreeCommitsMigration(entityManager)],
  bootstrapExisting: async ({ adapter }) => {
    // 一次读、两个用途：能力位与 active 分支基数校验（FR-048）合进同一个引导事务。
    // 分成两次读的话，两次之间隔着一个别的进程可以把能力位翻掉的窗口，于是可能
    // 「按未启用跳过校验、却按已启用装上捕获」。
    //
    // 走 bootstrapTransaction 而不是 transaction：整条引导链路都用前者，换成后者就得依赖
    // 「completeBootstrap() 确实已经把就绪门打开了」这个跨行推理。transactionLog 传 false ——
    // 这里一行都不写。
    const enabled = await adapter.bootstrapTransaction(async executor => {
      // 基数校验**以能力已启用为前提**：未启用的库整套提交/工作树语义都是短路的（FR-037），
      // 拿一个它还没进入的不变量把它挡在连接之外，等于让升级本身变成一次破坏性变更。
      const capabilityEnabled = await isCommitCapabilityEnabled(executor);
      // 校验排在装捕获**之前**：捕获一旦装上，这次事务就多绕一层转发——它一行都不写，
      // 绕一层只是白费，出错时还多一层要排除的嫌疑。
      if (capabilityEnabled) await assertSingleActiveBranch(executor);
      return capabilityEnabled;
    }, false);
    // 未启用的库上一次都不装，于是四个写原语连一层转发都没有——FR-046 要求的「零行为差异」
    // 在这种形状下是结构性的，不依赖运行时每次写都去问一句能力位。
    if (!enabled) return;
    installWorkingTreeCapture(rxdb, adapter);
  },
  writeBranchRows: async (entityManager, { executor, branchId }) => {
    // 代际从单调源发放，不是「当前分支数 + 1」：删过分支之后后者会复用旧号，
    // 持旧 `(branchId, headRevision)` 的调用方就会误中同名重建的新分支（ABA）。
    const generation = await allocateBranchGeneration(executor);
    await executor.saveMany(createBranchCommitRows(entityManager, branchId, generation));
  }
});

/**
 * 把工作树与提交历史装到单个 RxDB 实例上的插件生命周期对象。
 *
 * @remarks
 * 与 `@aiao/rxdb-plugin-storage` 那类插件的形状差别，全部来自**时点**：storage 的服务是连接期
 * 资源（它握着 OPFS 句柄），所以三件事都登记在作用域里、断连时逆序退回；本插件挂的入口是
 * 进程内库版本的属性，贡献的表要赶在建表那一刻之前就位——两者都早于 `install()`，也都没有
 * 对称的拆卸义务。
 */
export class RxDBPluginWorkingTree extends RxDBPluginBase implements IRxDBPlugin {
  /** 已迁移到作用域拆卸，宿主不再调用 `destroy()`。 */
  readonly lifecycle = 'scoped' as const;

  /** RxDB 插件唯一名称。 */
  readonly name = WORKING_TREE_CAPABILITY;

  /** 系统层贡献；宿主在 `use()` 里**同步读**这个字段，见 {@link RxDBSystemContribution}。 */
  readonly system: RxDBSystemContribution = createSystemContribution(this.rxdb);

  /**
   * 建插件对象，并把 `rxdb.workingTree` 挂上去。
   *
   * @param rxdb - 宿主实例
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
  constructor(rxdb: RxDB) {
    super(rxdb);
    if (Object.prototype.hasOwnProperty.call(rxdb, 'workingTree')) return;
    Object.defineProperty(rxdb, 'workingTree', {
      value: new WorkingTreeManager(rxdb),
      enumerable: false,
      configurable: false,
      writable: false
    });
  }

  /**
   * 什么都不登记。
   *
   * @remarks
   * 空实现是结论不是遗漏：该做的三件事各有自己的时点，没有一件落在 `install()` 上。
   *
   * - `rxdb.workingTree` 在**构造时**挂上（见构造器），必须早于 `init()`；
   * - 10 张表、初始行与引导迁移经 {@link RxDBPluginWorkingTree.system} 声明，由宿主在建表
   *   那一刻编排——走 `install()` 的贡献永远赶不上自己的表（见 {@link RxDBSystemContribution}）；
   * - 捕获运行时挂在**适配器实例**上，由 `bootstrapExisting()` 与 {@link WorkingTreeManager.enable}
   *   装载；`connect()` / `disconnect()` 换实例时钩子随旧实例一起走，没有要撤销的登记。
   *
   * 形参一个都不收（而不是收一个不用的 `scope`）：收下它读起来就像「这里本该登记点什么」。
   * 仍然声明 `lifecycle = 'scoped'`，它表示的是「不要调 `destroy()`」，与登记了几条无关。
   */
  install(): void {
    // 故意什么都不做，理由见上方 @remarks。
  }
}

/** RxDB 工作树插件工厂。 */
export const rxDBPluginWorkingTree: Plugin = (db: RxDB) => new RxDBPluginWorkingTree(db);

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
