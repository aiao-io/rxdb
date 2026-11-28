/**
 * @fileoverview 获取所有仓库的同步状态
 *
 * 提供查询所有仓库同步状态的功能，支持按 syncType、启用状态和待处理变更进行过滤。
 */

import { getEntityMetadata, isSystemEntity, repositoryKey, type RxDB } from '@aiao/rxdb';
import { repositorySyncStatusOf, type RepositorySyncStatus, type SyncTypeValue } from './get-repository-sync-status.js';
import { countPendingByRepository } from './pending-counts.js';

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
 * 待拉数一轮数清：远端身份核一次、登记信息问一次，远端适配器支持时全部仓库只数一次（US-236）；
 * 系统表不记变更日志，待拉恒为 0，不为它们问远端。
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

  // 2. 待拉数一轮数清（US-236）：此前逐个仓库各核一次远端身份、各问一次登记信息、各数一次日志。
  //    系统表不问远端：它们不带自己的 `sync`、跟随库级配置会被判成能拉取，却不记变更日志，远端日志里永远没有它们的行
  const consumers = entities
    .filter(EntityClass => !isSystemEntity(EntityClass))
    .map(EntityClass => getEntityMetadata(EntityClass));
  const pending = await countPendingByRepository(rxdb, consumers);

  // 3. 逐个仓库补上本地那一半（同步记录、待推数）；系统表的待拉恒为 0
  const allStatuses: RepositorySyncStatus[] = [];
  for (const EntityClass of entities) {
    const metadata = getEntityMetadata(EntityClass);
    const key = repositoryKey({ namespace: metadata.namespace, entity: metadata.name });
    allStatuses.push(await repositorySyncStatusOf(rxdb, metadata, async () => pending.get(key) ?? 0));
  }

  // 4. 应用过滤条件
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
