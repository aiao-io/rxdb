/**
 * @fileoverview `WorkingTreeManager.commits$` 的载荷（US-909 阶段 C）。
 */

/**
 * 一次**确实写入了新 commit** 的提交，在事务提交之后由门面的 `commits$` 发出。
 *
 * @remarks
 * 只有两个字段，没有消息、作者、变更单元数：订阅者要的是「哪个 commit、哪条分支」这一对关联键，
 * 其余信息用 `commitId` 去 `listCommits()` / `commitChanges()` 读，读到的才是落库后的真值。
 * 把 `CommitResult` 整个转发出去的话，`headRevision` 这类只在调用那一刻成立的簿记值会被订阅者
 * 当成历史事实存下来。
 */
export interface WorkingTreeCommitEvent {
  /** 新 commit 的 id */
  readonly commitId: string;
  /** 这笔提交落在哪条分支上 */
  readonly branchId: string;
}
