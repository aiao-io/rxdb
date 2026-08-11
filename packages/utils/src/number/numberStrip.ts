/**
 * 去除数字的无用小数位，解决浮点数精度问题
 * 通过限制有效数字位数来消除JavaScript浮点数运算产生的微小误差
 * 例如：0.1 + 0.2 通常得到 0.30000000000000004，使用本函数可得到 0.3
 *
 * @param value - 需要处理的数字
 * @param [precision=12] - 有效数字位数，默认为12位（范围1-21）
 * @returns 处理后的数字，去除了无用的小数位
 * @example
 * numberStrip(0.1 + 0.2);       // 返回 0.3（解决浮点数精度问题）
 * @example
 * numberStrip(1.2345);          // 返回 1.2345（默认12位有效数字）
 * @example
 * numberStrip(12345.6789, 6);   // 返回 12345.7（6位有效数字）
 * @example
 * numberStrip(0.0000012345);     // 返回 0.0000012345
 * **注意：** 有效数字位数(precision)控制整体数字精度，而非仅小数部分
 * **注意：** 默认精度12位适用于大多数场景，可根据需要调整，但不应超过21位
 * **注意：** 内部使用Number.toPrecision()实现，然后通过parseFloat()转换回数字
 */
export const numberStrip = (value: number, precision = 12): number => parseFloat(value.toPrecision(precision));
