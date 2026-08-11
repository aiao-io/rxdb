/**
 * 将值转换为只包含自有可枚举属性的普通对象
 *
 * @param value - 要转换的值
 * @returns 普通对象浅拷贝
 */
export const toPlainObject = (value: unknown): Record<string, unknown> => {
  const source = Object(value) as object;
  const result: Record<string, unknown> = {};
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = Reflect.get(source, key) as unknown;
    }
  }
  return result;
};
