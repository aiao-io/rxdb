import type { VersionManager } from './VersionManager.js';

export interface PushBranchResult {
  synced: number;
  skipped: string[];
}

/**
 * 将当前激活分支推送到远程
 *
 * 规则:
 * 1. 不推送 id='main' 的分支
 * 2. 不修改远程分支的 activated 属性（由 SQL 函数保证）
 */
export async function pushBranch(vm: VersionManager): Promise<PushBranchResult> {
  const branch = await vm.getCurrentBranch();
  if (!branch || branch.id === 'main') {
    return { synced: 0, skipped: branch ? ['main'] : [] };
  }

  const { adapter: remoteAdapter } = await vm.getRemoteRepositories();

  if (!remoteAdapter.pushBranches) {
    return { synced: 0, skipped: [] };
  }

  const branchData: Record<string, unknown> = {
    id: branch.id,
    fromChangeId: branch.fromChangeId,
    local: branch.local,
    remote: true,
    parentId: branch.parentId
  };

  const result = await remoteAdapter.pushBranches([branchData]);

  // 推送成功后更新本地分支的 remote 标记
  if (result.synced > 0 && !branch.remote) {
    const { branchRepository } = await vm.getLocalRepositories();
    await branchRepository.update(branch, { remote: true, updatedAt: new Date() });
  }

  return result;
}
