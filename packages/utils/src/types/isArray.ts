/**
 * 检查值是否为数组
 * 这是对JavaScript内置Array.isArray函数的重导出
 *
 * @param value - 要检查的值
 * @returns 如果值是数组则返回true，否则返回false
 * @example
 * isArray([]); // 返回 true
 * @example
 * isArray([1, 2, 3]); // 返回 true
 * @example
 * isArray({}); // 返回 false（对象不是数组）
 * @example
 * isArray(null); // 返回 false（null不是数组）
 * @example
 * isArray("array"); // 返回 false（字符串不是数组）
 * **注意：** 这是对原生Array.isArray函数的直接重导出，保持与原生函数相同的行为
 */
export const isArray = Array.isArray;
