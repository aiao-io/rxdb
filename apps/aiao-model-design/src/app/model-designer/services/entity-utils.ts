import type { EntityBase } from '@aiao/rxdb';
import { generateKeyBetween, generateKeysBetween } from '@aiao/utils';

/**
 * 传统字符串比较排序：兼容 fractional-indexing 生成的字典序键
 *
 * @example
 * items.sort(compareSortOrder)
 */
export function compareSortOrder(a: { sortOrder: string }, b: { sortOrder: string }): number {
  if (a.sortOrder < b.sortOrder) return -1;
  if (a.sortOrder > b.sortOrder) return 1;
  return 0;
}

/**
 * 计算下一个排序键（追加到列表末尾）
 *
 * 使用 fractional-indexing 在最后一个键之后生成新键，
 * 无需修改已有记录的 sortOrder。
 */
export function nextSortOrder(items: readonly { sortOrder: string }[]): string {
  if (items.length === 0) return generateKeyBetween(null, null);
  const sorted = [...items].sort(compareSortOrder);
  const last = sorted[sorted.length - 1].sortOrder;
  return generateKeyBetween(last || null, null);
}

/**
 * 在两个相邻项之间生成排序键
 *
 * @param prev - 前一项的 sortOrder（null 表示列表开头）
 * @param next - 后一项的 sortOrder（null 表示列表末尾）
 */
export function sortOrderBetween(prev: string | null | undefined, next: string | null | undefined): string {
  return generateKeyBetween(prev || null, next || null);
}

/**
 * 乐观更新：先应用变更再持久化，失败时自动回滚
 *
 * @param entity - 目标实体
 * @param changes - 要应用的字段变更
 */
export async function optimisticUpdate<T extends EntityBase>(
  entity: T,
  changes: Partial<Pick<T, Extract<keyof T, string>>>
): Promise<void> {
  const prev = structuredClone(
    Object.fromEntries(Object.keys(changes).map(k => [k, (entity as Record<string, unknown>)[k]]))
  );
  Object.assign(entity, changes);
  try {
    await entity.save();
  } catch (e) {
    Object.assign(entity, prev);
    throw e;
  }
}

/**
 * 根据 ID 数组重新排序实体的 sortOrder
 *
 * 使用 fractional-indexing 批量生成新键，仅更新发生变化的项。
 *
 * @param all - 所有实体
 * @param ids - 按目标顺序排列的实体 ID 数组
 */
export async function reorderItems<T extends EntityBase & { sortOrder: string }>(
  all: readonly T[],
  ids: string[]
): Promise<void> {
  const keys = generateKeysBetween(null, null, ids.length);
  const changed: { item: T; prev: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    const item = all.find(e => e.id === ids[i]);
    if (item && item.sortOrder !== keys[i]) {
      changed.push({ item, prev: item.sortOrder });
      item.sortOrder = keys[i];
    }
  }
  try {
    await Promise.all(changed.map(({ item }) => item.save()));
  } catch (e) {
    for (const { item, prev } of changed) item.sortOrder = prev;
    throw e;
  }
}
