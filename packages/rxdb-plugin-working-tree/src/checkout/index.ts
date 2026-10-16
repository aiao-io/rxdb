/**
 * @fileoverview 只读检出位（US-313）的公开面。
 *
 * @remarks
 * 运行时导出用 `Worktree*` 前缀：包入口的运行时导出不许匹配 `/checkout|detach/i`（commit 套件的守卫），
 * 目录名不受它限制。
 */
export type { WorktreeCommitViewPlan } from './worktree-commit-view.js';
export { WorktreeUnavailableError } from './worktree-errors.js';
export type { WorktreeUnavailableReason } from './worktree-errors.js';
export { WorktreeManager } from './worktree-manager.js';
export type { WorktreeTransactionRunner, WorktreeView } from './worktree-manager.js';
export type { RxDBPluginWorkingTreeOptions, WorktreeAdapterFactory, WorktreeOptions } from './worktree-options.js';
export { isWorktreeCommitTarget } from './worktree-target.js';
export type { WorktreeBranchTarget, WorktreeCommitTarget, WorktreeTarget } from './worktree-target.js';
export { Worktree } from './worktree.entity.js';
export type { WorktreeKind, WorktreeOwner, WorktreeState } from './worktree.entity.js';
