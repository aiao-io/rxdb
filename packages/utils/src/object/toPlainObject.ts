/**
 * 将值转换为只包含自有可枚举属性的普通对象
 *
 * **注意：** 每个键都写成自有属性，`__proto__` 键不会改动结果的原型
 *
 * @param value - 要转换的值
 * @returns 普通对象浅拷贝
 */
export const toPlainObject = (value: unknown): Record<string, unknown> => {
  const source = Object(value) as object;
  // fromEntries 按「定义自有属性」写入：`result[key] = value` 遇到 `__proto__` 键会走原型 setter，
  // 值丢失且结果的原型被换成调用方数据
  return Object.fromEntries(Object.keys(source).map(key => [key, Reflect.get(source, key) as unknown] as const));
};
