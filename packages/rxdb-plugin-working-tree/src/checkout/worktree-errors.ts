/**
 * @fileoverview 只读检出位打不开时的类型化错误（US-313）。
 */

import { RxDBError } from '@aiao/rxdb';

/**
 * 只读检出位打不开的原因。
 *
 * - `not_configured`：装工作树插件时没给 `worktrees.adapter`，不知道快照库建在哪
 * - `unsupported_adapter`：主库或快照库的适配器没有快照原语
 * - `adapter_mismatch`：快照库的适配器与主库不是同一种后端，存储形态的行搬不过去
 * - `branch_not_found`：目标分支不存在
 * - `branch_not_materialized`：目标分支本地只有 metadata，要先切过去一次把远端快照物化下来
 * - `incomplete_entities`：主实例上有一张要复制的表，快照实例上没有对应的实体类
 *   （多半是生成它的插件没装进 `worktrees.plugins`）
 * - `unreachable_target`：提交不在 active 分支 HEAD 的可达父链上（与 `restore()` 同名同口径）
 * - `incompatible_schema`：往回推的路径上有本客户端认不出的实体（与 `restore()` 同名同口径）
 * - `restoring_working_tree`：active 分支上有进行中的恢复，工作树里是恢复出来的变更，推回去的起点不是 HEAD
 */
export type WorktreeUnavailableReason =
  | 'not_configured'
  | 'unsupported_adapter'
  | 'adapter_mismatch'
  | 'branch_not_found'
  | 'branch_not_materialized'
  | 'incomplete_entities'
  | 'unreachable_target'
  | 'incompatible_schema'
  | 'restoring_working_tree';

/** 只读检出位打不开。 */
export class WorktreeUnavailableError extends RxDBError {
  /**
   * @param reason - 原因
   * @param detail - 人读的补充说明
   */
  constructor(
    readonly reason: WorktreeUnavailableReason,
    readonly detail: string
  ) {
    super(`只读检出位打不开（${reason}）：${detail}`);
    this.name = 'WorktreeUnavailableError';
    Object.setPrototypeOf(this, WorktreeUnavailableError.prototype);
  }
}
