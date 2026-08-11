/**
 * 计算多个数组的交集，返回所有输入数组中都存在的元素
 * 使用严格相等运算符 (===) 进行元素比较，结果数组保留第一个数组中的元素顺序
 * 如果输入单个数组，则返回该数组的去重版本
 *
 * @param arrays - 任意数量的数组
 * @returns 包含所有输入数组共有元素的新数组（自动去重）
 * @example
 * intersection([1, 2, 3], [2, 3, 4], [2, 5]);
 * // 返回 [2]（多数组交集）
 * @example
 * intersection(['a', 'b'], ['b', 'a'], ['b']);
 * // 返回 ['b']（保留第一个数组的元素顺序）
 * @example
 * intersection([1, 2, 2, 3], [2, 2, 4]);
 * // 返回 [2]（自动去重结果）
 * @example
 * intersection([1, 2]); // 返回 [1, 2]（单个数组去重）
 * @example
 * intersection([], [1, 2]); // 返回 []（任意数组为空则结果为空）
 * @example
 * intersection([{ id: 1 }], [{ id: 1 }]);
 * // 返回 []（对象引用不同，视为不同元素）
 * **注意：** 元素比较使用严格相等 (===)，因此 1 和 '1' 被视为不同元素
 * **注意：** 结果数组会自动去重，即使原数组包含重复元素
 * **注意：** 如果不传入任何数组参数，返回空数组
 * **警告：** 对于大型数组，此实现可能存在性能问题（时间复杂度 O(n^2)）
 */
export const intersection = <T>(...arrays: readonly T[][]): T[] => {
  const [firstArray, ...restArrays] = arrays;
  if (!firstArray) {
    return [];
  }

  const uniqueValues = [...new Set(firstArray)];
  return uniqueValues.filter(value => restArrays.every(array => array.includes(value)));
};
