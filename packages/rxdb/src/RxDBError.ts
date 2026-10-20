export class RxDBError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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
 * 一次写入违反了实体元数据声明的 CHECK 约束（US-030 阶段 A）。
 *
 * @remarks
 * 两个后端归一为**同一个错误类**（按类名主判别，不另立码表）：PG 识别 SQLSTATE
 * `23514`，SQLite 识别原生 `CHECK constraint failed: <约束名>`；直连 SQL 的写入
 * 拿不到本类，只拿到原生消息。
 *
 * 原生 CHECK 消息不带冲突值，所以 `conflicts` 取自适配器**自己发出的那一行**：
 * 约束声明里引用的每个列（含 `ref` 目标）与该行送出的值。批量写入命中多条候选行时
 * 逐行并列。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.entityManager.save(newItem);
 * } catch (error) {
 *   if (error instanceof RxDBCheckViolationError) {
 *     console.error(`${error.entity} 违反约束 ${error.constraint}:`, error.conflicts);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class RxDBCheckViolationError extends RxDBError {
  constructor(
    /** 违反约束的实体名（元数据里的 `name`） */
    readonly entity: string,
    /** 约束名（`ck_` 起头的确定性名） */
    readonly constraint: string,
    /** 约束引用的列与该行送出的值（列名是物理列名） */
    readonly conflicts: ReadonlyArray<{ column: string; value: unknown }>,
    /** 适配器抛出的原始违约错误（仓库 `cause` 惯例，见 {@link RxDBPartialSyncError}） */
    override readonly cause?: unknown
  ) {
    super(
      `Entity '${entity}' violates CHECK constraint '${constraint}': ` +
        conflicts.map(c => `${c.column} = ${String(c.value)}`).join(', '),
      { cause }
    );
    this.name = 'RxDBCheckViolationError';
    Object.setPrototypeOf(this, RxDBCheckViolationError.prototype);
  }
}

/**
 * 区间排他冲突里一维区间的双方取值（见 {@link RxDBExclusionViolationError}）。
 */
export interface ExclusionRangeConflict {
  /** 区间起点列（属性名） */
  readonly from: string;
  /** 区间终点列（属性名） */
  readonly to: string;
  /** 区间边界：`[)` 左闭右开、`[]` 两端闭合 */
  readonly bounds: '[)' | '[]';
  /** 本次写入行在该维的 `[起点, 终点]`；`null` 即该侧无界 */
  readonly incoming: readonly [unknown, unknown];
  /** 已有冲突行在该维的 `[起点, 终点]`；`null` 即该侧无界 */
  readonly existing: readonly [unknown, unknown];
}

const formatRangeEndpoint = (value: unknown): string =>
  value === null ? '∞'
  : value instanceof Date ? value.toISOString()
  : String(value);

const formatRange = (bounds: '[)' | '[]', [from, to]: readonly [unknown, unknown]): string =>
  `${bounds[0]}${from === null ? '-∞' : formatRangeEndpoint(from)}, ${formatRangeEndpoint(to)}${bounds[1]}`;

const formatExclusionRangeConflict = (conflict: ExclusionRangeConflict): string =>
  `${conflict.from}..${conflict.to} ${formatRange(conflict.bounds, conflict.incoming)} overlaps existing ` +
  formatRange(conflict.bounds, conflict.existing);

/**
 * 一次写入与已有行违反了实体元数据声明的区间排他约束（US-030 阶段 C）。
 *
 * @remarks
 * 两个后端归一为**同一个错误类**：PG 识别 SQLSTATE `23P01`（`EXCLUDE USING gist`），
 * SQLite 识别排他触发器的 `rxdb:exclusion_violation:<约束名>:` 消息；直连 SQL 的写入
 * 拿不到本类，只拿到原生消息。
 *
 * `ranges` 逐维给出**双方**区间：本次写入行（`incoming`）与已有冲突行（`existing`），端点取自
 * PG 的 `DETAIL` 或触发器消息，`null` 即该侧无界。后端没有回报冲突键时（PGlite 的 worker
 * 模式只回传错误消息文本）`ranges` 为空，约束名仍然准确。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.entityManager.save(occurrence);
 * } catch (error) {
 *   if (error instanceof RxDBExclusionViolationError) {
 *     console.error(`${error.entity} 违反排他约束 ${error.constraint}:`, error.ranges);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class RxDBExclusionViolationError extends RxDBError {
  constructor(
    /** 违反约束的实体名（元数据里的 `name`） */
    readonly entity: string,
    /** 约束名（`ex_` 起头的确定性名） */
    readonly constraint: string,
    /** 逐维的双方区间；后端没有回报冲突键时为空 */
    readonly ranges: ReadonlyArray<ExclusionRangeConflict>,
    /** 适配器抛出的原始违约错误（仓库 `cause` 惯例，见 {@link RxDBPartialSyncError}） */
    override readonly cause?: unknown
  ) {
    super(
      `Entity '${entity}' violates exclusion constraint '${constraint}': ` +
        (ranges.length > 0 ?
          ranges.map(formatExclusionRangeConflict).join('; ')
        : 'the backend did not report the conflicting key'),
      { cause }
    );
    this.name = 'RxDBExclusionViolationError';
    Object.setPrototypeOf(this, RxDBExclusionViolationError.prototype);
  }
}

/** 多余对象的可操作说明：点名其中出现的托管保留前缀；没有前缀形态的名字不加说明。 */
const reservedPrefixHint = (extra: readonly string[]): string => {
  const prefixes = [...new Set(extra.flatMap(name => /^[a-z]{2}_/.exec(name)?.[0] ?? []))].sort();
  if (prefixes.length === 0) return '';
  return (
    `Names prefixed ${prefixes.join(' / ')} are reserved for RxDB-managed storage objects: ` +
    `rename or drop an undeclared object with such a name in a migration, or declare it in entity metadata / entityStorage. `
  );
};

/**
 * 已有表上的存储约束与实体元数据声明不一致（US-030，`init()` 时抛出）。
 *
 * @remarks
 * 漂移检查是只读比对：元数据确定性生成的约束名集合与数据库目录里实际的同类对象集合，
 * 缺失与多余分别列出。比对纳入：`ck_` CHECK、`uq_` 条件唯一索引、`ex_` 区间排他
 * （PG 是 `EXCLUDE` 约束，SQLite 是它的 `_i` / `_u` 两个触发器）、`gc_` 生成列与 `sx_` 高级索引。
 * 不自动补建——补建由用户写进 `migrations`，它恰好排在漂移检查之前执行；用户迁移补上后再
 * `init()` 即通过（AC#10）。这些前缀是托管对象的保留命名空间：库里未声明的同前缀对象（包括
 * 用户自建的存量列 / 索引）一律算多余，消息会点名前缀并给出改名、删除或补声明的处理方式。
 *
 * 外键约束、`idx_` 普通索引、系统 CRUD 触发器与 FTS 触发器都不在比对范围（AC#16）。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.connect('local');
 * } catch (error) {
 *   if (error instanceof RxDBConstraintDriftError) {
 *     console.error('缺失:', error.missing, '多余:', error.extra);
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class RxDBConstraintDriftError extends RxDBError {
  constructor(
    /** 发生漂移的实体名（元数据里的 `name`） */
    readonly entity: string,
    /** 发生漂移的表名（元数据里的 `tableName`） */
    readonly tableName: string,
    /** 元数据声明了、库里没有的约束名 */
    readonly missing: readonly string[],
    /** 库里存在、元数据没声明的约束名 */
    readonly extra: readonly string[],
    /** 表本身在目录里不存在（缺表），与「有表但约束不一致」分开点名 */
    readonly tableMissing: boolean = false,
    /** 名称相同但实际列、表达式、方法或生成模式不符的存储对象 */
    readonly changed: readonly string[] = []
  ) {
    super(
      tableMissing ?
        `Entity '${entity}' table '${tableName}' is missing from the database catalog. ` +
          `Expected constraints: [${missing.join(', ')}]. ` +
          `Restore the table (or a migration creating it) before init.`
      : `Entity '${entity}' (table '${tableName}') storage constraints drifted. ` +
          `Missing: [${missing.join(', ')}]. Extra: [${extra.join(', ')}]. ` +
          (changed.length > 0 ? `Changed definitions: [${changed.join(', ')}]. ` : '') +
          reservedPrefixHint(extra) +
          `Apply a migration to add/drop the listed constraints before init.`
    );
    this.name = 'RxDBConstraintDriftError';
    Object.setPrototypeOf(this, RxDBConstraintDriftError.prototype);
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
