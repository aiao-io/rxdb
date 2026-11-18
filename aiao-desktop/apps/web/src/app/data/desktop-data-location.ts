/** 活动数据指针是单个 localStorage 值，更新它才算完成恢复。 */
export const DATA_LOCATION_KEY = 'aiao-desktop:data-location';
export const RESTORE_PENDING_KEY = 'aiao-desktop:restore-pending';

export interface DesktopDataSelection {
  readonly active: string | null;
  readonly previous: string | null;
}

export interface DesktopDataLocation {
  readonly generation: string | null;
  readonly databaseName: string;
  readonly filesRoot: string;
}

export interface DataSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const validGeneration = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && /^[a-f0-9]{12}$/.test(value));

/** 只接受本产品生成的代际名称，不能把任意路径作为恢复或清理目标。 */
export function dataLocation(generation: string | null): DesktopDataLocation {
  if (!validGeneration(generation)) throw new Error('The desktop data location is invalid.');
  const suffix = generation === null ? '' : `-${generation}`;
  return { generation, databaseName: `aiao-desktop${suffix}`, filesRoot: `aiao-desktop-files${suffix}` };
}

/** 恢复只写新代际，默认库（null）不是合法目标。 */
export function requireRestoreGeneration(value: unknown): string {
  if (typeof value !== 'string' || !validGeneration(value)) throw new Error('The desktop restore target is invalid.');
  return value;
}

/** 无记录表示已发布版本的默认位置；存在但读不懂时明确失败。 */
export function readDataSelection(storage: Pick<DataSelectionStorage, 'getItem'>): DesktopDataSelection {
  const raw = storage.getItem(DATA_LOCATION_KEY);
  if (raw === null) return { active: null, previous: null };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('The desktop data selection is damaged.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The desktop data selection is damaged.');
  const selection = value as Record<string, unknown>;
  if (selection['version'] !== 1 || !validGeneration(selection['active']) || !validGeneration(selection['previous']))
    throw new Error('The desktop data selection is damaged or uses an unsupported version.');
  return { active: selection['active'], previous: selection['previous'] };
}

/** 调用方已持有恢复锁且新目标完整；一次指针写入保留上一代，失败不切换。 */
export function commitDataLocation(storage: DataSelectionStorage, expected: string | null, generation: string): void {
  requireRestoreGeneration(generation);
  const selection = readDataSelection(storage);
  if (selection.active !== expected)
    throw new Error('The desktop data changed in another tab. Reload before restoring.');
  if (generation === expected) throw new Error('The restore target is already active.');
  storage.setItem(DATA_LOCATION_KEY, JSON.stringify({ version: 1, active: generation, previous: selection.active }));
}
