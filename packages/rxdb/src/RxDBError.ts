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
