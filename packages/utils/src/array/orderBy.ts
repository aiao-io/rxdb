type SortOrder = 'asc' | 'desc';

const compareValues = (a: unknown, b: unknown): number => {
  if ((a as string) < (b as string)) return -1;
  if ((a as string) > (b as string)) return 1;
  return 0;
};

/**
 * 根据指定属性和排序方向对数组进行多字段排序
 *
 * @template T - 数组元素类型
 * @param collection - 要排序的数组
 * @param iteratees - 直接属性名，不解析嵌套路径
 * @param orders - 每个属性对应的排序方向，默认为 asc
 * @returns 排序后的新数组
 */
export const orderBy = <T>(collection: T[], iteratees: string[] = [], orders: SortOrder[] = []): T[] => {
  const result = [...collection];

  result.sort((a, b) => {
    for (let index = 0; index < iteratees.length; index++) {
      const iteratee = iteratees[index];
      const order = orders[index] ?? 'asc';
      const aValue = Reflect.get(Object(a), iteratee) as unknown;
      const bValue = Reflect.get(Object(b), iteratee) as unknown;

      if (aValue == null && bValue == null) continue;
      if (aValue == null) return order === 'desc' ? 1 : -1;
      if (bValue == null) return order === 'desc' ? -1 : 1;

      const comparison = compareValues(aValue, bValue) * (order === 'desc' ? -1 : 1);
      if (comparison !== 0) return comparison;
    }
    return 0;
  });

  return result;
};
