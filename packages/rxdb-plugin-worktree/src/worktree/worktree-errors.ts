/**
 * @fileoverview worktree 四个命令的失败出口（US-310）。
 *
 * @remarks
 * 写法照 `WorktreeDirtyError`：`RxDBError` 子类 + 稳定 `code` + 判别字段 + `name` + `setPrototypeOf`。
 * `code` 供跨 realm 判别（三框架绑定、日志），`name` 供本进程内 `instanceof` 之外的兜底，
 * 判别字段让界面说得出「哪一条分支 / 哪一个 worktree」，而不是把 `message` 原样贴出去。
 *
 * 「所钉分支有未提交改动」不在这里：它复用 `WorktreeDirtyError` 原类原码——判据与切换守卫是同一列
 * （`WorkingTreeState.entryCount`），两个错误类会让调用方的 `catch` 写两遍同一件事。
 */

import { RxDBError } from '@aiao/rxdb';

/**
 * 这条分支上已经钉着一个 worktree（git 的 "already checked out"）。
 *
 * @remarks
 * 带上占着它的那个 worktree 的 id：界面要能把用户直接带过去，而不是只说一句「已存在」。
 */
export class WorktreeBranchPinnedError extends RxDBError {
  /** 稳定错误码 */
  readonly code = 'worktree_branch_pinned';

  /** 已被钉住的分支 */
  readonly branchId: string;

  /** 占着它的那个 worktree */
  readonly worktreeId: string;

  /**
   * @param branchId - 已被钉住的分支
   * @param worktreeId - 占着它的那个 worktree
   */
  constructor(branchId: string, worktreeId: string) {
    super(`分支 ${branchId} 已经钉在 worktree ${worktreeId} 上：一条分支只能有一个 worktree，直接切过去即可。`);
    this.branchId = branchId;
    this.worktreeId = worktreeId;
    this.name = 'WorktreeBranchPinnedError';
    Object.setPrototypeOf(this, WorktreeBranchPinnedError.prototype);
  }
}

/** 要钉的分支不存在。 */
export class WorktreeBranchNotFoundError extends RxDBError {
  /** 稳定错误码 */
  readonly code = 'worktree_branch_not_found';

  /** 找不到的分支 */
  readonly branchId: string;

  /**
   * @param branchId - 找不到的分支
   */
  constructor(branchId: string) {
    super(`分支 ${branchId} 不存在：先 createBranch()，再把 worktree 钉上去。`);
    this.branchId = branchId;
    this.name = 'WorktreeBranchNotFoundError';
    Object.setPrototypeOf(this, WorktreeBranchNotFoundError.prototype);
  }
}

/** 这个 worktree 不存在（已被移除，或 id 写错）。 */
export class WorktreeNotFoundError extends RxDBError {
  /** 稳定错误码 */
  readonly code = 'worktree_not_found';

  /** 找不到的 worktree */
  readonly worktreeId: string;

  /**
   * @param worktreeId - 找不到的 worktree
   */
  constructor(worktreeId: string) {
    super(`worktree ${worktreeId} 不存在：它可能已被移除，重新 listWorktrees() 取一次。`);
    this.worktreeId = worktreeId;
    this.name = 'WorktreeNotFoundError';
    Object.setPrototypeOf(this, WorktreeNotFoundError.prototype);
  }
}

/**
 * 不能移除当前所在的 worktree（git 同款）。
 *
 * @remarks
 * 删了之后「我现在在哪个 worktree」就没有答案；先切到别的 worktree 再删。
 */
export class WorktreeActiveError extends RxDBError {
  /** 稳定错误码 */
  readonly code = 'worktree_active';

  /** 被拒的 worktree */
  readonly worktreeId: string;

  /** 它钉住的、当前 active 的分支 */
  readonly branchId: string;

  /**
   * @param worktreeId - 被拒的 worktree
   * @param branchId - 它钉住的、当前 active 的分支
   */
  constructor(worktreeId: string, branchId: string) {
    super(`worktree ${worktreeId} 是当前所在的 worktree（分支 ${branchId}）：先切到别的 worktree 再移除。`);
    this.worktreeId = worktreeId;
    this.branchId = branchId;
    this.name = 'WorktreeActiveError';
    Object.setPrototypeOf(this, WorktreeActiveError.prototype);
  }
}

/**
 * label 给了却是空白。
 *
 * @remarks
 * 不回退成 `null`：调用方显式给了一个值，静默换成「没起名」等于替用户改了输入。不想起名就不传。
 */
export class WorktreeLabelError extends RxDBError {
  /** 稳定错误码 */
  readonly code = 'worktree_label_invalid';

  /** 被拒的原值 */
  readonly label: string;

  /**
   * @param label - 被拒的原值
   */
  constructor(label: string) {
    super(`worktree 的 label 不能是空白（收到 ${JSON.stringify(label)}）：不想起名就不传，界面会显示分支名。`);
    this.label = label;
    this.name = 'WorktreeLabelError';
    Object.setPrototypeOf(this, WorktreeLabelError.prototype);
  }
}
