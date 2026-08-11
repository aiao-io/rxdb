import { RxDBBranch } from '../system/branch.js';
import type { VersionManager } from './VersionManager.js';

/**
 * 获取当前分支及其所有祖先分支的 ID 列表
 *
 * @returns [currentBranch, parent, grandparent, ...] 例如 ['dev', 'main']
 */
export async function getAncestorBranchIds(vm: VersionManager, branchId: string): Promise<string[]> {
  const branchIds = [branchId];
  if (branchId === 'main') return branchIds;

  const { adapter } = await vm.getLocalRepositories();
  const branchRepository = adapter.getRepository(RxDBBranch);

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
