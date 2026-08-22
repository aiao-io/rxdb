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
 *   await rxdb.versionManager.pull({ fetchAll: true });
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
 * 之所以抛而不是降级：`QueryCacheRepository` 此前缺 duck 时返回空数组，
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
 * 一次批量修改混入了 QueryCache 实体与版本化（Full / Filter）实体。
 *
 * @remarks
 * 两者的写语义不可调和：版本化实体写本地并进 changelog，QueryCache 实体先写远端再落可丢弃缓存。
 * 同批执行只会得到「一半进了变更历史、一半没有」，因此在入口拒绝，由调用方分批。
 *
 * `code` 是本仓库唯一用错误码而非 `name` 判别的错误：该字符串由
 * `US-306 FR-046` 指定，跨故事复用，不得改名。
 */
export class RxDBMixedVersionedCacheTransactionError extends RxDBError {
  /** US-306 FR-046 指定的稳定错误码 */
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
