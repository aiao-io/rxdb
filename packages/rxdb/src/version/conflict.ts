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
 */
export type ConflictResolution =
  | { type: 'KEEP_LOCAL' } // 保留本地版本
  | { type: 'KEEP_REMOTE' } // 保留远程版本
  | { type: 'MERGE'; merged: Record<string, unknown> } // 合并后的数据
  | { type: 'DEFER' }; // 延迟处理（交给用户）

/**
 * 冲突解决器接口
 *
 * 可自定义实现，支持：
 * - Last-Write-Wins（默认）
 * - 字段级三方合并（类似 Git）
 * - 交互式 UI 选择
 *
 * @example 自定义解决器
 * ```typescript
 * class MyResolver implements ConflictResolver {
 *   async resolve(conflict: Conflict): Promise<ConflictResolution> {
 *     // 显示 UI 让用户选择
 *     const choice = await showConflictDialog(conflict);
 *     return choice;
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
