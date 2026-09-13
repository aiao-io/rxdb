/**
 * @fileoverview 提交历史的读路径（FR-012，契约见 contracts/core-api.md §5）
 *
 * @remarks
 * **历史 = 从分支 ref 的 HEAD 沿完整父链可达的那些 commit，不是 `rxdb_commit` 全表。**
 * 表里有 ≠ 这个分支的历史里有：CAS 丢掉的那一次提交、被删分支留下的节点，行都还在，
 * 但没有任何 ref 指向它们。`find({ where: 全真 })` 再按 `createdAt` 排序，在单分支库上
 * 给出的结果与可达性遍历一模一样——要到出现第一个悬挂 commit 那天才炸，而那天没人
 * 会怀疑到一个「一直工作得很好」的历史列表上。
 *
 * **走全部父链，不只走 `firstParentId`。** 合并节点有两个父，只沿第一父走会漏掉整条被合并
 * 进来的历史；FR-022 的损坏判定依赖「完整可达父链」，漏一条等于把损坏判成健康。
 *
 * **过滤只作用于遍历结果，不下推进 WHERE。** 把 `entity` / 时间条件塞进取 commit 的
 * WHERE 里，被过滤掉的那些节点的**父指针也一起消失**，于是历史在第一个不匹配的节点处断掉，
 * 更早的匹配节点全部查不出来——看起来像「就这么多」。
 *
 * **`originBranchId` 不参与截断。** 它只用于审计「这个 commit 最初提交在哪个分支」；
 * 拿它截断继承来的历史，等于把 merge 进来的提交从历史里抹掉（FR-012）。
 */

import { RxDBError } from '../RxDBError.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import { Commit } from './commit.entity.js';

/** {@link listCommits} 的入参。 */
export interface ListCommitsOptions {
  /** 要读哪个分支的历史；等于 `CommitBranchRef.id` */
  readonly branchId: string;

  /** 从 HEAD 端起最多返回多少个节点；不给则返回全部可达节点 */
  readonly limit?: number;

  /** 只要数据库时间 ≥ 它的节点 */
  readonly since?: Date;

  /** 只要数据库时间 ≤ 它的节点 */
  readonly until?: Date;

  /** 只要动过这个实体（`CommitChangeSet.entity`）的节点 */
  readonly entity?: string;
}

/** {@link getCommitDetail} 的返回。 */
export interface CommitDetail {
  /** 该 commit 本身 */
  readonly commit: Commit;

  /** 父节点关系，顺序即 `parentIds` 的顺序（第一个是第一父） */
  readonly parentIds: readonly string[];

  /** 该 commit 的全部变更详情，按 `sequence` 升序 */
  readonly changeSets: readonly CommitChangeSet[];
}

/**
 * 读一个分支的 ref 行。
 *
 * @param executor - 当前事务执行器
 * @param branchId - 分支 id；`CommitBranchRef.id` 与它逐字相同
 * @returns 该分支的 ref
 * @throws {@link RxDBError} ref 缺失时
 *
 * @remarks
 * 写路径（`write-commit.ts`）与读路径共用这一份：HEAD 与代际是同一份真相，两边各读各的
 * 迟早在「用哪个字段当 ref 主键」上分叉。放在读路径这一侧，是因为写路径依赖读路径、
 * 反过来不成立。
 *
 * **ref 缺失不降级成「空历史」**。`0004` 迁移给每个已存在分支都写了一行；读不到意味着
 * 迁移没跑完或这一行被外部删了。当成空历史会让 `commit()` 在一个没有 ref 的分支上
 * 安静地什么都不做。
 */
export const readCommitBranchRef = async (
  executor: TransactionExecutor,
  branchId: string
): Promise<CommitBranchRef> => {
  const rows = await executor.getRepository(CommitBranchRef).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  const ref = rows[0];
  if (!ref) {
    throw new RxDBError(
      `Commit branch ref for branch '${branchId}' is missing. ` +
        'Migration 0004-working-tree-commits writes one row per branch; this is not an empty history.'
    );
  }
  return ref;
};

/**
 * 按一批 id 取 commit，并还原成请求时的顺序。
 *
 * @param executor - 当前事务执行器
 * @param ids - 本层要取的 id，顺序即期望的返回顺序
 * @returns 命中的行；读不回来的 id 直接丢掉
 *
 * @remarks
 * `in` 的返回顺序由后端决定，而历史列表的顺序是语义的一部分（最新在前），所以要按
 * 请求顺序重排。读不回来的 id 是悬挂父指针——这里丢掉它继续遍历，**判定损坏不是读路径的事**，
 * 那是 `assertCommitGraphIntact()`（FR-051）。读路径自己抛，会让一次普通的历史浏览
 * 因为另一条分支上的损坏而失败。
 *
 * 导出是给守卫复用的：它需要的是同一条查询加上「少一行就是损坏」的判定，而不是另一条
 * 长得差不多的查询——两条 `in` 查询各自演化，迟早在「用哪个字段当 commit 主键」上分叉。
 */
export const loadCommitsByIds = async (executor: TransactionExecutor, ids: readonly string[]): Promise<Commit[]> => {
  const rows = await executor.getRepository(Commit).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: [...ids] }] }
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  return ids.map(id => byId.get(id)).filter((row): row is Commit => row !== undefined);
};

/**
 * 由本层节点算出下一层要取的 id。
 *
 * @param level - 本层已取回的节点
 * @param seen - 已入队过的 id；本函数就地登记
 * @returns 下一层的 id，按本层顺序展开
 */
const nextFrontier = (level: readonly Commit[], seen: Set<string>): string[] => {
  const next: string[] = [];
  for (const commit of level) {
    for (const parentId of commit.parentIds) {
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      next.push(parentId);
    }
  }
  return next;
};

/**
 * 从 HEAD 逐层回溯。
 *
 * @param executor - 当前事务执行器
 * @param headCommitId - 起点
 * @param budget - 收够这么多就停；`undefined` 表示走完整条可达图
 * @returns 可达节点，最新在前
 *
 * @remarks
 * `seen` 既去重也断环：提交图理论上无环，但一个被篡改过的库可以有环，逐父递归会直接栈溢出。
 *
 * 逐层取而不是逐个取：100 个 commit 的线性历史逐个取就是 100 次往返。
 */
const traverseFromHead = async (
  executor: TransactionExecutor,
  headCommitId: string,
  budget: number | undefined
): Promise<Commit[]> => {
  const collected: Commit[] = [];
  const seen = new Set<string>([headCommitId]);
  let frontier: string[] = [headCommitId];

  while (frontier.length > 0) {
    const level = await loadCommitsByIds(executor, frontier);
    collected.push(...level);
    if (budget !== undefined && collected.length >= budget) break;
    frontier = nextFrontier(level, seen);
  }
  return collected;
};

/** 时间窗判定；两端都是闭区间。 */
const withinRange = (commit: Commit, options: ListCommitsOptions): boolean => {
  if (options.since !== undefined && commit.createdAt < options.since) return false;
  if (options.until !== undefined && commit.createdAt > options.until) return false;
  return true;
};

/**
 * 留下动过某个实体的那些 commit。
 *
 * @remarks
 * 这是**唯一**会碰 `CommitChangeSet` 的读路径分支。历史列表本身是元数据视图，
 * 顺手 join 变更集会让 100 个 commit 的列表拉出上万行。
 */
const filterByEntity = async (
  executor: TransactionExecutor,
  commits: readonly Commit[],
  entity: string
): Promise<Commit[]> => {
  if (commits.length === 0) return [...commits];
  const changeSets = await executor.getRepository(CommitChangeSet).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'commitId', operator: 'in', value: commits.map(commit => commit.id) },
        { field: 'entity', operator: '=', value: entity }
      ]
    }
  });
  const touched = new Set(changeSets.map(row => row.commitId));
  return commits.filter(commit => touched.has(commit.id));
};

/** 有没有必须先走完整条可达图才能应用的过滤。 */
const hasPostFilter = (options: ListCommitsOptions): boolean =>
  options.since !== undefined || options.until !== undefined || options.entity !== undefined;

/**
 * 读一个分支的提交历史。
 *
 * @param executor - 当前事务执行器
 * @param options - 见 {@link ListCommitsOptions}
 * @returns 可达节点，最新在前
 *
 * @remarks
 * HEAD 为 `null` 时返回空数组而不是报错——刚跑完 `0004`、一次都没提交过的库就是这个状态。
 *
 * `limit` 只在**没有**后置过滤时用来提前收兵：有过滤时提前停会把「前 N 个里恰好没有匹配的」
 * 报告成「一个都没有」。
 */
export const listCommits = async (executor: TransactionExecutor, options: ListCommitsOptions): Promise<Commit[]> => {
  const ref = await readCommitBranchRef(executor, options.branchId);
  if (ref.headCommitId === null) return [];

  const reachable = await traverseFromHead(
    executor,
    ref.headCommitId,
    hasPostFilter(options) ? undefined : options.limit
  );
  const inRange = reachable.filter(commit => withinRange(commit, options));
  const narrowed = options.entity === undefined ? inRange : await filterByEntity(executor, inRange, options.entity);
  return options.limit === undefined ? narrowed : narrowed.slice(0, options.limit);
};

/**
 * 读单个 commit 的变更详情与父节点关系。
 *
 * @param executor - 当前事务执行器
 * @param commitId - 要读的 commit id
 * @returns 见 {@link CommitDetail}
 * @throws {@link RxDBError} 该 commit 不存在时
 *
 * @remarks
 * `changeSets` 在 JS 侧按 `sequence` 排，不依赖后端的默认返回顺序：重放要按序进行，
 * 顺序错了就是把「先删后建」重放成「先建后删」。
 */
export const getCommitDetail = async (executor: TransactionExecutor, commitId: string): Promise<CommitDetail> => {
  const rows = await executor.getRepository(Commit).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: commitId }] },
    limit: 1
  });
  const commit = rows[0];
  if (!commit) throw new RxDBError(`Commit '${commitId}' does not exist.`);

  const changeSets = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commitId }] }
  });
  return {
    commit,
    parentIds: commit.parentIds,
    changeSets: [...changeSets].sort((left, right) => left.sequence - right.sequence)
  };
};
