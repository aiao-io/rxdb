/**
 * @fileoverview 可写检出位在主库里的几步（US-314 B1.5）：持有分支、放开分支、建删表集的槽位。
 *
 * 增量只留成员由历史插件的 `keep_table_set_actions` 做，与检出位上的切分支、合并同一份判定（B2.1）。
 *
 * @remarks
 * 打开与关闭各是主库上的一笔受管事务：登记行、分支表上的持有键与那套影子表在同一笔里建、在同一笔里删，崩在哪里都不会留下半套。
 * 持有分支要先看那一行有没有被占：`activeKey` 的唯一索引只拦「两行写同一个键」，拦不住把别人的键覆盖掉。
 */

import type { LocalRxDBAdapter, TransactionExecutor, WorktreeTableSet } from '@aiao/rxdb';
import { ACTIVE_BRANCH_KEY, RxDBBranch, sha256Hex, WorktreeBranchHeldError } from '@aiao/rxdb';
import { WorktreeUnavailableError } from './worktree-errors.js';

/** 适配器上建、删表集的两个槽位都在的适配器。 */
export type WorktreeTableSetHost = LocalRxDBAdapter &
  Required<Pick<LocalRxDBAdapter, 'createWorktreeTableSet' | 'dropWorktreeTableSet'>>;

/**
 * 检出位 id 推出的表集后缀：`wt_` 加 id 哈希的前 12 位十六进制。
 *
 * @param id - 检出位 id（uuid）
 * @returns 表集后缀
 *
 * @remarks
 * 不直接截 id：`uuid()` 是 v7，前 12 位十六进制就是毫秒时间戳，同一毫秒开的两个检出位会拿到同一个后缀。
 */
export const tableSetSuffixOf = (id: string): string => `wt_${sha256Hex(new TextEncoder().encode(id)).slice(0, 12)}`;

/**
 * 主库适配器建得了可写检出位的表集吗。
 *
 * @param adapter - 主库适配器
 * @returns 同一个适配器，两个槽位都在
 * @throws {@link WorktreeUnavailableError} `unsupported_adapter`
 */
export const tableSetHostOf = (adapter: LocalRxDBAdapter): WorktreeTableSetHost => {
  if (typeof adapter.createWorktreeTableSet === 'function' && typeof adapter.dropWorktreeTableSet === 'function') {
    return adapter as WorktreeTableSetHost;
  }
  throw new WorktreeUnavailableError('unsupported_adapter', `主库的适配器 ${adapter.name} 建不了可写检出位的表集`);
};

/**
 * 让一套影子表持有分支：分支表那一行的 `activeKey` 写成它的持有键。
 *
 * @param executor - 打开检出位的那笔事务
 * @param branchId - 要持有的分支
 * @param tableSet - 影子表集
 * @throws {@link WorktreeUnavailableError} `branch_not_found`
 * @throws {@link WorktreeBranchHeldError} 分支已被持有：主检出位正停在它上面，或另一个可写检出位持有它（git：`already used by worktree`）
 */
export const holdBranch = async (
  executor: TransactionExecutor,
  branchId: string,
  tableSet: WorktreeTableSet
): Promise<void> => {
  const branches = executor.getRepository(RxDBBranch);
  const [branch] = await branches.find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (!branch) throw new WorktreeUnavailableError('branch_not_found', `分支 ${branchId} 不存在`);
  if (branch.activated || branch.activeKey != null) {
    throw new WorktreeBranchHeldError(branchId, branch.activeKey ?? ACTIVE_BRANCH_KEY);
  }
  await branches.update(branch, { activeKey: tableSet.holderKey });
};

/**
 * 放开一套影子表持有的分支；持有键已经不在了（分支被删、旧版本客户端抹掉了它）就什么都不做。
 *
 * @param executor - 关闭检出位的那笔事务
 * @param tableSet - 影子表集
 *
 * @remarks
 * 只放这套表自己的持有键：按持有键查，碰不到别人写在同一行上的值。
 */
export const releaseBranch = async (executor: TransactionExecutor, tableSet: WorktreeTableSet): Promise<void> => {
  const branches = executor.getRepository(RxDBBranch);
  const [held] = await branches.find({ where: tableSet.heldBranchWhere, limit: 1 });
  if (held) await branches.update(held, { activeKey: null });
};
