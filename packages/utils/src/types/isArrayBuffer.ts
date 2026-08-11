/**
 * 检查值是否为ArrayBuffer类型
 * 使用instanceof运算符进行判断
 *
 * @param value - 要检查的值
 * @returns 如果值是ArrayBuffer则返回true，否则返回false
 * @example
 * isArrayBuffer(new ArrayBuffer(8)); // 返回 true
 * @example
 * isArrayBuffer(new ArrayBuffer(0)); // 返回 true（空的ArrayBuffer）
 * @example
 * isArrayBuffer([]); // 返回 false（数组不是ArrayBuffer）
 * @example
 * isArrayBuffer(null); // 返回 false（null不是ArrayBuffer）
 * @example
 * isArrayBuffer(undefined); // 返回 false（undefined不是ArrayBuffer）
 * @example
 * isArrayBuffer(new Uint8Array()); // 返回 false（Uint8Array不是ArrayBuffer）
 * **注意：** 函数使用instanceof运算符判断是否为ArrayBuffer实例
 * **注意：** ArrayBuffer是用于表示通用的、固定长度的原始二进制数据缓冲区
 * **注意：** 与TypedArray（如Uint8Array）的区别：ArrayBuffer是原始二进制数据，而TypedArray是对其的视图
 */
export const isArrayBuffer = (value: unknown): value is ArrayBuffer => value instanceof ArrayBuffer;
