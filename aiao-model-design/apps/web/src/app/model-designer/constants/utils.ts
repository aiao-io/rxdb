/**
 * 切换数组中的项
 * 如果项存在则移除，否则添加
 * @param array 原始数组
 * @param item 要切换的项
 * @returns 新数组
 */
export function toggleArrayItem<T>(array: readonly T[], item: T): T[] {
  const result = [...array];
  const i = result.indexOf(item);
  if (i >= 0) result.splice(i, 1);
  else result.push(item);
  return result;
}
