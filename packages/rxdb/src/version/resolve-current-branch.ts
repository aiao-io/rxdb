import type { RxDB } from '../RxDB.js';
import { RxDBBranch } from '../system/branch.js';
import type { LocalRxDBBranchRepository } from '../system/types.local.js';

/**
 * 解析「当前分支」：取激活分支，没有则激活 `main`，`main` 也不存在则建一个。
 *
 * @param branchRepository - 分支仓库
 * @param rxdb - RxDB 实例，只用于 `entityManager.instantiate`
 *
 * @remarks
 * 从 {@link VersionManager.getCurrentBranch} 里抽出来，是为了让**同一段逻辑**能在两处复用：
 *
 * - `getCurrentBranch` 冷路径：拿 executor 作用域的仓库调它，把「查 → 建」关进一个事务窗口；
 * - `create_branch`：它自己已经开着事务，不能再调 `version.getCurrentBranch()` ——
 *   那会经绑在适配器上的仓库重新入队，排在自己这个事务后面（队列并发度 1），永久挂起。
 *
 * 所以这里**只**接收仓库，不接收 `VersionManager`：谁传进来的仓库属于哪个事务，
 * 这段逻辑就跑在哪个事务里，函数本身不做任何入队决策。
 */
export const resolve_current_branch = async (
  branchRepository: LocalRxDBBranchRepository,
  rxdb: RxDB
): Promise<InstanceType<typeof RxDBBranch>> => {
  const activeBranch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      },
      limit: 1
    })
  )[0];

  if (activeBranch) {
    return activeBranch;
  }

  const mainBranch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'main' }]
      },
      limit: 1
    })
  )[0];

  if (mainBranch) {
    mainBranch.activated = true;
    await branchRepository.update(mainBranch, { activated: true });
    return mainBranch;
  }

  const branch = rxdb.entityManager.instantiate(RxDBBranch);
  branch.id = 'main';
  branch.activated = true;
  branch.local = true;
  branch.remote = false;
  await branchRepository.create(branch);
  return branch;
};
