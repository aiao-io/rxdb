/**
 * @fileoverview QueryCache 增量同步的元数据 diff 工具
 *
 * 比较远程和本地元数据，确定哪些实体需要：
 * - 拉取（本地缺失）
 * - 更新（本地过期）
 * - 跳过（本地已是最新）
 * - 可能的清理（本地孤立）
 *
 * @example
 * ```typescript
 * import { diffMetadata } from '@aiao/rxdb';
 *
 * const remoteMetadata = await remoteAdapter.fetchMetadata('Product', query);
 * const localMetadata = await localAdapter.getMetadataByIds('Product', remoteMetadata.map(m => m.id));
 *
 * const diff = diffMetadata(remoteMetadata, localMetadata);
 * // diff.missingIds - IDs to fetch from remote
 * // diff.staleIds - IDs to update from remote
 * // diff.freshIds - IDs that are up-to-date
 * // diff.orphanIds - IDs in local but not in remote result set
 * ```
 */

import type { QueryCacheEntityMetadata } from '../entity/metadata-options.interface.js';
import { isRemoteNewer } from './updated-at.utils.js';

/**
 * Diff 结果，包含分类后的实体 ID
 */
export interface DiffResult {
  /** 存在于远程但本地不存在——需要拉取 */
  missingIds: string[];
  /** 两者都存在但本地已过期——需要更新 */
  staleIds: string[];
  /** 两者都存在且本地是最新——跳过拉取 */
  freshIds: string[];
  /** 存在于本地但不在远程结果集中——可能已被删除或不在过滤范围内 */
  orphanIds: string[];
}

/**
 * 比较远程元数据与本地元数据，确定同步动作
 *
 * 两侧 `updatedAt` 都**解析成时间点**后比较，不按字符串字典序。
 * 时间复杂度：O(n)，n = max(remote.length, local.size)
 *
 * @param remoteMetadata - 来自远程 adapter 的元数据（id + updatedAt，任何 `Date.parse` 认得的时间串）
 * @param localMetadata - 来自本地 adapter 的 Map<id, updatedAt>
 * @returns 包含分类 ID 的 DiffResult
 *
 * @throws TypeError 任一侧的 `updatedAt` 无法解析成时间点时抛出。
 *
 * @example
 * ```typescript
 * const diff = diffMetadata(
 *   [{ id: '1', updatedAt: '2024-01-02T00:00:00Z' }],
 *   new Map([['1', '2024-01-01T00:00:00Z']])
 * );
 * // diff.staleIds = ['1'] - remote is newer
 * ```
 *
 * @remarks
 * 从前这里按字典序比 ISO 字符串，见 {@link isRemoteNewer} 中记录的失效场景。
 */
export function diffMetadata(
  remoteMetadata: QueryCacheEntityMetadata[],
  localMetadata: Map<string, string>
): DiffResult {
  const missingIds: string[] = [];
  const staleIds: string[] = [];
  const freshIds: string[] = [];

  // 记录被远程匹配到的本地 ID
  const matchedLocalIds = new Set<string>();

  // 遍历每条远程记录与本地比较
  for (const remote of remoteMetadata) {
    const localUpdatedAt = localMetadata.get(remote.id);

    if (localUpdatedAt === undefined) {
      // 本地不存在 → missing
      missingIds.push(remote.id);
    } else {
      matchedLocalIds.add(remote.id);

      // 比时间点，不比字符串：两侧的格式来自不同后端，不能假定一致（见函数 TSDoc）
      if (isRemoteNewer(remote.updatedAt, localUpdatedAt, `diffMetadata: 实体 '${remote.id}' 的`)) {
        // 远程较新 → stale
        staleIds.push(remote.id);
      } else {
        // 本地相同或较新 → fresh
        freshIds.push(remote.id);
      }
    }
  }

  // 找出孤立 ID（本地存在但不在远程结果集中）
  const orphanIds: string[] = [];
  for (const localId of localMetadata.keys()) {
    if (!matchedLocalIds.has(localId)) {
      orphanIds.push(localId);
    }
  }

  return { missingIds, staleIds, freshIds, orphanIds };
}
