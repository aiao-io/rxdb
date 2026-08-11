/**
 * 检查值是否为Uint8Array类型
 * 使用instanceof运算符进行判断
 *
 * @param value - 要检查的值
 * @returns 如果值是Uint8Array则返回true，否则返回false
 * @example
 * isUint8Array(new Uint8Array([1, 2, 3])); // 返回 true
 * @example
 * isUint8Array(new Uint8Array(0)); // 返回 true（空的Uint8Array）
 * @example
 * isUint8Array([]); // 返回 false（数组不是Uint8Array）
 * @example
 * isUint8Array(null); // 返回 false（null不是Uint8Array）
 * @example
 * isUint8Array(undefined); // 返回 false（undefined不是Uint8Array）
 * @example
 * isUint8Array(new ArrayBuffer(8)); // 返回 false（ArrayBuffer不是Uint8Array）
 * @example
 * isUint8Array(new Uint16Array()); // 返回 false（Uint16Array不是Uint8Array）
 * **注意：** 函数使用instanceof运算符判断是否为Uint8Array实例
 * **注意：** Uint8Array是8位无符号整数类型化数组，范围为0到255
 * **注意：** 与ArrayBuffer的区别：Uint8Array是对ArrayBuffer的视图，提供了对二进制数据的特定类型访问
 */
export const isUint8Array = (value: unknown): value is Uint8Array => value instanceof Uint8Array;
