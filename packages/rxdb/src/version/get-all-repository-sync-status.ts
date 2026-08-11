/**
 * @fileoverview 获取所有仓库的同步状态
 *
 * 提供查询所有仓库同步状态的功能，支持按 syncType、启用状态和待处理变更进行过滤。
 */

import type { RxDB } from '../RxDB.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import {
  getRepositorySyncStatus,
  type RepositorySyncStatus,
  type SyncTypeValue
} from './get-repository-sync-status.js';

/**
 * getAllRepositorySyncStatus 的过滤选项
 */
export interface GetAllRepositorySyncStatusFilter {
  /**
   * 按同步类型过滤
   * 如果提供，则仅返回这些同步类型的仓库
   */
  syncType?: SyncTypeValue[];

  /**
   * 按启用状态过滤
   * 如果为 true，则仅返回启用的仓库
   * 如果为 false，则仅返回禁用的仓库
   * 如果为 undefined，则返回全部
   */
  enabled?: boolean;

  /**
   * 按待处理变更过滤
   * 如果为 true，则仅返回 pushableCount > 0 或 pullableCount > 0 的仓库
   * 如果为 false，则仅返回没有待处理变更的仓库
   * 如果为 undefined，则返回全部
   */
  hasPendingChanges?: boolean;
}

/**
 * 获取所有仓库的同步状态
 *
 * 遍历所有注册实体并查询它们的同步状态，支持按 syncType、启用状态和待处理变更进行过滤。
 *
 * @param rxdb - RxDB 实例
 * @param filter - 可选的过滤条件
 * @returns 仓库同步状态数组
 *
 * @example
 * ```typescript
 * // 获取所有仓库状态
 * const statuses = await getAllRepositorySyncStatus(rxdb);
 *
 * // 仅获取启用的仓库
 * const statuses = await getAllRepositorySyncStatus(rxdb, {
 *   enabled: true
 * });
 *
 * // 仅获取有待处理变更的仓库
 * const statuses = await getAllRepositorySyncStatus(rxdb, {
 *   hasPendingChanges: true
 * });
 *
 * // 仅获取 full/remote 同步类型的仓库
 * const statuses = await getAllRepositorySyncStatus(rxdb, {
 *   syncType: ['full', 'remote']
 * });
 * ```
 */
export async function getAllRepositorySyncStatus(
  rxdb: RxDB,
  filter?: GetAllRepositorySyncStatusFilter
): Promise<RepositorySyncStatus[]> {
  // 1. 从配置中获取所有实体
  const entities = rxdb.config.entities;
  const allStatuses: RepositorySyncStatus[] = [];

  // 2. 查询每个实体的状态
  for (const EntityClass of entities) {
    const metadata = getEntityMetadata(EntityClass);
    const namespace = metadata.namespace;
    const entity = metadata.name;

    // 获取该实体的状态
    const status = await getRepositorySyncStatus(rxdb, namespace, entity);
    allStatuses.push(status);
  }

  // 3. 应用过滤条件
  let filteredStatuses = allStatuses;

  // 按 syncType 过滤
  if (filter?.syncType && filter.syncType.length > 0) {
    filteredStatuses = filteredStatuses.filter(status => filter.syncType!.includes(status.syncType));
  }

  // 按 enabled 状态过滤
  if (filter?.enabled !== undefined) {
    filteredStatuses = filteredStatuses.filter(status => status.enabled === filter.enabled);
  }

  // 按 hasPendingChanges 过滤
  if (filter?.hasPendingChanges !== undefined) {
    if (filter.hasPendingChanges) {
      // 仅返回有待处理变更的仓库
      filteredStatuses = filteredStatuses.filter(status => status.pushableCount > 0 || status.pullableCount > 0);
    } else {
      // 仅返回没有待处理变更的仓库
      filteredStatuses = filteredStatuses.filter(status => status.pushableCount === 0 && status.pullableCount === 0);
    }
  }

  return filteredStatuses;
}
