/**
 * @fileoverview 插件对**系统层**的贡献：系统实体、初始行、系统迁移与能力认领。
 *
 * @remarks
 * 普通插件只加行为，装不装都不改变库的物理形态。系统贡献不一样——它往库里加表、加初始行、
 * 加迁移水位，于是「装过它的库」和「没装过它的库」在磁盘上就不是同一种东西了。
 * 这类改动必须由宿主统一编排，因为它们全都要赶在**建表那一刻**之前就位。
 *
 * **贡献是声明式的，不经 `install()`。** 这不是风格选择，是时序上的互斥：声明了
 * `inject: ['adapter:local']` 的插件必然跑在 `createTables()` 之后（`RxDB.connect()` 里
 * 适配器就绪置位排在 `#await_plugin_installs` 之前，而前者正是 `adapter:local` 的就绪判据），
 * 而系统表要跟着那一次 `createTables()` 一起建出来。走 `install()` 的贡献永远赶不上自己的表。
 * 所以宿主直接从插件对象上**读** {@link RxDBSystemContribution}，读的时点在 `use()` 里，
 * 早于一切适配器动作。
 *
 * 契约挂在 {@link IRxDBPlugin.system} 上而不另开一个接口：插件本来就要实现 `IRxDBPlugin`，
 * 再分一个接口只会让「两个都实现了吗」从编译期问题变成运行期问题。
 */

import type { EntityManager } from './entity/entity-manager.js';
import type { EntityType } from './entity/entity.interface.js';
import type { RxDBAdapterLocalBase } from './rxdb-adapter.js';
import type { MigrationType } from './rxdb.interface.js';
import type { TransactionExecutor } from './transaction/transaction-executor.interface.js';

/**
 * 建表时点可用的上下文
 *
 * @remarks
 * 只暴露建表那一刻**确实已经存在**的事实。今天只有主分支的 id——新库建表时库里除了它
 * 什么都没有（见 `RxDB.connect()` 的新库分支）。贡献方要更多上下文时在这里加字段，
 * 而不是自己去读库：那时候表还没建出来。
 */
export interface RxDBSystemBootstrapContext {
  /** 建表时一并写入的分支 id；新库上恰好一个（`'main'`） */
  readonly branchIds: readonly string[];
}

/**
 * 既有库引导跑完、连接交还给调用方之前的上下文
 *
 * @remarks
 * 只带适配器一件东西，因为贡献方在这个时点**已经能拿到别的一切**：它握着造它的那个 `RxDB`
 * 实例，`entityManager` / `config` 都是公开成员。适配器拿不到——它是本次 `connect()` 现场
 * 解析出来的那一个实例，而同一个库可以有多个适配器，问 `RxDB` 要会问出另一个。
 */
export interface RxDBSystemActivationContext {
  /** 本次引导的本地适配器；已建表、已迁移、已 `completeBootstrap()` */
  readonly adapter: RxDBAdapterLocalBase;
}

/**
 * 新建一条分支时，贡献方写自己那几行所需的上下文
 *
 * @remarks
 * `executor` 是**调用方的**事务执行器，不是新开的一个。贡献方必须用它：分支行与贡献行
 * 分处两个事务的话，中间失败留下的是一条「分支在、贡献行不在」的记录，而这种半条分支
 * 与一条正常的老分支在形状上分辨不出来。
 */
export interface RxDBBranchCreationContext {
  /** 正在写这条分支的事务执行器 */
  readonly executor: TransactionExecutor;

  /** 刚写进去的分支 id */
  readonly branchId: string;
}

/**
 * 插件对系统层的贡献
 *
 * @remarks
 * 五个注册点缺一不可，各自防一种不会编译报错的事故：
 *
 * - {@link RxDBSystemContribution.entities} 漏接 → 表建不出来，首次用到时抛一条读不出主语的错；
 * - {@link RxDBSystemContribution.createInitialRows} 没进同一次 `createTables()` → 新库第一次
 *   启动就缺行，而缺行的表看起来跟正常的空表一模一样；
 * - {@link RxDBSystemContribution.createMigrations} 只接了既有库那一半 → 新库下次启动重跑
 *   `up()` 撞主键（见 `system/migrations/index.ts`：新库**不跑**这条链，链里的名字由
 *   `createMigrationWatermarks()` 直接写成已执行水位）;
 * - {@link RxDBSystemContribution.bootstrapExisting} 漏接 → 既有库连上了，能力却没在这条连接上
 *   接通，此后每一次写都绕开本能力，**一条错误都不会有**；
 * - {@link RxDBSystemContribution.writeBranchRows} 漏接 → 新分支缺贡献行，而缺行的分支与
 *   一条正常分支在形状上分辨不出来，要到下一次按 id 取那几行时才炸。
 *
 * 五个都是**必填**，没有一个带 `?`。没有可写之物的贡献方写一个空实现——那是一句
 * 「我确实不需要」的明示，而 `?` 让「不需要」与「忘了」变成同一种东西。
 *
 * {@link RxDBSystemContribution.capability} 与 {@link RxDBSystemContribution.packageSpecifier}
 * 则是给「未认领能力守卫」用的：宿主把它们写成一条能力水位行，此后任何**没装这个插件**的
 * 客户端打开该库都会被挡住并拿到该装的包名。
 */
export interface RxDBSystemContribution {
  /**
   * 能力名，与 {@link IRxDBPlugin.name} 同值
   *
   * @remarks
   * 水位行按它归因，因此**不得含 `:`**——行名是 `:` 分隔的，含冒号的能力名会让守卫把它切碎。
   */
  readonly capability: Uncapitalize<string>;

  /**
   * 能力版本，正整数
   *
   * @remarks
   * 写进水位行，但**核心不比对它**：能不能读旧版的表只有插件自己知道，核心插一脚的话，
   * 插件每加一版都要等核心跟着放行。核心只回答「有没有人认领这个能力」。
   */
  readonly version: number;

  /** 包说明符，如 `@aiao/rxdb-plugin-working-tree`；未认领时原样报给用户 */
  readonly packageSpecifier: string;

  /** 贡献的系统实体，顺序即建表顺序 */
  readonly entities: readonly EntityType[];

  /**
   * 新库建表时随表一次写入的初始行
   *
   * @param entityManager - 用来 `instantiate()` 行对象
   * @param context - 建表时点已经存在的事实
   * @returns 与 {@link RxDBSystemContribution.entities} 同批写入的行；没有初始行时返回空数组
   */
  createInitialRows(
    entityManager: EntityManager,
    context: RxDBSystemBootstrapContext
  ): readonly InstanceType<EntityType>[];

  /**
   * 既有库要跑的迁移
   *
   * @param entityManager - 迁移用来 `instantiate()` 行对象
   * @returns 迁移列表；新库由 `createMigrationWatermarks()` 直接写成已执行水位，不执行 `up()`
   */
  createMigrations(entityManager: EntityManager): MigrationType[];

  /**
   * 既有库引导末尾，把本能力接到这条连接上
   *
   * @param context - 已建表、已迁移、已 `completeBootstrap()` 的本地适配器
   * @returns 接通完成；没有连接期动作的贡献方返回一个已决 promise
   *
   * @remarks
   * **只在既有库上调，新库一次都不调。** 这不是优化，是语义本身：新库的全部贡献行都是
   * 同一次 `createTables()` 刚由本进程写下的，它们的取值由 {@link RxDBSystemContribution.createInitialRows}
   * 当场决定——「读回来看看是什么状态」在那里问的是自己一行之前写了什么。既有库不一样，
   * 它的状态是**别人**留下的，只有读了才知道。
   *
   * 新库还多一条硬约束：那次建表是一次原子提交，在它之外再开一个事务会把「表与初始行同批」
   * 这条不变量破掉。
   *
   * 调用点排在 `reconcileEntityIndexes()` 之后、适配器就绪置位**之前**。这个位置不可改：
   * 就绪置位同时是 `adapter:local` 的判据，声明了该依赖的插件在它之后才会被安装——把本钩子
   * 挪到那之后，就会出现一个「别的插件已经在写、本能力还没接通」的窗口，而那批写入不留痕迹。
   */
  bootstrapExisting(context: RxDBSystemActivationContext): Promise<void>;

  /**
   * 每新建一条分支时，在**调用方的事务里**写下本能力的那几行
   *
   * @param entityManager - 用来 `instantiate()` 行对象
   * @param context - 调用方的事务执行器与刚写下的分支 id
   * @returns 写入完成；没有分支级行的贡献方返回一个已决 promise
   *
   * @remarks
   * 与 {@link RxDBSystemContribution.createInitialRows} 的差别是**时点**，不是内容：那个是
   * 每个库一次（建表那一刻），这个是每条分支一次（含建库时那条 `main`——但 `main` 走的是
   * `createInitialRows`，因为那时事务还没开给任何人）。
   *
   * 名字不叫 `onBranchCreated`：`on*` 读起来像一个可以订阅、可以失败、可以稍后补上的监听器，
   * 而这里的行**必须与分支行同生共死**。抛错就让整条 `create_branch` 事务回滚，这是对的。
   */
  writeBranchRows(entityManager: EntityManager, context: RxDBBranchCreationContext): Promise<void>;
}

/**
 * 校验贡献的形状
 *
 * @param contribution - 待注册的贡献
 * @param pluginName - 报错里用来归因的插件名
 * @throws {@link Error} 能力名为空或含 `:`，或版本不是正整数，或包说明符为空
 *
 * @remarks
 * 这三条都不是类型能挡住的：`Uncapitalize<string>` 允许空串也允许含 `:`，`number` 允许 `1.5`
 * 和 `NaN`。而它们全都只在**水位行被读回来**的时候才暴露——那通常是在另一台机器、另一个进程里，
 * 离出错的那行代码已经很远了。在注册这一刻破，报错才指得回该改的地方。
 */
export function assertValidSystemContribution(contribution: RxDBSystemContribution, pluginName: string): void {
  const { capability, version, packageSpecifier } = contribution;
  if (!capability || capability.includes(':')) {
    throw new Error(
      `[RxDB] 插件 "${pluginName}" 的系统贡献 capability 非法：必须非空且不含 ":"（当前 "${capability}"）`
    );
  }
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`[RxDB] 插件 "${pluginName}" 的系统贡献 version 非法：必须是正整数（当前 ${String(version)}）`);
  }
  if (!packageSpecifier) {
    throw new Error(`[RxDB] 插件 "${pluginName}" 的系统贡献缺少 packageSpecifier：未认领能力守卫要靠它报出该装的包`);
  }
}
