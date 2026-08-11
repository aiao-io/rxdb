type NestedArray<T> = Array<T | NestedArray<T>>;

/**
 * 将任意深度的嵌套数组完全扁平化为一维数组
 *
 * @template T - 数组元素的基础类型
 * @param array - 任意深度的嵌套数组
 * @returns 完全扁平化后的一维数组
 * @throws 循环引用时抛出 TypeError
 */
export const flattenDeep = <T>(array: NestedArray<T>): T[] => {
  const result: T[] = [];
  const activeArrays = new WeakSet<object>([array]);
  const stack: Array<{ array: NestedArray<T>; index: number }> = [{ array, index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.array.length) {
      activeArrays.delete(frame.array);
      stack.pop();
      continue;
    }

    const value = frame.array[frame.index++];
    if (Array.isArray(value)) {
      if (activeArrays.has(value)) {
        throw new TypeError('flattenDeep does not support circular references');
      }
      activeArrays.add(value);
      stack.push({ array: value, index: 0 });
      continue;
    }

    result.push(value);
  }

  return result;
};
