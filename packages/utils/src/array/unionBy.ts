/**
 * 根据指定的键函数对数组进行去重，返回唯一元素的新数组
 * 使用键函数提取每个元素的唯一标识符，保留第一次出现的元素
 * @template T - 数组元素的类型
 * @param array - 要去重的数组
 * @param getKey - 键函数，用于从元素中提取唯一标识符
 * @returns 去重后的新数组，保留元素在原数组中的出现顺序
 * @example
 * unionBy([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }, { id: 1, name: 'Alice2' }], item => item.id);
 * // 返回 [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]（按id去重）
 * @example
 * unionBy(['apple', 'banana', 'Apple'], item => item.toLowerCase());
 * // 返回 ['apple', 'banana']（按小写字母去重）
 * @example
 * unionBy([1, 2, 3, 2, 1], item => item);
 * // 返回 [1, 2, 3]（基本类型去重）
 * **注意：** 键函数的返回值必须是字符串或数字类型
 * **注意：** 保留第一次出现的元素，后续重复元素被过滤掉
 * **注意：** 返回新数组，不修改原数组
 */
export const unionBy = <T = unknown>(array: T[], getKey: (item: T) => string | number): T[] => {
  const seen = new Set<string | number>();
  const result: T[] = [];
  for (const item of array) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};
