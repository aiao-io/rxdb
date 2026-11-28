import { repositoryKey, RxDBError, type RepositoryIdentifier, type RxDBEntityId } from '@aiao/rxdb';

/**
 * 分区清理时有本地行删不掉：本地别的行还经外键引用着它们（US-033）
 *
 * @remarks
 * 外键是 `RESTRICT` / `NO ACTION` 时，删被引用的行会让整个事务失败、整批回滚。清理因此只删没被引用的行，
 * 被引用的行留在本机，原因记成这个错误进拉取结果的 `failures`，别的行与别的分区照常同步：
 *
 * - 分区被撤销、换了同步规则或换了远端：留下的行连同映射与这个作用域的进度行一起留着，
 *   之后每次拉取都会再清一次，引用它们的行没了就删得掉；
 * - 拉取途中离开分区（远端删除、移出分区、不再匹配同步规则）：留下的行保留在这个分区的映射里，
 *   等这个分区下一次整体清理时再删。
 *
 * @example
 * ```ts
 * const { failures } = await rxdb.syncManager.pull();
 * for (const { error } of failures) {
 *   if (error instanceof RxDBBucketCleanupBlockedError) {
 *     console.warn(`${error.entityIds.length} 行还被引用，暂时留在本机`, error.referencedBy);
 *   }
 * }
 * ```
 */
export class RxDBBucketCleanupBlockedError extends RxDBError {
  constructor(
    /** 要清理的仓库 */
    readonly repository: RepositoryIdentifier,
    /** 要清理的分区 */
    readonly bucket: string,
    /** 留在本机的行的 id */
    readonly entityIds: readonly RxDBEntityId[],
    /** 引用它们的仓库 */
    readonly referencedBy: readonly RepositoryIdentifier[]
  ) {
    super(
      `Bucket ${bucket} of ${repositoryKey(repository)}: kept ${entityIds.length} local row(s) because rows of ` +
        `${referencedBy.map(repositoryKey).join(', ')} still reference them through a RESTRICT / NO ACTION foreign key; ` +
        'they are removed by a later cleanup once nothing references them'
    );
    this.name = 'RxDBBucketCleanupBlockedError';
    Object.setPrototypeOf(this, RxDBBucketCleanupBlockedError.prototype);
  }
}
