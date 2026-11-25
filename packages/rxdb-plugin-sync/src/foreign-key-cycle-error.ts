import { type RepositoryIdentifier, repositoryKey, RxDBError } from '@aiao/rxdb';
import type { DependencyCycle } from './dependency-graph.js';

/**
 * 外键成环的仓库推拉不了的原因（US-038）
 *
 * - `unbreakable`：环上全是非空外键，排不出写入顺序。把其中一侧的外键改成可空，就能先写空、再补写
 * - `remote-unsupported`：同一批里有互相引用的行，要先写空、再补写，远端适配器不支持
 *   （`supportsDeferredForeignKeys` 为 `false`，例如服务端还没升级）
 * - `pull-unsupported-member`：环上有按条件（`Filter`）或按授权分区同步的成员，拉取补不齐环内的引用
 */
export type RxDBForeignKeyCycleReason = 'unbreakable' | 'remote-unsupported' | 'pull-unsupported-member';

/**
 * 外键成环的仓库没有被同步（US-038）
 *
 * @remarks
 * 只让环上的仓库与它的下游失败（下游报 `RxDBDependencyFailedError`），环外的仓库照常推拉。
 * 远端不支持时不发请求、不对齐本地：本地的行原样保留，待推的变更下一轮照样待推。
 *
 * @example
 * ```ts
 * const { failures } = await rxdb.syncManager.push();
 * for (const { error } of failures) {
 *   if (error instanceof RxDBForeignKeyCycleError && error.reason === 'unbreakable') {
 *     console.warn(error.message); // 指出环路，提示把一侧外键改成可空
 *   }
 * }
 * ```
 */
export class RxDBForeignKeyCycleError extends RxDBError {
  constructor(
    /** 没有被同步的仓库 */
    readonly repository: RepositoryIdentifier,
    /** 它所在的环 */
    readonly cycle: DependencyCycle,
    /** 原因 */
    readonly reason: RxDBForeignKeyCycleReason,
    /** 补充说明：要补写的外键、不支持的成员 */
    detail?: string
  ) {
    super(describeCycleFailure(repository, cycle, reason, detail));
    this.name = 'RxDBForeignKeyCycleError';
    Object.setPrototypeOf(this, RxDBForeignKeyCycleError.prototype);
  }
}

function describeCycleFailure(
  repository: RepositoryIdentifier,
  cycle: DependencyCycle,
  reason: RxDBForeignKeyCycleReason,
  detail: string | undefined
): string {
  const members = cycle.members.map(repositoryKey).join(', ');
  const head = `Repository ${repositoryKey(repository)} was not synced: its foreign keys form a cycle (${members})`;
  const suffix = detail ? `: ${detail}` : '';
  if (reason === 'unbreakable') {
    return (
      `${head} with no nullable foreign key to write first (${cycle.path.join(' -> ')}). ` +
      `Make one side of the cycle nullable so it can be written empty and filled in afterwards${suffix}`
    );
  }
  if (reason === 'remote-unsupported') {
    return `${head}; rows in one batch reference each other and the remote adapter cannot defer foreign keys${suffix}`;
  }
  return `${head}; a cycle member is synced by filter or by bucket, so a pull cannot close the cycle${suffix}`;
}
