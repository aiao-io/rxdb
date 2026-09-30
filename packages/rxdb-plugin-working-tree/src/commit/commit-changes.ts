/**
 * @fileoverview 单个 commit 的变更集读路径（FR-012 的明细侧，`commitChanges()` 的公开面）
 *
 * @remarks
 * 历史列表（`listCommits()`）只给元数据，一个 commit **改过哪些实体、每个字段改成了什么**
 * 由这里读：从 `rxdb_commit_change_set` 按 `commitId` 取全部变更单元，按 `sequence`
 * 升序、过 codec 解码。与 {@link listCommits} 的「可达性」口径不同：这里按 id 直读
 * 不可变快照行，不先做可达性遍历——调用方点的是它刚在可达历史里看到的节点，而一个
 * 悬挂 commit 的快照行读出来也是它写入时的真实内容，不是编造的。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import type { WorkingTreePatchCodecContext } from '../working-tree/working-tree-patch-codec.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import { getCommitDetail } from './list-commits.js';

/** {@link commitChanges} 返回的一页：一个 commit 的全部变更单元，按写入顺序。 */
export interface CommitChangeSetPage {
  /** 读的是哪个 commit；与入参逐字相同 */
  readonly commitId: string;
  /** 该 commit 的变更单元；按 `sequence` 升序，已过 codec 解码 */
  readonly entries: readonly CommitChangeUnitContent[];
}

/** `commitChanges()` 的空：这个 commit 没有任何变更单元（基线节点就是这种）。 */
export const isCommitChangeSetPageEmpty = (page: CommitChangeSetPage): boolean => page.entries.length === 0;

/**
 * 读一个 commit 的全部变更单元。
 *
 * @param executor - 调用方那个事务的执行器；本函数**不自己开事务**
 * @param codec - 解码用的元数据解析上下文；不需要 at-rest 判定器（本函数不判、也不解密）
 * @param commitId - 要读的 commit id
 * @returns 见 {@link CommitChangeSetPage}
 * @throws {@link RxDBError} 该 commit 不存在时
 */
export const readCommitChangeSetPage = async (
  executor: TransactionExecutor,
  codec: WorkingTreePatchCodecContext,
  commitId: string
): Promise<CommitChangeSetPage> => {
  const detail = await getCommitDetail(executor, codec, commitId);
  return { commitId, entries: detail.units };
};
