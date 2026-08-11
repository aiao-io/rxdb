/**
 * 检查值是否为null或undefined
 * 使用严格相等（===）进行比较
 *
 * @param value - 要检查的值
 * @returns 如果值是null或undefined则返回true，否则返回false
 * @example
 * isNil(null); // 返回 true
 * @example
 * isNil(undefined); // 返回 true
 * @example
 * isNil(0); // 返回 false（0不是null或undefined）
 * @example
 * isNil(''); // 返回 false（空字符串不是null或undefined）
 * @example
 * isNil(false); // 返回 false（false不是null或undefined）
 * **注意：** 此函数在判断null和undefined时使用严格相等运算符（===）
 * **注意：** 与isEmpty的区别：isNil仅检查null和undefined，而isEmpty还会检查空字符串、空数组等
 */
export const isNil = (value: unknown): value is null | undefined => value === null || value === undefined;
