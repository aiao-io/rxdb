/**
 * 将值转换为整数，使用向下取整（正数）和向上取整（负数）的策略
 * @param value - 要转换的值，可以是数字或字符串
 * @returns 转换后的整数，转换失败返回 NaN
 * @example
 * toInt('123'); // 返回 123
 * @example
 * toInt(123.45); // 返回 123（向下取整）
 * @example
 * toInt('-123.45'); // 返回 -123（向上取整，-123.45 -> -123）
 * @example
 * toInt('123.9'); // 返回 123（向下取整）
 * @example
 * toInt('-123.1'); // 返回 -123（向上取整）
 * @example
 * toInt('abc'); // 返回 NaN（无法转换为数字）
 * @example
 * toInt(null); // 返回 NaN
 * **注意：** 对于正数使用 Math.floor()，对于负数使用 Math.ceil()
 * **注意：** 这与 parseInt() 的行为不同，后者总是向零取整
 */
export const toInt = (value: number | string): number => {
  // 转换为数字
  const number = Number(value);
  // 转换为整数
  return number < 0 ? Math.ceil(number) : Math.floor(number);
};
