const compareValues = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if ((a as string) > (b as string)) return 1;
  if ((a as string) < (b as string)) return -1;
  return 0;
};

/**
 * 创建按直接属性自然升序排列的比较函数
 *
 * @param key - 用于排序的直接属性名
 * @returns 可传给 Array.sort 的比较函数
 */
export const sortBy =
  (key: PropertyKey) =>
  (a: object, b: object): number => {
    const aValue = Reflect.get(a, key) as unknown;
    const bValue = Reflect.get(b, key) as unknown;
    return compareValues(aValue, bValue);
  };
