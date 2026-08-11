/**
 * 检查值是否为字符串类型
 * 使用typeof运算符进行判断，返回布尔值
 *
 * @param value - 要检查的值
 * @returns 如果值是字符串则返回true，否则返回false
 * @example
 * isString('hello'); // 返回 true
 * @example
 * isString(''); // 返回 true（空字符串也是字符串）
 * @example
 * isString(123); // 返回 false（数字不是字符串）
 * @example
 * isString(null); // 返回 false（null不是字符串）
 * @example
 * isString(undefined); // 返回 false（undefined不是字符串）
 * @example
 * isString(new String('hello')); // 返回 false（String对象不是字符串字面量）
 * **注意：** 使用typeof运算符判断，对于String对象返回'object'而非'string'
 * **注意：** 字符串字面量和空字符串都会返回true
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
