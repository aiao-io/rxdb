import type { GitStatus } from '../../services/git/git-protocol';
import { branchBaseOf, fetchedBranchesOf, type GithubRepositoryRecord } from '../../services/github-repository';

export type GithubSyncAction = 'refresh' | 'fetch' | 'pull' | 'push' | 'publish' | 'detached';

/** 优先整合已发现的远端提交，只有本地有提交时才允许推送或发布。 */
export function syncActionOf(
  record: GithubRepositoryRecord | null,
  status: Pick<GitStatus, 'branch' | 'head'> | null
): GithubSyncAction {
  if (!record?.owner || !record.repo) return 'refresh';
  if (!status) return 'fetch';
  const { branch, head } = status;
  if (branch === 'detached') return 'detached';
  const base = branchBaseOf(record, branch);
  const observed = fetchedBranchesOf(record).find(item => item.branch === branch);
  if (observed?.head && observed.head !== base?.head) return 'pull';
  if (!head) return 'fetch';
  if (observed?.head === null || (!base && (record.remoteHead || record.branchBases?.length))) return 'publish';
  return base?.localHead !== undefined && base.localHead !== head ? 'push' : 'fetch';
}
