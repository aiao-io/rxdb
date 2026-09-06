import type { IRxDBChange } from '../system/system.interface.js';

/**
 * 冲突信息
 *
 * 当本地未同步的变更与远程变更针对同一实体时产生冲突
 */
export interface Conflict {
  /**
   * 实体键：`${namespace}:${entity}:${entityId}`
   */
  entityKey: string;

  /**
   * 本地变更
   */
  local: IRxDBChange;

  /**
   * 远程变更
   */
  remote: IRxDBChange;

  /**
   * 共同祖先数据（用于三方合并，可选）
   */
  base?: Record<string, unknown>;
}

/**
 * 冲突解决结果
 *
 * @remarks
 * **运行时能自动应用的只有 `KEEP_LOCAL` 与 `KEEP_REMOTE`。**
 *
 * 返回 `MERGE` 或 `DEFER` 时，`pull` 会派发 {@link ConflictPendingEvent} 交出待处理的
 * 冲突清单，然后**整轮抛错回滚** —— 本地不落库、水位线不推进。这不是缺陷兜底而是刻意的
 * fail-closed：水位线是单调游标，跳过一条变更去推进它，那条变更就永久丢失，
 * 而引擎没有逐实体的挂起冲突存储来接住它。
 *
 * 因此 `PullResult.conflictsDeferred` 在成功返回的结果里恒为 `0`。
 *
 * 想做三方合并或交互式选择，正确的用法是：拿到 {@link ConflictPendingEvent} 后在应用侧
 * 完成合并、把结果作为一次普通的本地写入，再重新 `pull()`，此时解决器返回
 * `KEEP_LOCAL` / `KEEP_REMOTE` 即可收敛。
 */
export type ConflictResolution =
  | { type: 'KEEP_LOCAL' } // 保留本地版本
  | { type: 'KEEP_REMOTE' } // 保留远程版本
  | { type: 'MERGE'; merged: Record<string, unknown> } // 合并后的数据；运行时不自动应用，见上
  | { type: 'DEFER' }; // 延迟处理（交给用户）；运行时不自动应用，见上

/**
 * 冲突解决器接口
 *
 * 可自定义实现。注意运行时能自动应用的解决结果只有 `KEEP_LOCAL` 与 `KEEP_REMOTE`，
 * 返回 `MERGE` / `DEFER` 会让本轮拉取整体回滚，详见 {@link ConflictResolution}。
 *
 * 通过 {@link PullOptions.conflictResolver} 或 {@link PullRepositoryOptions.conflictResolver}
 * 传入；不传则用 {@link LWWConflictResolver}。
 *
 * @example 交互式选择（返回值仍须落在两种可应用结果上）
 * ```typescript
 * class MyResolver implements ConflictResolver {
 *   async resolve(conflict: Conflict): Promise<ConflictResolution> {
 *     const keepLocal = await showConflictDialog(conflict);
 *     return { type: keepLocal ? 'KEEP_LOCAL' : 'KEEP_REMOTE' };
 *   }
 * }
 * ```
 */
export interface ConflictResolver {
  /**
   * 解决单个冲突
   *
   * @param conflict - 冲突信息
   * @returns 冲突解决结果
   */
  resolve(conflict: Conflict): Promise<ConflictResolution>;

  /**
   * 批量解决冲突（可选优化）
   *
   * 默认实现会逐个调用 resolve()
   *
   * @param conflicts - 冲突列表
   * @returns 解决结果列表
   */
  resolveAll?(conflicts: Conflict[]): Promise<ConflictResolution[]>;
}
