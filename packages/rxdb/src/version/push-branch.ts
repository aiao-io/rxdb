import { toRemoteFromChangeId } from './branch-change-id.js';
import type { VersionManager } from './VersionManager.js';

export interface PushBranchResult {
  synced: number;
  skipped: string[];
  /**
   * 分叉点变更还没有 `remoteId`，本次只能带 `fromChangeId: null` 上行。
   *
   * 调用方应在实体变更推送完成、分叉点拿到 `remoteId` 之后重推一次分支，
   * 把远端那一行补全。
   */
  forkPointPending: boolean;
}

/**
 * 将当前激活分支推送到远程
 *
 * 规则:
 * 1. 不推送 id='main' 的分支
 * 2. 不修改远程分支的 activated 属性（由 SQL 函数保证）
 * 3. `fromChangeId` 翻译成远端 id 后再上行（见 {@link toRemoteFromChangeId}）
 */
export async function pushBranch(vm: VersionManager): Promise<PushBranchResult> {
  const branch = await vm.getCurrentBranch();
  if (!branch || branch.id === 'main') {
    return { synced: 0, skipped: branch ? ['main'] : [], forkPointPending: false };
  }

  const { adapter: remoteAdapter } = await vm.getRemoteRepositories();

  if (!remoteAdapter.pushBranches) {
    return { synced: 0, skipped: [], forkPointPending: false };
  }

  const { branchRepository, changeRepository } = await vm.getLocalRepositories();

  // 本地 change id 对远端毫无意义，必须翻译成 remoteId 再上行。
  // 分叉点还没推上去时只能发 null（远端此刻确实不知道这个分叉点），并把这件事报给调用方。
  const localFromChangeId = branch.fromChangeId ?? null;
  const remoteFromChangeId =
    localFromChangeId === null ? null : await toRemoteFromChangeId(changeRepository, localFromChangeId);
  const forkPointPending = localFromChangeId !== null && remoteFromChangeId === null;

  const branchData: Record<string, unknown> = {
    id: branch.id,
    fromChangeId: remoteFromChangeId,
    local: branch.local,
    remote: true,
    parentId: branch.parentId
  };

  const result = await remoteAdapter.pushBranches([branchData]);

  // 推送成功后更新本地分支的 remote 标记
  if (result.synced > 0 && !branch.remote) {
    await branchRepository.update(branch, { remote: true, updatedAt: new Date() });
  }

  return { ...result, forkPointPending };
}
