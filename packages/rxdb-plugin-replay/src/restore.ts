import type { RxDB } from '@aiao/rxdb';
import type { WorkingTreeRestoreResult } from '@aiao/rxdb-plugin-working-tree';
import { RxDBReplayError } from './errors.js';
import type { ReplayRestoreRejection, ReplayRestoreResult } from './types.js';

/**
 * 工作树插件在宿主插件索引里的名字（与 `@aiao/rxdb-plugin-working-tree` 的 `WORKING_TREE_CAPABILITY` 同值）。
 *
 * @remarks
 * 抄一份字面量而不是 import 那个常量：工作树是可选 peer，这里只能有类型依赖，值依赖会让没装它的应用打包失败。
 */
export const WORKING_TREE_PLUGIN_NAME = 'workingTree';

// 键取工作树的被拒原因：它新增一种原因时这里缺提示、`restoreToCommit` 的返回也对不上 `ReplayRestoreResult`，两处都编不过
const RESTORE_HINTS: Readonly<Record<Extract<WorkingTreeRestoreResult, { ok: false }>['reason'], string>> = {
  conflict: 'The working tree changed while restoring. Try again.',
  dirty_working_tree: 'There are uncommitted changes. Commit or discard them before restoring.',
  incompatible_schema: 'This commit was written by an incompatible schema version and cannot be restored.',
  unreachable_target: 'This commit is not on the current branch history.'
};

/**
 * `restoreToCommit()` 被拒时给用户看的一句英文提示（`specs/005-us-909-session-replay/research.md` D8）。
 *
 * @param reason - `ReplayRestoreResult` 的 `reason`
 */
export const replayRestoreHint = (reason: ReplayRestoreRejection): string => RESTORE_HINTS[reason];

/** 这个库上装没装工作树插件（装了不等于启用，未启用由门面自己抛）。 */
export const hasWorkingTree = (rxdb: RxDB): boolean => rxdb.getPlugins(WORKING_TREE_PLUGIN_NAME).length > 0;

/**
 * 取此刻的工作树凭据，把工作树恢复到 `commitId`。
 *
 * @remarks
 * 凭据必须现取：回放里的标记是录制当时的事，拿那时的 HEAD 去 CAS 只会稳定地撞 `conflict`。
 * `status()` 与 `restore()` 之间若有人写入，CAS 照样拒成 `conflict`，由用户重试。
 *
 * @throws `RxDBReplayError('working_tree_unavailable')`：没装工作树插件；门面抛的错误原样透传
 */
export const restoreToCommit = async (rxdb: RxDB, commitId: string): Promise<ReplayRestoreResult> => {
  if (!hasWorkingTree(rxdb)) {
    throw new RxDBReplayError(
      'working_tree_unavailable',
      'restoreToCommit() needs @aiao/rxdb-plugin-working-tree installed on this database'
    );
  }
  const status = await rxdb.workingTree.status();
  return rxdb.workingTree.restore(
    { commitId },
    {
      expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision
    }
  );
};
