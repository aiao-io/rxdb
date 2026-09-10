import type { RuleGroup } from '../repository/query.interface.js';
import type { RxDBAdapterRemoteBase } from '../rxdb-adapter.js';
import type { RemoteChange } from '../system/system.interface.js';

/**
 * 一个仓库跨祖先分支拉取变更所需的全部参数。
 */
export interface AncestorPullRequest {
  /** 仓库命名空间 */
  namespace: string;

  /** 实体名 */
  entity: string;

  /** 水位线：只拉 id 大于它的变更 */
  sinceId: number;

  /** 本轮最多消费多少条 */
  limit: number;

  /** 行级过滤条件，`SyncType.Filter` 用；批量路径不支持，故为可选 */
  filter?: RuleGroup;
}

/**
 * 跨祖先分支拉取**单个仓库**的远端变更，合并成一条按 id 递增、长度不超过 `limit` 的序列。
 *
 * @param remoteAdapter - 远端适配器
 * @param request - 仓库标识、水位线、批量大小与可选行级过滤
 * @param branchIds - 当前分支及其全部祖先，见 `getAncestorBranchIds`
 * @returns 合并、排序、截断后的变更序列
 *
 * @remarks
 * **为什么必须逐祖先分支拉。** 分支是 patch 模型，不是快照模型：建分支时只写
 * `parentId` + `fromChangeId`，一条变更都不复制。所以 feature 分支上可见的数据 =
 * 父分支在分叉点之前的变更 + feature 自己的变更，而父分支那些记录**物理上仍然
 * 归属 `branchId='main'`**。`pullChanges` 的 `branchId` 是精确匹配（见其接口契约），
 * 只传当前分支就永远收不到别人推到 main 的更新 —— 且不会自愈：切回 main 时水位线
 * 换成了 `${ns}:${entity}:main` 这条**另一个**记录，那段区间从此跳过。
 *
 * **为什么合并后必须全局排序再截断。** 每个分支各自取满 `limit` 条，直接拼接会让
 * 某个分支的高 id 把共享水位线推过另一个分支尚未消费的低 id；那些变更此后都不再满足
 * `id > lastPullRemoteChangeId`，被永久跳过。排序后只消费前 `limit` 条，其余留给下一轮 ——
 * 调用方据 `length >= limit` 置 `hasMore` 继续循环。
 *
 * 单分支（在 main 上）时只发一次请求，与逐祖先的写法结果一致，不额外分支判断。
 */
export async function pullAncestorBranchChanges(
  remoteAdapter: RxDBAdapterRemoteBase,
  request: AncestorPullRequest,
  branchIds: readonly string[]
): Promise<RemoteChange[]> {
  const { namespace, entity, sinceId, limit, filter } = request;
  const repositoryFilter = [`${namespace}:${entity}`];

  const perBranch = await Promise.all(
    branchIds.map(branchId => remoteAdapter.pullChanges(sinceId, limit, repositoryFilter, filter, branchId))
  );

  return perBranch
    .flat()
    .sort((left, right) => left.id - right.id)
    .slice(0, limit);
}
