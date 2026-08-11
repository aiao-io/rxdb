/**
 * 将数组分割成指定大小的数组块
 * 当数组长度不能被分割大小整除时，最后一个块将包含剩余的元素
 *
 * @template T - 数组元素的类型
 * @param array - 要分割的数组（只读，不能为null/undefined）
 * @param size - 每个块的大小，必须是正整数
 * @returns 分割后的数组块组成的新数组
 * @throws {TypeError} 当array不是数组或size不是数字时抛出
 * @throws {RangeError} 当size不是正数时抛出
 * @example
 * chunk(['a', 'b', 'c', 'd'], 2);
 * // 返回 [['a', 'b'], ['c', 'd']]
 */
export const chunk = <T>(array: readonly T[], size: number): T[][] => {
  if (!Number.isFinite(size)) {
    throw new TypeError(`chunk size must be a finite number, got ${size}`);
  }

  // 将size转换为整数
  const chunkSize = Math.floor(size);
  if (chunkSize <= 0) {
    throw new RangeError(`chunk size must be greater than 0, got ${size}`);
  }

  const result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
};
