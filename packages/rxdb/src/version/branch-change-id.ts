/**
 * @fileoverview 分支分叉点（`rxdb_branch.fromChangeId`）的本地 / 远端 id 空间翻译
 *
 * `RxDBChange.id` 是**每端各自**的自增主键：同一条变更在本地是 17、在远端可能是 9042。
 * 两者的对应关系只由 `RxDBChange.remoteId` 记录（push 成功后回填，pull 落库时写入）——
 * `lastPushedChangeId` / `lastPullRemoteChangeId` 分列两个字段也正是因为这一点。
 *
 * `fromChangeId` 是一个 change id，因此跨端传输时**必须翻译**。原样透传的后果是静默的：
 * 落到对端后被 `switch-branch-actions` / `find-switch-branch-step` / `merge-branch`
 * 当本端 id 消费，分叉点变成一个碰巧存在的无关变更，切换与合并应用错误的变更区间。
 */

import type { IRepository } from '../repository/repository.interface.js';
import { RxDBError } from '../RxDBError.js';
import { RxDBChange } from '../system/change.js';

/** 本模块只依赖 change 仓库的 `find`，用最小接口收窄，便于在事务 executor 上复用。 */
type ChangeFinder = Pick<IRepository<typeof RxDBChange>, 'find'>;

const findOneChange = async (
  repository: ChangeFinder,
  field: 'id' | 'remoteId',
  value: number
): Promise<InstanceType<typeof RxDBChange> | undefined> => {
  const rows = await repository.find({
    where: { combinator: 'and', rules: [{ field, operator: '=', value }] },
    limit: 1
  });
  return rows[0];
};

/**
 * 本地分叉点 → 远端 change id。
 *
 * @param repository - 本地 `RxDBChange` 仓库
 * @param localFromChangeId - 本地分支的 `fromChangeId`
 * @returns 远端 id；分叉点尚未推送（`remoteId` 为空）时返回 `null`
 * @throws RxDBError 本地压根不存在这条变更 —— 这是分支表与变更表已经不一致，不能猜
 *
 * @remarks
 * 返回 `null` 表示「远端此刻确实不知道这个分叉点」，而不是「分叉点在根」。调用方要据此
 * 决定是否在实体变更推送完成后重推一次分支，见 {@link pushBranch}。
 */
export const toRemoteFromChangeId = async (
  repository: ChangeFinder,
  localFromChangeId: number
): Promise<number | null> => {
  const change = await findOneChange(repository, 'id', localFromChangeId);
  if (!change) {
    throw new RxDBError(`分支分叉点翻译失败：本地不存在 RxDBChange id=${localFromChangeId}，分支表与变更表已不一致`);
  }
  return change.remoteId ?? null;
};

/**
 * 远端分叉点 → 本地 change id。
 *
 * @param repository - 本地 `RxDBChange` 仓库（事务内请传 executor 作用域的那一份）
 * @param remoteFromChangeId - 远端分支行上的 `fromChangeId`
 * @returns 本地 id；对应的变更尚未拉到本地时返回 `null`
 *
 * @remarks
 * 返回 `null` 时**不可**退化成 `null`/`0` 写进本地分支行：`find-switch-branch-step` 会把它
 * 当「分叉于根」处理，切换分支时应用的区间从第一条变更起算。调用方应跳过该分支，
 * 等分叉点变更拉到本地后的下一轮再建。
 */
export const toLocalFromChangeId = async (
  repository: ChangeFinder,
  remoteFromChangeId: number
): Promise<number | null> => {
  const change = await findOneChange(repository, 'remoteId', remoteFromChangeId);
  return change?.id ?? null;
};
