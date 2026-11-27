import {
  DataSelectionStorage,
  RESTORE_PENDING_KEY,
  commitDataLocation,
  readDataSelection,
  requireRestoreGeneration
} from './desktop-data-location';

export const RESTORE_LOCK = 'aiao-desktop-restore';

export interface DesktopRestoreHost {
  readonly storage: DataSelectionStorage & { removeItem(key: string): void };
  readonly discard: (generation: string) => Promise<void>;
  readonly prepare: (generation: string) => Promise<void>;
  readonly exclusiveWrite: <T>(task: () => Promise<T>) => Promise<T>;
  readonly generation: () => string;
}

function pendingGeneration(raw: string): string {
  const pending: unknown = JSON.parse(raw);
  if (!pending || typeof pending !== 'object') throw new Error('The pending restore record is damaged.');
  const record = pending as Record<string, unknown>;
  if (record['version'] !== 1 || typeof record['generation'] !== 'string')
    throw new Error('The pending restore record is damaged.');
  return requireRestoreGeneration(record['generation']);
}

/** 调用方持有恢复锁；不清理活动代际和用户保留的上一代。 */
export async function recoverPendingRestore(host: Pick<DesktopRestoreHost, 'storage' | 'discard'>): Promise<void> {
  const raw = host.storage.getItem(RESTORE_PENDING_KEY);
  if (raw === null) return;
  const pending = pendingGeneration(raw);
  const selection = readDataSelection(host.storage);
  if (pending !== selection.active && pending !== selection.previous) await host.discard(pending);
  host.storage.removeItem(RESTORE_PENDING_KEY);
}

/** 新目标完整可用后才切换；中断日志先于任何新目标写入，失败保留原数据。 */
export async function restoreDesktopData(host: DesktopRestoreHost, expected: string | null): Promise<void> {
  await recoverPendingRestore(host);
  const selection = readDataSelection(host.storage);
  if (selection.active !== expected) throw new Error('Desktop data changed in another tab. Reload before restoring.');
  const generation = requireRestoreGeneration(host.generation());
  if (generation === selection.active || generation === selection.previous)
    throw new Error('The restore target is already in use.');
  host.storage.setItem(RESTORE_PENDING_KEY, JSON.stringify({ version: 1, generation }));
  try {
    await host.prepare(generation);
    await host.exclusiveWrite(async () => commitDataLocation(host.storage, expected, generation));
  } catch (error) {
    try {
      await recoverPendingRestore(host);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${String(error)} Temporary restore data needs cleanup; retry when storage is available.`,
        { cause: cleanupError }
      );
    }
    throw error;
  }
  try {
    host.storage.removeItem(RESTORE_PENDING_KEY);
  } catch {
    // 指针已成功提交；下次清理只移除日志，不删除已激活的数据。
  }
}
