/**
 * @fileoverview 只读检出位的 HEAD：一条分支，或当前分支上一个可达提交（US-313）。
 */

/** 分支视图：目标分支此刻的完整数据，含它的未提交变更。 */
export interface WorktreeBranchTarget {
  /** 目标分支 id；可以是 active 分支自己 */
  readonly branchId: string;
}

/** 提交视图：当前 active 分支上一个可达提交刚完成时的已跟踪数据。 */
export interface WorktreeCommitTarget {
  /** 目标提交 id；必须在 active 分支 HEAD 的可达父链上，与 `restore()` 同一口径 */
  readonly commitId: string;
}

/** 检出位的 HEAD。 */
export type WorktreeTarget = WorktreeBranchTarget | WorktreeCommitTarget;

/**
 * 是不是提交视图。
 *
 * @param target - 检出位的 HEAD
 * @returns 提交视图时为 `true`
 */
export const isWorktreeCommitTarget = (target: WorktreeTarget): target is WorktreeCommitTarget => 'commitId' in target;
