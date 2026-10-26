/**
 * @fileoverview 可写检出位在主库里的几步（US-314 B1.5）：持有分支、放开分支、建删表集的槽位；
 * 检出位里切分支时登记行跟着走、每套表自己的激活态行、名字（B2.2）。
 *
 * 增量只留成员由历史插件的 `keep_table_set_actions` 做，与检出位上的切分支、合并同一份判定（B2.1）。
 *
 * @remarks
 * 打开与关闭各是主库上的一笔受管事务：登记行、分支表上的持有键与那套影子表在同一笔里建、在同一笔里删，崩在哪里都不会留下半套。
 * 持有分支要先看那一行有没有被占：`activeKey` 的唯一索引只拦「两行写同一个键」，拦不住把别人的键覆盖掉。
 */

import type { EntityManager, LocalRxDBAdapter, TransactionExecutor, WorktreeTableSet } from '@aiao/rxdb';
import { ACTIVE_BRANCH_KEY, RxDBBranch, sha256Hex, WorktreeBranchHeldError } from '@aiao/rxdb';
import { activationStateIdOf, createWorkingTreeActivationRow } from '../working-tree/activation-state.js';
import { WorkingTreeActivationState } from '../working-tree/working-tree-activation-state.entity.js';
import { WorktreeUnavailableError } from './worktree-errors.js';
import { Worktree } from './worktree.entity.js';

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
 * 是不是可写检出位开出来的那种后缀（{@link tableSetSuffixOf} 的形状：`wt_` 加 12 位十六进制）。
 *
 * @param suffix - 表集后缀
 * @returns 是
 *
 * @remarks
 * 孤儿回收只收这种（US-314 B2.6）。适配器认的后缀形状更宽（`wt_` 加 1～12 位小写字母或数字），手工、测试建的表集，
 * 与名字恰好长成那样的别的表都落在里面；回收删的是整套表，宁可漏收，不可错删。
 */
export const isCheckoutTableSetSuffix = (suffix: string): boolean => /^wt_[0-9a-f]{12}$/.test(suffix);

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
  // 「哪些值算被占」只有一份（核心的 heldBy）；activated 那一格单独判，挡住哨兵没写齐的旧行
  const held =
    branch.activated ?
      new WorktreeBranchHeldError(branchId, ACTIVE_BRANCH_KEY)
    : WorktreeBranchHeldError.heldBy(branchId, branch.activeKey, tableSet.holderKey);
  if (held) throw held;
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

/**
 * 检出位里切了分支：登记行的 `branchId` 与 `lastAccessedAt` 跟着走（US-314 B2.2）。
 *
 * @param executor - 切换事务
 * @param tableSet - 本实例挂的那套影子表
 * @param branchId - 切到的分支
 *
 * @remarks
 * 持有关系的真相在分支表的持有键上，登记行这一格只给 `list()` 看；与切换同一笔事务写，一起提交、一起回滚。
 * 没有登记行的表集（适配器级测试直接建的）什么也不做。
 */
export const recordCheckoutBranch = async (
  executor: TransactionExecutor,
  tableSet: WorktreeTableSet,
  branchId: string
): Promise<void> => {
  const worktrees = executor.getRepository(Worktree);
  const [record] = await worktrees.find({
    where: { combinator: 'and', rules: [{ field: 'tableSetSuffix', operator: '=', value: tableSet.suffix }] },
    limit: 1
  });
  if (record) await worktrees.update(record, { branchId, lastAccessedAt: new Date() });
};

/**
 * 开检出位时建这套表的激活态行（US-314 B2.2）：检出位里切分支只推进它，主检出位与别的检出位手上的提交凭据不受影响。
 *
 * @param executor - 打开检出位的那笔事务
 * @param entityManager - 造实例用
 * @param tableSet - 新开的那套影子表
 */
export const openActivationRow = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  tableSet: WorktreeTableSet
): Promise<void> => {
  // 分支代际只在主检出位那一行上发放，这一行的那一格不用，填 0
  await executor.saveMany([createWorkingTreeActivationRow(entityManager, 0, activationStateIdOf(tableSet))]);
};

/**
 * 删检出位时删这套表的激活态行；已经不在（B2.2 之前开的检出位没有这一行）就什么都不做。
 *
 * @param executor - 删检出位的那笔事务
 * @param tableSet - 要删的那套影子表
 */
export const dropActivationRow = async (executor: TransactionExecutor, tableSet: WorktreeTableSet): Promise<void> => {
  const rows = executor.getRepository(WorkingTreeActivationState);
  const [row] = await rows.find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: activationStateIdOf(tableSet) }] },
    limit: 1
  });
  if (row) await rows.remove(row);
};

/** 登记表里叫这个名字的可写检出位 */
const writableNamed = (executor: TransactionExecutor, name: string): Promise<Worktree[]> =>
  executor.getRepository(Worktree).find({
    where: {
      combinator: 'and',
      rules: [
        { field: 'mode', operator: '=', value: 'writable' },
        { field: 'name', operator: '=', value: name }
      ]
    }
  });

/**
 * 核对一个可写检出位的名字（US-314 B2.2）：去掉首尾空白后不能为空，不能与另一个可写检出位重名。
 *
 * @param executor - 打开或改名的那笔事务
 * @param name - 调用方给的名字
 * @param exceptId - 改名时它自己的 id：叫回原名不算撞
 * @returns 去掉首尾空白的名字
 * @throws {@link WorktreeUnavailableError} `invalid_name` / `name_taken`
 *
 * @remarks
 * 名字只是给人看的标签，表集、持有键与锁都按 id 走；重名不坏数据，但列表里两个一样的名字分不出谁是谁。
 * 登记表的 `name` 另有唯一索引兜底，这里先判是为了给出带原因的错误。
 */
export const assertCheckoutName = async (
  executor: TransactionExecutor,
  name: string,
  exceptId?: string
): Promise<string> => {
  const trimmed = name.trim();
  if (!trimmed) throw new WorktreeUnavailableError('invalid_name', '检出位的名字不能是空的');
  if ((await writableNamed(executor, trimmed)).some(row => row.id !== exceptId)) {
    throw new WorktreeUnavailableError('name_taken', `已经有可写检出位叫「${trimmed}」`);
  }
  return trimmed;
};

/**
 * 没给名字时的缺省名：分支 id；被占了（另一个检出位切走之后还叫这个名字）就依次加 `-2`、`-3`。
 *
 * @param executor - 打开检出位的那笔事务
 * @param branchId - 要检出的分支
 * @returns 没被占用的名字
 */
export const defaultCheckoutName = async (executor: TransactionExecutor, branchId: string): Promise<string> => {
  let name = branchId;
  for (let suffix = 2; (await writableNamed(executor, name)).length > 0; suffix++) name = `${branchId}-${suffix}`;
  return name;
};
