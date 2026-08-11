/**
 * 从数组中随机选择一个元素。
 *
 * @param array - 候选数组
 * @returns 随机元素；空数组返回 undefined
 */
export const randomArrayItem = <T>(array: readonly T[]): T | undefined =>
  array[Math.floor(Math.random() * array.length)];
