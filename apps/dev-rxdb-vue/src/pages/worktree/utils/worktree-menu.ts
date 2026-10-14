/** worktree 菜单的创建弹层交给页面的请求；校验与建库调用由页面做（US-310）。 */
export interface WorktreeCreateRequest {
  /** `existing` 钉一条已有分支；`new` 先建分支再钉（`git worktree add -b` 同款） */
  readonly mode: 'existing' | 'new';
  /** 要钉的分支（`new` 时即新分支名） */
  readonly branchId: string;
  /** 显示名；空白即不起名 */
  readonly label: string | undefined;
}
