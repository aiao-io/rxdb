/**
 * 计算两个数组的差异，返回仅存在于第一个数组中且不在第二个数组中的元素
 * 元素比较使用严格相等运算符 (===)，因此对象仅在引用相同时被视为相等
 * 结果数组保留元素在原数组中的出现顺序
 *
 * @template T - 数组元素的类型
 * @param array1 - 源数组，从中筛选差异元素
 * @param array2 - 比较数组，用于判断元素是否应被排除
 * @returns 新数组，包含所有仅存在于 array1 中的元素（保留原顺序）
 * @example
 * difference([0, 1, 2], [2, 3, 4]);
 * // 返回 [0, 1]（基础类型比较）
 * @example
 * difference(['a', 'b', 'c'], ['b', 'd']);
 * // 返回 ['a', 'c']（字符串比较）
 * @example
 * difference([1, 2, 2, 3], [2]);
 * // 返回 [1, 3]（自动去重 array1 中被排除的重复元素）
 * @example
 * difference([], [1, 2]); // 返回 []（源数组为空）
 * @example
 * difference([1, 2], []); // 返回 [1, 2]（比较数组为空）
 * @example
 * difference([{ id: 1 }], [{ id: 1 }]);
 * // 返回 [{ id: 1 }]（对象引用不同，视为不同元素）
 * **注意：** 使用 Array.prototype.includes 实现，因此比较使用严格相等 (===)
 * **注意：** 结果数组中不会包含 array1 中重复出现但也存在于 array2 中的元素
 * **警告：** 不支持对象的深度比较，仅比较引用是否相同
 */
export const difference = <T>(array1: T[], array2: T[]): T[] => {
  return array1.filter((c: T) => !array2.includes(c));
};
