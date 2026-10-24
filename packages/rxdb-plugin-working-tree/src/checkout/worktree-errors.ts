/**
 * @fileoverview 检出位打不开、改不了名时的类型化错误：只读检出位（US-313）与可写检出位（US-314）共用。
 */

import { RxDBError } from '@aiao/rxdb';

/**
 * 检出位打不开、改不了名的原因。
 *
 * - `not_configured`：装工作树插件时没给 `worktrees.adapter`，不知道快照库建在哪（只读检出位）
 * - `unsupported_adapter`：主库或快照库的适配器没有快照原语，或主库适配器建不了可写检出位的表集
 * - `adapter_mismatch`：快照库的适配器与主库不是同一种后端，存储形态的行搬不过去
 * - `branch_not_found`：目标分支不存在
 * - `branch_not_materialized`：目标分支本地只有 metadata，要先在主检出位上切过去一次把远端快照物化下来
 *   （打开检出位，或在可写检出位里切分支）
 * - `incomplete_entities`：主实例上有一张要复制的表，快照实例上没有对应的实体类
 *   （多半是生成它的插件没装进 `worktrees.plugins`）
 * - `unreachable_target`：提交不在 active 分支 HEAD 的可达父链上（与 `restore()` 同名同口径）
 * - `incompatible_schema`：往回推的路径上有本客户端认不出的实体（与 `restore()` 同名同口径）
 * - `restoring_working_tree`：active 分支上有进行中的恢复，工作树里是恢复出来的变更，推回去的起点不是 HEAD
 * - `locks_unavailable`：运行时没有 `navigator.locks`，判断不了有没有上下文在用一个检出位
 * - `in_use`：`attach()` / `mount()` / `remove()` 的检出位正在别处打开着
 * - `not_found`：`attach()` 的检出位不存在、不是持久归属的只读检出位，或还没建完；`mount()` / `remove()` 的检出位不是可写检出位，
 *   或它持有的分支已经不在了
 * - `schema_mismatch`：`attach()` 的只读检出位建好之后，应用的实体结构变了
 * - `schema_rebuild_failed`：`mount()` 的可写检出位指纹不符（实体结构或插件建在表上的附属对象变了），按新结构重建失败、
 *   整笔回滚，检出位原样；`cause` 是重建时的原始错误（US-314 B2.6）
 * - `invalid_name`：`add()` / `rename()` 给的名字去掉首尾空白后是空的
 * - `name_taken`：`add()` / `rename()` 给的名字已经被另一个可写检出位用了
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
  | 'restoring_working_tree'
  | 'locks_unavailable'
  | 'in_use'
  | 'not_found'
  | 'schema_mismatch'
  | 'schema_rebuild_failed'
  | 'invalid_name'
  | 'name_taken';

/** 检出位打不开，或改不了名。 */
export class WorktreeUnavailableError extends RxDBError {
  /**
   * @param reason - 原因
   * @param detail - 人读的补充说明
   * @param options - `cause`：引起它的原始错误（`schema_rebuild_failed` 带重建时的错误）
   */
  constructor(
    readonly reason: WorktreeUnavailableReason,
    readonly detail: string,
    options?: ErrorOptions
  ) {
    super(`检出位操作被拒（${reason}）：${detail}`, options);
    this.name = 'WorktreeUnavailableError';
    Object.setPrototypeOf(this, WorktreeUnavailableError.prototype);
  }
}
