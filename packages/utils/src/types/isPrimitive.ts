/**
 * 检查值是否为JavaScript原始类型
 * JavaScript原始类型包括null、undefined、字符串、数字、布尔值、符号和大整数
 *
 * @param value - 要检查的值
 * @returns 如果值是原始类型则返回true，否则返回false
 * @example
 * isPrimitive(null); // 返回 true
 * @example
 * isPrimitive(undefined); // 返回 true
 * @example
 * isPrimitive('hello'); // 返回 true（字符串是原始类型）
 * @example
 * isPrimitive(123); // 返回 true（数字是原始类型）
 * @example
 * isPrimitive(true); // 返回 true（布尔值是原始类型）
 * @example
 * isPrimitive(Symbol('foo')); // 返回 true（符号是原始类型）
 * @example
 * isPrimitive(BigInt(123)); // 返回 true（大整数是原始类型）
 * @example
 * isPrimitive({}); // 返回 false（对象不是原始类型）
 * @example
 * isPrimitive([]); // 返回 false（数组不是原始类型）
 * @example
 * isPrimitive(() => {}); // 返回 false（函数不是原始类型）
 * @example
 * isPrimitive(new Date()); // 返回 false（日期对象不是原始类型）
 * **注意：** 函数使用typeof运算符和null检查来判断是否为原始类型
 * **注意：** 原始类型是不可变的值，没有方法和属性（尽管JavaScript允许访问它们的包装对象方法）
 * **注意：** 函数实现使用`value == null`来同时检查null和undefined
 */
export function isPrimitive(value: unknown): value is null | undefined | string | number | boolean | symbol | bigint {
  return value == null || (typeof value !== 'object' && typeof value !== 'function');
}
