/**
 * 从对象浅拷贝中删除指定自有属性
 *
 * @template T - 输入对象类型
 * @template Keys - 删除的键类型
 * @param obj - 源对象
 * @param keys - 要删除的键
 * @returns 删除属性后的新对象
 */
export const omit = <T extends object, Keys extends keyof T>(obj: T, keys: Keys[]): Omit<T, Keys> => {
  if (!obj) return {} as Omit<T, Keys>;
  if (keys.length === 0) return obj as Omit<T, Keys>;

  const result = { ...obj };
  for (const key of keys) Reflect.deleteProperty(result, key);
  return result;
};
