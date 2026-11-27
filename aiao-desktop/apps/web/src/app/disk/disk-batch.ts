import { DiskPath, isRequiredDiskPath, isWithin } from './disk-path';
import type { DiskStore } from './disk-store';

export interface DiskBatchRecord {
  readonly version: 1;
  readonly targets: readonly DiskPath[];
}

export interface DiskBatchJournal {
  read(): Promise<unknown>;
  write(record: DiskBatchRecord): Promise<void>;
  clear(): Promise<void>;
}

function batchRecord(value: unknown): DiskBatchRecord {
  if (!value || typeof value !== 'object') throw new Error('The interrupted file operation record is invalid.');
  const record = value as Record<string, unknown>;
  const targets = record['targets'];
  if (record['version'] !== 1 || !Array.isArray(targets) || !targets.length || !targets.every(validTarget))
    throw new Error('The interrupted file operation has invalid or protected targets.');
  if (targets.some((path, index) => targets.some((other, otherIndex) => index !== otherIndex && isWithin(path, other))))
    throw new Error('The interrupted file operation has overlapping targets.');
  return { version: 1, targets };
}

function validPart(part: unknown): part is string {
  if (typeof part !== 'string' || !part.trim() || part === '.' || part === '..') return false;
  return !Array.from(part).some(
    character =>
      character === '/' || character === '\\' || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  );
}

function validTarget(value: unknown): value is DiskPath {
  if (!Array.isArray(value) || !value.length || !value.every(validPart)) return false;
  return !isRequiredDiskPath(value);
}

/** 调用方持有磁盘锁；未完成的批次只撤回本批预先登记的新目标。 */
export async function recoverDiskBatch(store: DiskStore, journal: DiskBatchJournal): Promise<boolean> {
  const raw = await journal.read();
  if (raw === null) return false;
  const record = batchRecord(raw);
  for (const path of record.targets) await store.remove(path);
  await journal.clear();
  return true;
}

export async function runDiskBatch<T>(
  store: DiskStore,
  journal: DiskBatchJournal,
  targets: readonly DiskPath[],
  write: () => Promise<T>
): Promise<T> {
  await recoverDiskBatch(store, journal);
  const record = batchRecord({ version: 1, targets });
  for (const path of targets)
    if (await store.kindOf(path)) throw new Error(`The file operation target already exists: ${path.join('/')}`);
  await journal.write(record);
  try {
    const result = await write();
    await journal.clear();
    return result;
  } catch (error) {
    try {
      await recoverDiskBatch(store, journal);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${String(error)} File operation cleanup will resume when storage is available.`,
        { cause: cleanupError }
      );
    }
    throw error;
  }
}
