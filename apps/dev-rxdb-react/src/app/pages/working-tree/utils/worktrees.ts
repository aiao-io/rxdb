import { WorktreeBranchHeldError, type RxDBBranch, type WorktreeTableSet } from '@aiao/rxdb';

/**
 * @fileoverview 工作树页的检出位口径（US-314 C2）：当前分支、被别处持有（Angular 端 `working-tree.worktrees.ts`、Vue 端同名文件同逻辑）。
 *
 * @remarks
 * 当前分支不再看 `activated`：它只说主检出位停在哪条分支上，挂在可写检出位上时，那套表持有的分支 `activated` 是假。
 * 「哪些持有键算被别处占着」交给核心的 `WorktreeBranchHeldError.heldBy`，demo 不另写一份规则。
 */

/**
 * 本实例挂着那套表的当前分支：持有键等于那套表的持有键的那一条（主检出位的持有键是哨兵）。
 *
 * @param branches - 分支表的行
 * @param mounted - 本实例挂着的那套表（`useWorktrees().mounted`）
 * @returns 当前分支 id；一条都对不上（库刚建、还没读出分支）时为空串
 */
export const currentBranchOf = (branches: readonly RxDBBranch[], mounted: WorktreeTableSet): string =>
  branches.find(branch => branch.activeKey === mounted.holderKey)?.id ?? '';

/**
 * 这条分支是不是被别处持有：主检出位、或另一个可写检出位正检出着它。
 *
 * @param branch - 分支行
 * @param mounted - 本实例挂着的那套表
 * @returns 被别处持有时交回那份持有错误（`holderKey` 指明持有者），没人持有、或本套持有时为 `null`
 */
export const heldElsewhere = (branch: RxDBBranch, mounted: WorktreeTableSet): WorktreeBranchHeldError | null =>
  WorktreeBranchHeldError.heldBy(branch.id, branch.activeKey, mounted.holderKey);
