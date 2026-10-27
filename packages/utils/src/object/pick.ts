/**
 * 从对象中选取指定的属性，创建并返回一个新对象
 * 只包含指定的自有属性，忽略继承属性和不存在的属性
 * 当输入对象为null/undefined时，返回空对象
 *
 * @template T - 输入对象的类型
 * @template Keys - 要选取的属性键集合类型
 * @param obj - 源对象，如果为null/undefined则返回空对象
 * @param keys - 要选取的属性键数组
 * @returns 只包含选取属性的新对象
 * @example
 * pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);
 * // 返回 { a: 1, c: 3 }
 * @example
 * pick({ name: 'John', age: 30 }, ['name']);
 * // 返回 { name: 'John' }
 * @example
 * pick(null, ['a', 'b']); // 返回 {}
 * @example
 * pick({ a: 1 }, ['b']); // 返回 {}（属性不存在）
 * **注意：** 只选取对象的自有属性，不包括继承的属性
 * **注意：** 对于不存在的属性，会被忽略而不会出现在结果中
 * **注意：** 选中的键都写成自有属性，`__proto__` 键不会改动结果的原型
 */
export function pick<T extends object, Keys extends keyof T>(obj: T, keys: Keys[]): Pick<T, Keys> {
  if (!obj) return {} as Pick<T, Keys>;
  // fromEntries 按「定义自有属性」写入：`acc[key] = value` 遇到自有 `__proto__` 键（JSON.parse 的产物）
  // 会走原型 setter，值丢失且结果的原型被换成调用方数据
  const entries = keys
    .filter(key => Object.prototype.hasOwnProperty.call(obj, key))
    .map(key => [key, obj[key]] as const);
  return Object.fromEntries(entries) as Pick<T, Keys>;
}
