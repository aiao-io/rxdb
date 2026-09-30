export class RxDBError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RxDBError';
    Object.setPrototypeOf(this, RxDBError.prototype);
  }
}

/**
 * 部分同步错误 —— 同步在中途失败，但**已经应用的部分不会被撤销**。
 *
 * @typeParam T - 该次同步的结果类型（如 `PullResult`）
 *
 * @remarks
 * pull 按仓库逐个应用变更并逐个推进水位线，中途失败时前面若干仓库已落库、
 * 水位线也已前移。此前这种情况直接上抛原始错误，调用方**无从得知已应用了多少**，
 * 重试会从新水位线继续，中间那段既不重放也不告警。
 *
 * 收到本错误时：
 * - `result` 是失败前已完成部分的真实统计，可直接用于展示/记账；
 * - `cause` 是中断同步的原始错误；
 * - **不要**假设数据回到了同步前的状态。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.syncManager.pull({ fetchAll: true });
 * } catch (error) {
 *   if (error instanceof RxDBPartialSyncError) {
 *     console.warn(`已应用 ${error.result.applied} 条后中断`, error.cause);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class RxDBPartialSyncError<T = unknown> extends RxDBError {
  constructor(
    /** 失败前已完成部分的统计 */
    readonly result: T,
    /** 中断同步的原始错误 */
    override readonly cause: Error
  ) {
    super(`Sync stopped partway: ${cause.message}. Applied work is NOT rolled back; see error.result.`);
    this.name = 'RxDBPartialSyncError';
    Object.setPrototypeOf(this, RxDBPartialSyncError.prototype);
  }
}

/**
 * QueryCache 必需能力缺失 —— 适配器没有提供 QueryCache 同步流程所需的 duck。
 *
 * @remarks
 * 继承 `RxDBAdapterLocalBase` / `RxDBAdapterRemoteBase` 的适配器由 `abstract` 成员在**编译期**
 * 保证这些 duck 存在，永远走不到这条错误；它只服务于不继承 base 的自定义适配器对象。
 *
 * 之所以抛而不是降级：`QueryCacheEngine` 此前缺 duck 时返回空数组，
 * 调用方看到的是「远端没有数据」而不是「本地读不出来」—— 缓存故障被伪装成业务结果。
 *
 * @example
 * ```typescript
 * try {
 *   await firstValueFrom(rxdb.getRepository(Product).find({ where }));
 * } catch (error) {
 *   if (error instanceof RxDBQueryCacheCapabilityError) {
 *     console.error(`${error.side} adapter is missing: ${error.missing.join(', ')}`);
 *   }
 * }
 * ```
 */
export class RxDBQueryCacheCapabilityError extends RxDBError {
  constructor(
    /** 实体名（元数据里的 `name`） */
    readonly entity: string,
    /** 缺能力的是哪一侧适配器 */
    readonly side: 'local' | 'remote',
    /** 缺失的 duck 名，按声明顺序 */
    readonly missing: readonly string[]
  ) {
    super(
      `The ${side} adapter for '${entity}' cannot serve SyncType.QueryCache: ` +
        `missing ${missing.join(', ')}. ` +
        `Extend RxDBAdapter${side === 'local' ? 'Local' : 'Remote'}Base, or implement these members.`
    );
    this.name = 'RxDBQueryCacheCapabilityError';
    Object.setPrototypeOf(this, RxDBQueryCacheCapabilityError.prototype);
  }
}

/**
 * 被配置为 `sync.local` 的适配器跑不了系统引导 —— 缺 `RxDB.connect()` 本地分支要调的成员。
 *
 * @remarks
 * 继承 `RxDBAdapterLocalBase` 的适配器永远走不到这条错误：`migrateSystemSchema()` 与
 * `completeBootstrap()` 在基类上是**有实现的具体方法**，子类不写也继承得到。
 * 它只服务于不继承基类的自定义适配器对象 —— 那里没有编译期约束。
 *
 * 之所以抛而不是跳过：这两步做的是**系统表升级与引导窗收尾**。此前 `connect()` 用
 * `?.()` 调它们，缺失时静默略过，`connect()` 照常 resolve；故障要等到第一次读写才以
 * 「列不存在」之类的面目出现，离根因隔着整个引导流程。
 *
 * `reconcileEntityIndexes` 不在校验之列 —— 它在基类上就是**可选**成员（`?:`），
 * 缺席是契约允许的形态，不是缺陷。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.connect('local');
 * } catch (error) {
 *   if (error instanceof RxDBLocalAdapterCapabilityError) {
 *     console.error(`${error.adapterName} is missing: ${error.missing.join(', ')}`);
 *   }
 * }
 * ```
 */
export class RxDBLocalAdapterCapabilityError extends RxDBError {
  constructor(
    /** 配置里 `sync.local.adapter` 的名字 */
    readonly adapterName: string,
    /** 缺失的成员名，按声明顺序 */
    readonly missing: readonly string[]
  ) {
    super(
      `The local adapter '${adapterName}' cannot run the system bootstrap: ` +
        `missing ${missing.join(', ')}. ` +
        `Extend RxDBAdapterLocalBase, or implement these members.`
    );
    this.name = 'RxDBLocalAdapterCapabilityError';
    Object.setPrototypeOf(this, RxDBLocalAdapterCapabilityError.prototype);
  }
}

/**
 * 声明了某个策略、却没装提供它的插件。
 *
 * @remarks
 * US-025 阶段 B 把 QueryCache 读引擎搬进 `@aiao/rxdb-plugin-querycache`，但
 * `SyncType.QueryCache` 这个取值留在核心（策略轴闭合，`Repository` 的分支要靠它判定）。
 * 缺口因此是结构性的：配置写得出来，实现可能不在。
 *
 * 阶段 D 之后同一个实体有**两个**这样的缺口：读引擎在 querycache 插件，出站队列在
 * `@aiao/rxdb-plugin-sync`。两处各抛各的，靠 {@link RxDBMissingPluginError.subject} 区分 ——
 * 装了一个没装另一个的人，读到的必须是还缺哪一半，而不是一句对他已经不成立的
 * 「引擎没装」。
 *
 * 抛在 `connect()` 里而不是等到第一次 `find()`：配置错误要在启动时响。也**不降级为本地读**
 * —— 降级之后调用方看到的是「远端没有数据」，与 {@link RxDBQueryCacheCapabilityError}
 * 拒绝降级是同一条理由。
 *
 * @example
 * ```typescript
 * import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
 *
 * rxdb.use(rxDBPluginQueryCache);
 * await rxdb.connect('sqlite');
 * ```
 */
export class RxDBMissingPluginError extends RxDBError {
  constructor(
    /** 触发这条错误的实体名（元数据里的 `name`） */
    readonly entity: string,
    /** 该实体声明的、需要插件支撑的能力 */
    readonly capability: string,
    /** 要安装的包名 */
    readonly packageName: string,
    /** 装上之后的注册写法 */
    readonly registration: string,
    /**
     * 缺的那一半叫什么，嵌进 `no ${subject} is installed`。
     *
     * @defaultValue `'engine'`
     */
    readonly subject: string = 'engine'
  ) {
    super(
      `Entity '${entity}' declares ${capability} but no ${subject} is installed. ` +
        `Install '${packageName}' and register it via ${registration}.`
    );
    this.name = 'RxDBMissingPluginError';
    Object.setPrototypeOf(this, RxDBMissingPluginError.prototype);
  }
}

/**
 * 一次批量修改混入了 QueryCache 实体与版本化（Full / Filter）实体。
 *
 * @remarks
 * 两者的写语义不可调和：版本化实体写本地并进 changelog，QueryCache 实体先写远端再落可丢弃缓存。
 * 同批执行只会得到「一半进了变更历史、一半没有」，因此在入口拒绝，由调用方分批。
 *
 * `code` 而非 `name` 是本类的判别位：该字符串由 `US-306 FR-046` 指定，跨故事复用，
 * 不得改名。它也是 `@aiao/rxdb-plugin-working-tree` 那张 `CommitErrorCode` 码表里的一条——
 * 但**本类先于那张表存在**，而且本类属于核心：核心为了一个字符串反向依赖插件，等于把
 * 「不装插件」这件事变成不可能。所以这里写字面量，不从码表取。
 *
 * 两边不会漂：那张码表是 const 对象不是 `enum`（它的 @fileoverview 自陈，正是为了迁就本类
 * 早就在用的裸字面量），成员的静态类型就是普通字符串字面量，于是两侧逐值兼容；且码表那侧
 * 有一条钉死键值逐字相同的测试。
 *
 * 其余各包的新错误仍按「类名主判别」，不要照抄本类。
 */
export class RxDBMixedVersionedCacheTransactionError extends RxDBError {
  /** US-306 FR-046 指定的稳定错误码；写字面量而非取自码表的理由见本类 @remarks */
  readonly code = 'mixed_versioned_cache_transaction';

  constructor(
    /** 本批中走 QueryCache 的实体名 */
    readonly cacheEntities: readonly string[],
    /** 本批中走版本化同步的实体名 */
    readonly versionedEntities: readonly string[]
  ) {
    super(
      `Batch mutations cannot mix QueryCache entities (${cacheEntities.join(', ')}) with ` +
        `versioned entities (${versionedEntities.join(', ')}): the former write remote-first into a ` +
        `discardable cache, the latter write local and enter the changelog. Split the batch.`
    );
    this.name = 'RxDBMixedVersionedCacheTransactionError';
    Object.setPrototypeOf(this, RxDBMixedVersionedCacheTransactionError.prototype);
  }
}

/**
 * 网络离线错误 —— 启用 `offlineFallback` 但无本地缓存可用时抛出
 */
export class NetworkOfflineError extends RxDBError {
  readonly originalError: Error;

  constructor(originalError: Error) {
    super(`NetworkOfflineError: ${originalError.message}`);
    this.name = 'NetworkOfflineError';
    this.originalError = originalError;
    Object.setPrototypeOf(this, NetworkOfflineError.prototype);
  }
}

/**
 * 插件依赖成环 —— 在**安装规划阶段**抛出（US-015 AC#16）。
 *
 * @remarks
 * 环不能留到运行期发现：`inject` 的语义是「依赖就绪后才安装」，成环意味着环上每个插件都在
 * 等下一个进入 `active`，谁都不会开工。那种形态在外部看是「插件静默不装」，与依赖缺失
 * （AC#15）完全同形，却要用完全不同的办法修。因此在 `reconcile()` 之前就拒绝，
 * 此时一个 `install()` 都还没跑过，不存在半装状态。
 *
 * `message` 给出**完整环路径**而不只是「检测到环」：N 个插件的依赖图靠人工重建的成本，
 * 正是这条错误要替调用方省掉的。
 */
export class RxDBPluginDependencyCycleError extends RxDBError {
  constructor(
    /** 环路径上的插件名，首尾为同一个插件（如 `['a', 'b', 'a']`） */
    readonly cycle: readonly string[]
  ) {
    super(
      `Plugin dependency cycle detected: ${cycle.join(' → ')}. ` +
        `Every plugin on the cycle waits for the next one to become active, so none of them installs. ` +
        `Break the cycle by removing one of the 'inject' declarations.`
    );
    this.name = 'RxDBPluginDependencyCycleError';
    Object.setPrototypeOf(this, RxDBPluginDependencyCycleError.prototype);
  }
}

/**
 * `plugin:*` 依赖指向了多个同名插件 —— 无法裁决该注入哪一个（US-015 AC#14 / D4）。
 *
 * @remarks
 * 重名**本身**不是错误，宿主只 `console.warn` 一次：两个插件恰好取了同一个名字、
 * 而谁都没被依赖时，报错只会把一个能正常跑的应用拦在门外。歧义只在该名字**真的被
 * `inject`** 的那一刻成立——此时必须停下，因为「随便挑一个」会让依赖方在两次运行里
 * 拿到不同的提供方，而且不报错。
 *
 * `candidates` 用构造来源（`constructor.name`）区分：候选的 `name` 按定义是相同的，
 * 只报名字等于什么都没说。
 */
export class RxDBPluginAmbiguousDependencyError extends RxDBError {
  constructor(
    /** 触发歧义的依赖键（如 `'plugin:search'`） */
    readonly dependency: string,
    /** 全部同名候选的构造来源名 */
    readonly candidates: readonly string[]
  ) {
    super(
      `Dependency '${dependency}' is ambiguous: ${candidates.length} registered plugins share that name ` +
        `(${candidates.join(', ')}). Rename one of them or drop the duplicate registration.`
    );
    this.name = 'RxDBPluginAmbiguousDependencyError';
    Object.setPrototypeOf(this, RxDBPluginAmbiguousDependencyError.prototype);
  }
}
