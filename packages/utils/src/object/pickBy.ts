/**
 * 创建仅保留满足断言属性的新对象（键类型谓词重载）
 *
 * `predicate` 写成 `(value, key): key is K` 时，返回类型精确到 `Pick<T, K>`。
 *
 * @param object - 源对象
 * @param predicate - 收窄键的类型谓词
 * @returns 只含 `K` 的新对象
 */
export function pickBy<T extends object, K extends keyof T & string>(
  object: T,
  predicate: (value: T[keyof T], key: keyof T & string) => key is K
): Pick<T, K>;
/**
 * 创建仅保留满足断言属性的新对象
 *
 * 返回 `Partial<T>` 而不是 `T`：任何一个键都可能被 `predicate` 过滤掉，
 * 声明成 `T` 会让 `result.b.toFixed()` 这类访问在 strict 下编译通过、
 * 运行时读到 `undefined`（UTL-006）。需要精确类型时用上面的类型谓词重载。
 *
 * @param object - 源对象
 * @param predicate - 返回 true 时保留属性
 * @returns 新对象
 */
export function pickBy<T extends object>(
  object: T,
  predicate: (value: T[keyof T], key: keyof T & string) => boolean
): Partial<T>;
export function pickBy<T extends object>(
  object: T,
  predicate: (value: T[keyof T], key: keyof T & string) => boolean
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(object) as Array<keyof T & string>) {
    if (predicate(object[key], key)) result[key] = object[key];
  }
  return result;
}
