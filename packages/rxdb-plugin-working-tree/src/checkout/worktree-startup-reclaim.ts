/**
 * @fileoverview 启动清理的判定（US-313 AC9）：这次连接之后要不要在后台回收一次只读检出位。
 *
 * @remarks
 * 回收要开事务读写登记表，而另一个连接的 `connect()` 开头先拿系统迁移的排他锁、拿不到就失败（按设计不重试）。
 * 连上之后无条件回收一次的话，每次启动都多开一笔事务，正赶上这一笔的别的连接——另一个标签页、同一页面里的
 * 第二个实例——就连不上。判定因此放进连接期本来就开的引导事务里：读一次登记表，只有确有孤儿（会话归属或没建完、
 * 且它的锁此刻没人持有）才在连上之后回收。孤儿通常只在标签页关掉或崩掉之后出现，那时这笔事务换来的是真的清理。
 */

import type { LocalRxDBAdapter, TransactionExecutor } from '@aiao/rxdb';
import { RxDBBranch, WorktreeTableSet } from '@aiao/rxdb';
import { WorkingTreeActivationState } from '../working-tree/working-tree-activation-state.entity.js';
import { worktreeLockName } from './worktree-locks.js';
import { isCheckoutTableSetSuffix } from './worktree-writable.js';
import { Worktree } from './worktree.entity.js';

/**
 * 回收的对象：会话归属的，与没建完的；持久归属且已建完的留给 `attach()`。
 *
 * @param record - 登记行
 * @returns 是回收对象
 */
export const isReclaimCandidate = (record: Pick<Worktree, 'owner' | 'state'>): boolean =>
  record.owner === 'session' || record.state === 'building';

/**
 * 分支表上的全部持有键：主检出位的哨兵与各可写检出位的持有键。
 *
 * @param executor - 调用方的事务
 * @returns 持有键
 */
export const readHeldKeys = async (executor: TransactionExecutor): Promise<Set<string>> => {
  const branches = await executor.getRepository(RxDBBranch).find({ where: { combinator: 'and', rules: [] } });
  return new Set(branches.flatMap(branch => (typeof branch.activeKey === 'string' ? [branch.activeKey] : [])));
};

/**
 * 可写检出位的持有键丢了：分支被删了，或 B1.2 之前的客户端切分支时把它抹掉了。这一行再也挂不上，按孤儿回收。
 *
 * @param record - 登记行
 * @param heldKeys - {@link readHeldKeys} 的结果
 * @returns 是可写检出位，且分支表上已经没有它的持有键
 */
export const hasLostHolder = (
  record: Pick<Worktree, 'mode' | 'tableSetSuffix'>,
  heldKeys: ReadonlySet<string>
): boolean =>
  record.mode === 'writable' &&
  (record.tableSetSuffix === null || !heldKeys.has(WorktreeTableSet.of(record.tableSetSuffix, []).holderKey));

/**
 * 回收得了的检出位：可写检出位总是收得了（表在主库里）；只读检出位要配了快照库才连得上它的库。
 *
 * @param record - 登记行
 * @param heldKeys - {@link readHeldKeys} 的结果
 * @param snapshotsConfigured - 装插件时给了 `worktrees`
 * @returns 是回收对象
 */
export const isPrunable = (
  record: Pick<Worktree, 'mode' | 'owner' | 'state' | 'tableSetSuffix'>,
  heldKeys: ReadonlySet<string>,
  snapshotsConfigured: boolean
): boolean =>
  (record.mode === 'writable' || snapshotsConfigured) &&
  (isReclaimCandidate(record) || hasLostHolder(record, heldKeys));

/** 连接期的启动清理判定读出来的两样：登记表里的回收对象，与没有登记行的孤儿表集。 */
export interface StartupReclaimFindings {
  /** 回收对象的 id（判据同 `prune()`，见 {@link isPrunable}）；要看它们的锁有没有人持有，见 {@link hasOrphanedWorktree} */
  readonly candidates: readonly string[];
  /** 孤儿表集的后缀（见 {@link findOrphanTableSets}）：它们没有锁，有就回收 */
  readonly orphanTableSets: readonly string[];
}

/**
 * 登记表里的回收对象，与没有登记行的孤儿表集。
 *
 * @param executor - 连接期的引导事务
 * @param adapter - 主库适配器：列目录找表集用
 * @param snapshotsConfigured - 装插件时给了 `worktrees`；没给时只读检出位不算（它们的快照库连不上）
 * @returns 两样判定
 *
 * @remarks
 * 登记表与分支表上的持有键各读一次，两样都在这一份上判，同在这一笔引导事务里。整表读出再筛，与 `prune()` 同一条判据
 * （{@link isPrunable}）：登记表只有寥寥几行，筛选写在一处比拼一条 `or` 查询更不容易两边走样。
 */
export const findReclaimCandidates = async (
  executor: TransactionExecutor,
  adapter: Pick<LocalRxDBAdapter, 'listWorktreeTableSetSuffixes'>,
  snapshotsConfigured: boolean
): Promise<StartupReclaimFindings> => {
  const records = await executor.getRepository(Worktree).find({ where: { combinator: 'and', rules: [] } });
  const heldKeys = await readHeldKeys(executor);
  return {
    candidates: records.filter(record => isPrunable(record, heldKeys, snapshotsConfigured)).map(record => record.id),
    orphanTableSets: await findOrphanTableSets(executor, adapter, records, heldKeys)
  };
};

/**
 * 没有登记行的可写检出位表集（US-314 B2.6）：分支表上的持有键、激活态行、库里目录列得出的表集，三处任一处还在，
 * 登记表里却没有哪一行指着它。
 *
 * @param executor - 调用方的事务（连接期的引导事务，或 `prune()` 的那一笔）
 * @param adapter - 主库适配器：列目录用
 * @param records - 同一笔事务里读出的全部登记行
 * @param heldKeys - 同一笔事务里读出的持有键（{@link readHeldKeys}）
 * @returns 孤儿的表集后缀，排好序
 *
 * @remarks
 * 开、删检出位各是一笔事务，正常走不出孤儿；它们来自外部干预（手工删了登记行）或旧版本留下的残局。孤儿持有的分支删不掉，
 * 影子表一直占着地方。没有登记行也就没有锁，不用问有没有上下文开着它：挂载要先读登记行。
 * 只认可写检出位开出来的那种后缀（{@link isCheckoutTableSetSuffix}）。适配器没有列目录的槽位时只看持有键与激活态行：
 * 那样的适配器建不出表集。
 */
export const findOrphanTableSets = async (
  executor: TransactionExecutor,
  adapter: Pick<LocalRxDBAdapter, 'listWorktreeTableSetSuffixes'>,
  records: readonly Pick<Worktree, 'tableSetSuffix'>[],
  heldKeys: ReadonlySet<string>
): Promise<string[]> => {
  const registered = new Set(records.map(record => record.tableSetSuffix));
  const activationRows = await executor
    .getRepository(WorkingTreeActivationState)
    .find({ where: { combinator: 'and', rules: [] } });
  const keyed = [...heldKeys, ...activationRows.map(row => row.id)].flatMap(key => {
    const suffix = WorktreeTableSet.suffixOfHolderKey(key);
    return suffix === null ? [] : [suffix];
  });
  const listed =
    typeof adapter.listWorktreeTableSetSuffixes === 'function' ?
      await adapter.listWorktreeTableSetSuffixes(executor)
    : [];
  return [...new Set([...keyed, ...listed])]
    .filter(suffix => isCheckoutTableSetSuffix(suffix) && !registered.has(suffix))
    .sort();
};

/**
 * 这些回收对象里有没有孤儿：它的锁此刻没人持有。
 *
 * @param mainDbName - 主库的 `config.dbName`
 * @param ids - {@link findReclaimCandidates} 结果里的 `candidates`
 * @returns 有孤儿
 *
 * @remarks
 * 锁还被持有，说明有上下文正开着它（另一个标签页、或本页一个还没关的视图），回收也拿不到锁，白开一笔事务。
 * 运行时没有 `navigator.locks` 时答 `false`：那里 `prune()` 自己就以 `locks_unavailable` 失败。
 */
export const hasOrphanedWorktree = async (mainDbName: string, ids: readonly string[]): Promise<boolean> => {
  if (ids.length === 0) return false;
  const locks = globalThis.navigator?.locks;
  if (!locks) return false;
  const { held = [] } = await locks.query();
  const heldNames = new Set(held.map(lock => lock.name));
  return ids.some(id => !heldNames.has(worktreeLockName(mainDbName, id)));
};
