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
 *
 * **顺序：子先于父。** 从 HEAD 逐层回溯（每层内按上一层的顺序展开，每个提交的父按 `parentIds` 顺序，第一父在前），
 * 再修成拓扑序：一个提交只在它全部可达子提交都列出之后才列出（`orderChildrenFirst`）。线性历史上这就是时间倒序；
 * 合并提交（US-316 导入）带进来的侧枝排在合并提交之后、与主线交错，同一个祖先不会排到它的任何一个子前面。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import type { WorkingTreePatchCodecContext } from '../working-tree/working-tree-patch-codec.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import { decodeCommitChangeSetUnits } from './commit-codec.js';
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

  /**
   * 该 commit 的全部变更详情，按 `sequence` 升序、**已过 codec 解码**
   *
   * @remarks
   * 交的是变更单元内容而不是落库行：行里的 `patch` 是编码态（bigint / binary 被包成
   * `{$rxdbChangeValue:…}`），原样交出去只有两种下场——调用方自己再写一份解码器，
   * 或者把内部包装当成业务字段展示出去。两种都不报错。
   *
   * `sequence` 不在这里：它是落库行的列，不是变更单元的内容，而顺序本身已经由数组序承载。
   * 守卫侧（`commit-graph-guard.ts`）继续按**落库态**重算指纹，不跟着换成解码态。
   */
  readonly units: readonly CommitChangeUnitContent[];
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
 *
 * @remarks
 * `seen` 是逐层遍历唯一的终止条件。提交图理论上无环，但一个被篡改过的库可以有环，
 * 没有 visited 集合的遍历在这种库上会从「给出结论」变成「挂起」。环本身不判成损坏：
 * 它不影响任何一次可达性重放的结论，判它等于多造一种只有遍历方自己认得的损坏。
 *
 * 导出是给 `assertCommitGraphIntact()` 复用的：读路径与守卫的**展开规则完全相同**，
 * 差别只在取回本层时对缺失 id 的判定（见 {@link loadCommitsByIds}）。两份各自演化，
 * 迟早在「父指针怎么展开」上分叉。
 */
export const nextFrontier = (level: readonly Commit[], seen: Set<string>): string[] => {
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
 * 把一张排在 `sorted` 里的升序下标表插进一个新下标，保持升序。
 *
 * @remarks
 * 就绪集合的宽度等于「此刻并行的线有几条」，合并图上通常只有个位数，二分插入比堆更短、也够快。
 */
const insertSorted = (sorted: number[], value: number): void => {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  sorted.splice(low, 0, value);
};

/**
 * 把逐层回溯的发现序修成「子先于父」的拓扑序（US-316）。
 *
 * @param discovered - 逐层回溯拿到的全部可达节点，发现序
 * @returns 同一批节点：每个提交都排在它全部可达子提交之后，在此之上尽量保持发现序
 *
 * @remarks
 * 合并提交进来之前，可达图是一条链，发现序本身就是时间倒序。有了合并，同一个祖先能沿长短不同的两条路到达：
 * 长主线并进一条从老基线分出来的短侧枝时，老基线在第二层就被侧枝那条边发现了，而它在主线上的子还在更深的层里——
 * 按发现序列出来，祖先排在了它的子前面。
 *
 * 修法是 Kahn：一个提交的全部可达子都列出之后它才就绪，就绪的里面挑**发现序最靠前**的那个。发现序本来就是拓扑序的图上
 * （线性历史、不出现「两条路到同一祖先」的合并）每一步挑中的恰好就是发现序的下一个，结果逐个不变；只有被长短两条路
 * 同时够到的祖先会被挪到更深那条路上它的子之后。
 *
 * 只数可达集合里的子：读不回来的父（悬挂指针）本来就不在集合里，不占「等它的子」的名额。被篡改出环的库会卡住——
 * 就绪集合空了、还有节点没列出——这时按发现序取下一个未列出的节点把环断开，与 {@link nextFrontier} 「环本身不判成损坏」同一个口径。
 */
const orderChildrenFirst = (discovered: readonly Commit[]): Commit[] => {
  const indexOf = new Map(discovered.map((commit, index) => [commit.id, index]));
  const pendingChildren = discovered.map(() => 0);
  for (const commit of discovered) {
    for (const parentId of new Set(commit.parentIds)) {
      const parentIndex = indexOf.get(parentId);
      if (parentIndex !== undefined) pendingChildren[parentIndex] += 1;
    }
  }
  const emitted = discovered.map(() => false);
  const ready = discovered.flatMap((_, index) => (pendingChildren[index] === 0 ? [index] : []));
  const ordered: Commit[] = [];
  while (ordered.length < discovered.length) {
    const next = ready.shift() ?? emitted.indexOf(false);
    if (emitted[next]) continue;
    emitted[next] = true;
    ordered.push(discovered[next]);
    for (const parentId of new Set(discovered[next].parentIds)) {
      const parentIndex = indexOf.get(parentId);
      if (parentIndex === undefined || emitted[parentIndex]) continue;
      pendingChildren[parentIndex] -= 1;
      if (pendingChildren[parentIndex] === 0) insertSorted(ready, parentIndex);
    }
  }
  return ordered;
};

/**
 * 从 HEAD 逐层回溯。
 *
 * @param executor - 当前事务执行器
 * @param headCommitId - 起点
 * @param budget - 收够这么多就停；`undefined` 表示走完整条可达图
 * @returns 可达节点，最新在前；遇到过合并提交时按 {@link orderChildrenFirst} 修成子先于父
 *
 * @remarks
 * `seen` 既去重也断环：提交图理论上无环，但一个被篡改过的库可以有环，逐父递归会直接栈溢出。
 *
 * **`budget` 只在还没见过合并提交时提前收兵。** 没有合并时已收的节点是从 HEAD 出发的一条链，更深的节点只可能是
 * 链尾的祖先，提前停不会漏掉任何一个该排在前面的子；见过合并之后，更深一层可能冒出已收节点的子（长短两条路），
 * 不走完全图就排不对，于是这时忽略 `budget`、走完再排、交给调用方截断。线性历史（今天全部的本地历史）上的代价因此一点没变。
 *
 * 逐层取而不是逐个取：100 个 commit 的线性历史逐个取就是 100 次往返。
 *
 * **剩下的「每层一次往返」是 BFS 本身，不是没做批量。** 同层的批量 `in` 早就在了
 * （见 {@link loadCommitsByIds}），而线性历史的每一层只有一个节点，于是往返数仍等于提交数。
 * 要省掉它得能「一次查回整条分支」，而 `Commit` 上**没有** `branchId` 列——提交属于哪条分支
 * 是从 ref 的 HEAD 沿父链推出来的，不是存着的，所以那个查询无从写起。前提是先有一份按分支
 * 存的派生结构，而那份结构与 `commit-graph-guard.ts` 里「最后已验证 HEAD」水位是同一份状态
 * （那边的 `assertCommitGraphIntact` @remarks 写了为什么水位本身是一次规格变更）：
 * 两条一起做才不会把状态机扩张两遍。顺延记录见 `requirements/roadmap.md`
 * 的「epic-006 评审顺延的架构项」。
 */
const traverseFromHead = async (
  executor: TransactionExecutor,
  headCommitId: string,
  budget: number | undefined
): Promise<Commit[]> => {
  const collected: Commit[] = [];
  const seen = new Set<string>([headCommitId]);
  let frontier: string[] = [headCommitId];
  let sawMerge = false;

  while (frontier.length > 0) {
    const level = await loadCommitsByIds(executor, frontier);
    collected.push(...level);
    sawMerge ||= level.some(commit => commit.parentIds.length > 1);
    if (!sawMerge && budget !== undefined && collected.length >= budget) break;
    frontier = nextFrontier(level, seen);
  }
  return sawMerge ? orderChildrenFirst(collected) : collected;
};

/**
 * 从某个提交出发、沿全部父链可达的提交，子先于父。
 *
 * @param executor - 当前事务执行器
 * @param headCommitId - 起点；它自己排在第一个
 * @returns 可达节点，顺序与 {@link listCommits} 相同
 *
 * @remarks
 * 导出给导出侧（`commit-exchange.ts`）用：「某个提交之后」的那一段与历史列表必须是同一份遍历、同一个顺序，
 * 两份各写一遍，迟早在合并图的排序上分叉——而导入那一侧要求批次父先于子，正是把这个顺序倒过来。
 */
export const listReachableCommits = (executor: TransactionExecutor, headCommitId: string): Promise<Commit[]> =>
  traverseFromHead(executor, headCommitId, undefined);

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
 * @returns 可达节点，子先于父（线性历史上即最新在前）
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
 * @param codec - 解码用的元数据解析上下文；不需要 at-rest 判定器（本函数不判、也不解密）
 * @param commitId - 要读的 commit id
 * @returns 见 {@link CommitDetail}
 * @throws {@link RxDBError} 该 commit 不存在时
 *
 * @remarks
 * 排序在 JS 侧按 `sequence` 做，不依赖后端的默认返回顺序：重放要按序进行，
 * 顺序错了就是把「先删后建」重放成「先建后删」。**排序排在解码之前**——
 * `decodeCommitChangeSetUnits` 明确不重排（两处都排会在一处改了 ORDER BY 时静默分叉）。
 */
export const getCommitDetail = async (
  executor: TransactionExecutor,
  codec: WorkingTreePatchCodecContext,
  commitId: string
): Promise<CommitDetail> => {
  const rows = await executor.getRepository(Commit).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: commitId }] },
    limit: 1
  });
  const commit = rows[0];
  if (!commit) throw new RxDBError(`Commit '${commitId}' does not exist.`);

  const changeSets = await executor.getRepository(CommitChangeSet).find({
    where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: commitId }] }
  });
  const sorted = [...changeSets].sort((left, right) => left.sequence - right.sequence);
  return { commit, parentIds: commit.parentIds, units: decodeCommitChangeSetUnits(codec, sorted) };
};
