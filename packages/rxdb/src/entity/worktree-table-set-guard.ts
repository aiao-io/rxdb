/**
 * @fileoverview 写之前核对实体是不是在本实例此刻挂的那套表上建出、读出的（US-314 B2.4）。
 *
 * @remarks
 * 公开写入口（门面 Repository 的 create / update / remove 与 `EntityManager.mutations`）都在发出写之前过这一道，
 * 与只读守卫同一层。执行器上的写（`executor.getRepository(...)`、`executor.mutations(...)`）不过：那是事务里的内部写，
 * 实体就是在这笔事务里读出、建出的。
 */

import type { RxDB } from '../RxDB.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { WorktreeTableSetMismatchError } from '../system/worktree-table-set.js';
import type { EntityType } from './entity.interface.js';

/**
 * 要写的实体都得是在本实例此刻挂的那套表上建出、读出的。
 *
 * @param rxdb - 实例
 * @param entities - 要写的实体
 * @throws {@link WorktreeTableSetMismatchError} 有一条不是；一条都不写
 *
 * @remarks
 * 只比「这个实体的写落在哪套表」：没有副本的实体（不进影子表集的）无论挂哪套都写主表集，不拦；
 * 同一个检出位重新挂上是同一套表（后缀相同），也不拦。
 */
export const assertMountedTableSet = (rxdb: RxDB, entities: Iterable<object>): void => {
  const mounted = rxdb.worktreeTableSet;
  for (const entity of entities) {
    const metadata = getEntityMetadata(entity.constructor as EntityType);
    const recorded = getEntityStatus(entity).tableSet.ownerSuffixOf(metadata);
    const current = mounted.ownerSuffixOf(metadata);
    if (recorded === current) continue;
    throw new WorktreeTableSetMismatchError(
      `${metadata.namespace}.${metadata.name}`,
      recorded ?? null,
      current ?? null
    );
  }
};
