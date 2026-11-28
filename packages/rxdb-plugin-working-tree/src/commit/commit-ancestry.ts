/**
 * @fileoverview 提交图上的两种「从 HEAD 到某个提交」：沿全部父链可达，与沿第一父链可达（US-319）。
 *
 * @remarks
 * 合并提交进来之前两者是一回事——每个提交只有一个父，可达集就是一条链。合并提交（只由导入写下）让它们分开了，
 * 而两类调用方要的恰好是不同的那一种：
 *
 * - **「这个提交在不在这条分支的历史里」要全部父链。** 历史列表、损坏守卫、从提交建分支都按它：合并进来的侧枝
 *   也是这条分支的历史，漏看第二父那一侧，等于把被合并进来的提交从历史里抹掉（FR-012 / FR-022）。
 * - **「从 HEAD 退回到那个提交的数据要撤销哪些 ChangeSet」只能走第一父链。** 每个提交的 ChangeSet 是相对它
 *   **第一父**的增量（合并提交也一样，见 `commit.entity.ts` 的 `CommitKind`）：业务表在 HEAD 上等于「根 + 第一父链上
 *   每个提交的 ChangeSet」，侧枝上的提交一个也没有直接落到这条分支的业务表上——它们对这条分支数据的全部影响，
 *   已经折进了合并提交相对第一父的那份增量里。沿全部父链去撤销，侧枝的 ChangeSet 会被撤第二遍。
 *
 * 所以本文件给出三样东西：全部父链的可达集（{@link collectReachableCommitIds} / {@link isCommitReachable}），
 * 与第一父链上的重放路径（{@link resolveFirstParentReplayPath}）。侧枝上的目标在后者那里是一个**单独的结论**
 * （`side_branch`），不并进「不可达」：它确实在历史里，只是从这条分支的数据退不到它——调用方要能把这两件事分开告诉用户。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { loadCommitsByIds, nextFrontier } from './list-commits.js';

/**
 * 从某个节点出发、沿**全部**父链可达的 commit id，按逐层回溯的顺序。
 *
 * @param executor - 当前事务执行器
 * @param rootId - 起点；它自己排在第一个
 * @returns 可达节点 id，起点在前
 *
 * @remarks
 * `seen` 既去重也断环——提交图理论上无环，但被篡改过的库可以有环，逐父递归会栈溢出。展开规则就是历史列表与
 * 损坏守卫共用的那一份 {@link nextFrontier}，不在这里另写。
 * 逐层取而不是逐个取：100 个 commit 的线性历史逐个取就是 100 次往返。读不回来的 id（悬挂指针）只是不出现在结果里，
 * 判定损坏不是这里的事（那是 `assertCommitGraphIntact()`）。
 *
 * 搬自 `restore-precheck.ts`：从提交建分支与 restore 的侧枝判定也要它，留在预检里就成了两个模块之间的私下契约。
 */
export const collectReachableCommitIds = async (executor: TransactionExecutor, rootId: string): Promise<string[]> => {
  const collected: string[] = [];
  const seen = new Set<string>([rootId]);
  let frontier: string[] = [rootId];

  while (frontier.length > 0) {
    const level = await loadCommitsByIds(executor, frontier);
    collected.push(...level.map(commit => commit.id));
    frontier = nextFrontier(level, seen);
  }
  return collected;
};

/**
 * 目标在不在起点沿全部父链的可达集里。
 *
 * @param executor - 当前事务执行器
 * @param fromCommitId - 起点；空分支为 `null`，那时什么都不可达
 * @param targetCommitId - 目标
 * @returns 可达时为 `true`；起点自身也算可达
 */
export const isCommitReachable = async (
  executor: TransactionExecutor,
  fromCommitId: string | null,
  targetCommitId: string
): Promise<boolean> => {
  if (fromCommitId === null) return false;
  return (await collectReachableCommitIds(executor, fromCommitId)).includes(targetCommitId);
};

/**
 * {@link resolveFirstParentReplayPath} 的三种结论。
 *
 * @remarks
 * 判别联合而不是「路径或 `undefined`」：`undefined` 只装得下「不行」，装不下「为什么不行」，而侧枝目标与不可达目标
 * 对用户是两种处境——前者在历史里看得见、点得到，只是退不到；后者根本不在这条分支上。
 */
export type FirstParentReplayPath =
  | {
      /** 判别位：目标在 HEAD 的第一父链上 */
      readonly kind: 'path';
      /** 从 HEAD 撤销到目标要经过的提交，HEAD 在前，**不含**目标自身；目标就是 HEAD 时为空 */
      readonly path: readonly string[];
    }
  | {
      /** 判别位：目标只经由某个合并提交的非第一父可达 */
      readonly kind: 'side_branch';
    }
  | {
      /** 判别位：目标不在 HEAD 的可达父链上（或分支为空） */
      readonly kind: 'unreachable';
    };

/**
 * 沿第一父链从 HEAD 走到目标，交回要撤销的那些提交。
 *
 * @param executor - 当前事务执行器
 * @param headCommitId - 当前分支 HEAD；空分支为 `null`
 * @param targetCommitId - 目标 commit id
 * @returns 见 {@link FirstParentReplayPath}
 *
 * @remarks
 * 线性历史上它与「HEAD 可达集减去目标可达集」逐个相同，于是合并提交出现之前 `restore()` 与提交视图的行为一点没变。
 * 合并图上两者分开：可达集之差会把侧枝提交也算进撤销路径，而侧枝的 ChangeSet 从没直接落到本分支的业务表上
 * （见本文件头）。
 *
 * 第一父链上走不到目标时，再沿全部父链判一次，分出 `side_branch` 与 `unreachable`。逐个取父而不是逐层：第一父链上
 * 每一层恰好一个节点，往返数与逐层 BFS 相同。读不回来的父让走法停下——可达链上的缺口由调用方事先跑过的
 * `assertCommitGraphIntact()` 判成损坏，走到这里的图在第一父链上是完整的。
 */
export const resolveFirstParentReplayPath = async (
  executor: TransactionExecutor,
  headCommitId: string | null,
  targetCommitId: string
): Promise<FirstParentReplayPath> => {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = headCommitId;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === targetCommitId) return { kind: 'path', path };
    seen.add(cursor);
    path.push(cursor);
    const [commit] = await loadCommitsByIds(executor, [cursor]);
    cursor = commit?.parentIds[0] ?? null;
  }
  return (await isCommitReachable(executor, headCommitId, targetCommitId)) ?
      { kind: 'side_branch' }
    : { kind: 'unreachable' };
};
