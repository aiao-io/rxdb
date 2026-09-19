/**
 * @fileoverview 提交历史的**公开面**：`workingTree.listCommits()` 的入参、条目与页
 * （FR-012，契约见 contracts/core-api.md §5）。
 *
 * @remarks
 * 遍历本身在 `list-commits.ts`，这里只做一件事：把可达性遍历的结果翻译成一份
 * **可以离开这个包**的值。
 *
 * **不直接把 `Commit` 实体摆上公开面。** 实体是存储细节：它带着 `operationId`
 * （幂等键）与 `contentFingerprint`（图校验用的节点指纹），两者都不是给人看的，
 * 而一旦出现在公开类型上，某个调用方迟早会拿 `contentFingerprint` 当「内容有没有变」的
 * 判据——那个值的定义随编码器版本走，不承诺跨版本稳定。实体同时还是可写的类实例，
 * 摆上公开面等于把「历史不可变」降级成一句口头约定。
 *
 * **页里带 `branchId` 与 `headCommitId`，但入参里没有 `branchId`。** 读的永远是当前
 * active 分支（FR-048，与 `status()` / `diff()` 同一条理由：别的分支的历史拿回去，
 * 既不能在它上面提交也不能丢弃）；回传分支身份是为了让调用方能把这一页与自己那次
 * `status()` 对上——两次读之间发生过 switch branch 的话，`branchId` 就是唯一的证据。
 *
 * **没有 `nextCursor`。** 底层遍历只认 `limit`，不存在可以续上的游标；给一个恒为 `null`
 * 的字段，等于让调用方写出一个永远不会翻页的翻页循环。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import type { Commit, CommitKind } from './commit.entity.js';
import { listCommits, readCommitBranchRef } from './list-commits.js';

export type { CommitKind };

/**
 * 一次 `listCommits()` 的入参（contracts/core-api.md §5）。
 *
 * @remarks
 * **全部可选，且没有 `branchId`**：见本文件头。四个字段与 `list-commits.ts` 的
 * `ListCommitsOptions` 逐字对应，少的那一个正是 `branchId`。
 */
export interface CommitLogOptions {
  /** 从 HEAD 端起最多返回多少条；不给则返回整条可达历史 */
  readonly limit?: number;

  /** 只要数据库时间 ≥ 它的提交 */
  readonly since?: Date;

  /** 只要数据库时间 ≤ 它的提交 */
  readonly until?: Date;

  /** 只要动过这个实体的提交 */
  readonly entity?: string;
}

/**
 * 历史里的一个提交节点。
 *
 * @remarks
 * 字段是 `Commit` 实体列的**一个子集**：`operationId` 与 `contentFingerprint` 被刻意
 * 挡在外面（见本文件头）。`id` 改叫 `commitId`、`author` 改叫 `authorId`，与
 * {@link CommitResult.commitId} 和 {@link CommitOptions.authorId} 对齐——同一个概念在
 * 公开面上只该有一个名字。
 */
export interface CommitLogEntry {
  /** 提交 id */
  readonly commitId: string;

  /** 全部父节点，顺序即写入顺序；根节点是空数组，merge 有多个 */
  readonly parentIds: readonly string[];

  /** 第一父；根节点为 `null` */
  readonly firstParentId: string | null;

  /** 提交种类；`baseline` / `branch_baseline` 是系统根节点，不是用户提交 */
  readonly kind: CommitKind;

  /** 提交消息 */
  readonly message: string;

  /** 提交者；未记录时为 `null` */
  readonly authorId: string | null;

  /** 数据库时间 */
  readonly createdAt: Date;

  /** 本次提交的变更单元数 */
  readonly changeSetCount: number;
}

/**
 * 一次 `listCommits()` 的结果。
 *
 * @remarks
 * `entries` 为空是**有语义的空**（这个分支还没有历史），因此它是三端 empty 状态的两个
 * 来源之一（tri-framework-api.md §4）。刚跑完 `0004`、一次都没提交过的库就是这个状态，
 * 不是错误。
 */
export interface CommitLogPage {
  /** 这一页读的是哪个分支；恒为读取时刻的 active 分支 */
  readonly branchId: string;

  /** 该分支当前的 HEAD；一次都没提交过时为 `null` */
  readonly headCommitId: string | null;

  /** 提交节点，最新在前 */
  readonly entries: readonly CommitLogEntry[];
}

/** 把实体行摊成公开条目；逐字段挑，不 `{...row}`（见本文件头）。 */
const toLogEntry = (row: Commit): CommitLogEntry => ({
  commitId: row.id,
  parentIds: row.parentIds,
  firstParentId: row.firstParentId,
  kind: row.kind,
  message: row.message,
  authorId: row.author,
  createdAt: row.createdAt,
  changeSetCount: row.changeSetCount
});

/**
 * 读一个分支的提交历史，翻译成公开面的一页。
 *
 * @param executor - 调用方那个事务的执行器；本函数**不自己开事务**
 * @param branchId - 要读的分支；调用方（门面）从 active 分支令牌取
 * @param options - 见 {@link CommitLogOptions}
 * @returns 见 {@link CommitLogPage}
 * @throws {@link RxDBError} 该分支的 ref 行缺失时（`0004` 没跑完，不是空历史）
 *
 * @remarks
 * ref 行读了两次（一次在这里取 `headCommitId`，一次在 {@link listCommits} 里）：两次都是
 * 同一事务内的主键点查。省掉一次的办法是让 `listCommits()` 把 ref 一起回传，而那会让
 * 遍历函数的返回值为了一个展示字段长出第二种形状。
 */
export const readCommitLogPage = async (
  executor: TransactionExecutor,
  branchId: string,
  options: CommitLogOptions = {}
): Promise<CommitLogPage> => {
  const ref = await readCommitBranchRef(executor, branchId);
  const commits = await listCommits(executor, { ...options, branchId });
  return { branchId, headCommitId: ref.headCommitId, entries: commits.map(toLogEntry) };
};
