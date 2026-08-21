/**
 * @fileoverview 版本管理器的纯函数工具集
 *
 * 从 {@link VersionManager} 抽出的无状态辅助函数，供同步/撤销流程复用。
 */

import { RxDBPartialSyncError } from '../RxDBError.js';
import type { SyncRepositoryResult } from './sync-repository.js';

const getPositiveSafeInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

/**
 * 从变更事件里提取数字 id。
 *
 * @param change - 变更事件，优先取 `change.id`，缺失时回退到 `change.patch.id`
 * @returns 正整数 id，无法提取时返回 null
 */
export const getRxDBChangeEventId = (change: { id: unknown; patch?: unknown }): number | null => {
  const eventId = getPositiveSafeInteger(change.id);
  if (eventId !== null) return eventId;
  if (typeof change.patch !== 'object' || change.patch === null || !('id' in change.patch)) return null;
  return getPositiveSafeInteger(change.patch.id);
};

/**
 * 取一组变更里最早的 `recordAt` 时间。
 *
 * @param changes - 变更数组
 * @returns 最早的有效 `recordAt`，没有有效记录时返回 null
 */
export const getEarliestRecordAt = (changes: readonly { recordAt?: unknown }[]): Date | null => {
  let earliest: Date | null = null;
  for (const change of changes) {
    if (!(change.recordAt instanceof Date) || !Number.isFinite(change.recordAt.getTime())) continue;
    if (earliest === null || change.recordAt.getTime() < earliest.getTime()) {
      earliest = change.recordAt;
    }
  }
  return earliest;
};

/** 一次仓库同步是否改写了本地实体数据（undo 历史边界因此失效） */
export const hasSyncedData = (result: SyncRepositoryResult | undefined): boolean =>
  result?.historyInvalidated === true || (result?.pushResult?.pushed ?? 0) > 0;

/**
 * 取出失败项里携带的部分进度。
 *
 * @remarks
 * 仓库在失败前可能已经提交了部分结果，它只存在于 {@link RxDBPartialSyncError.result}。
 * 忽略它会让「远端数据已落库但 undo 边界没推进」的状态逃过检查。
 */
export const partialResultOf = (error: Error | undefined): SyncRepositoryResult | undefined =>
  error instanceof RxDBPartialSyncError ? (error.result as SyncRepositoryResult) : undefined;
