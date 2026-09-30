import { EntityStaticType, MAIN_BRANCH_ID, RxDBBranch } from '@aiao/rxdb';
import type { SyncManager } from './SyncManager.js';

/**
 * 沿 `parentId` 向上走分支链所需的最小仓库能力。
 *
 * @remarks
 * 写成结构化接口，是为了让绑在适配器上的本地仓库与事务执行器给出的仓库都接得住——
 * 分支物化来源要在切换事务里按同一口径重算血缘，而绑在适配器上的仓库在那里会排在
 * 那笔事务自己后面，死锁。
 */
export interface BranchLineageReader {
  /**
   * 按条件查分支
   *
   * @param options - 查询选项
   * @returns 命中的分支行
   */
  find(options: EntityStaticType<typeof RxDBBranch, 'findOptions'>): Promise<RxDBBranch[]>;
}

/**
 * 获取当前分支及其所有祖先分支的 ID 列表
 *
 * @returns [currentBranch, parent, grandparent, ...] 例如 ['dev', 'main']
 */
export async function getAncestorBranchIds(sm: SyncManager, branchId: string): Promise<string[]> {
  if (branchId === MAIN_BRANCH_ID) return [branchId];
  const { adapter } = await sm.getLocalRepositories();
  return ancestorBranchIdsFrom(adapter.getRepository(RxDBBranch), branchId);
}

/**
 * 用给定的分支仓库算 `branchId` 及其全部祖先——{@link getAncestorBranchIds} 的本体。
 *
 * @param branchRepository - 见 {@link BranchLineageReader}
 * @param branchId - 起点分支
 * @returns [branchId, parent, grandparent, ...]
 *
 * @remarks
 * 拆出来给分支物化来源用：冻结意图时在事务外算一次，屏障里再用执行器的仓库算一次比对，
 * 两处必须与 pull 同一口径，否则「范围变没变」的判定本身就在漂。
 *
 * @internal
 */
export async function ancestorBranchIdsFrom(
  branchRepository: BranchLineageReader,
  branchId: string
): Promise<string[]> {
  const branchIds = [branchId];
  if (branchId === MAIN_BRANCH_ID) return branchIds;

  let currentId = branchId;
  const visited = new Set<string>([currentId]);

  while (currentId) {
    const branches = await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: currentId }]
      },
      limit: 1
    });

    const branch = branches[0];
    if (!branch?.parentId || visited.has(branch.parentId)) break;

    branchIds.push(branch.parentId);
    visited.add(branch.parentId);
    currentId = branch.parentId;
  }

  return branchIds;
}
