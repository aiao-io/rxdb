/**
 * @fileoverview 版本管理器的纯函数工具集
 *
 * 从 {@link VersionManager} 抽出的无状态辅助函数，供变更事件处理流程复用。
 *
 * @remarks
 * 同步侧那两个（`hasSyncedData` / `partialResultOf`）随 US-025 阶段 D 去了
 * `@aiao/rxdb-plugin-sync` 的 `sync-manager.utils.ts`：它们的形参是
 * `SyncRepositoryResult`，留在这里会让历史包反向依赖同步包。
 */

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
