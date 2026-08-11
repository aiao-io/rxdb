/**
 * 检查值是否为正则表达式类型
 * 使用instanceof运算符进行判断
 *
 * @param value - 要检查的值
 * @returns 如果值是正则表达式则返回true，否则返回false
 * @example
 * isRegExp(/abc/); // 返回 true
 * @example
 * isRegExp(new RegExp('abc')); // 返回 true
 * @example
 * isRegExp('/abc/'); // 返回 false（字符串不是正则表达式）
 * @example
 * isRegExp(null); // 返回 false（null不是正则表达式）
 * @example
 * isRegExp(undefined); // 返回 false（undefined不是正则表达式）
 * @example
 * isRegExp({}); // 返回 false（普通对象不是正则表达式）
 * **注意：** 函数使用instanceof运算符判断是否为RegExp实例
 * **注意：** 正则表达式字面量和通过RegExp构造函数创建的正则表达式都会返回true
 * **注意：** 字符串形式的正则表达式（如'/abc/'）不会被识别为正则表达式
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}
