import { randomUintString } from './randomUintString.js';

/**
 * 生成指定位数的随机正整数
 * 通过生成随机数字字符串然后转换为数字实现
 * @param length - 数字的位数，默认 15（不是 16）
 * @returns 指定位数的随机正整数
 * @example
 * randomUintByLength(3); // 返回 3 位随机数，如 123、456、789
 * @example
 * randomUintByLength(1); // 返回 1 位随机数，如 1、2、3、4、5、6、7、8、9（不含 0）
 * @example
 * randomUintByLength(5); // 返回 5 位随机数，如 12345
 * **注意：** 第一位不会是 0，确保返回的数字位数正确
 * **注意：** 使用 randomUintString 生成字符串后转换为数字
 * @throws {RangeError} 当 length 不是 1..15 的整数时
 *
 * **注意：** 默认值是 **15** 而不是 16。`Number.MAX_SAFE_INTEGER` 是 9007199254740991（16 位），
 * 16 位随机数有很大概率超出它，`parseInt` 结果会静默丢精度 —— 默认参数就能产出非安全整数
 * 是不可接受的。需要更长的值请直接用 {@link randomUintString}（UTL-027）。
 */
export const randomUintByLength = (length: number = 15): number => {
  if (!Number.isSafeInteger(length) || length < 1 || length > 15) {
    throw new RangeError(
      `randomUintByLength: length 必须是 1..15 的整数，收到 ${String(length)}；更长的值请用 randomUintString`
    );
  }
  return parseInt(randomUintString(length), 10);
};
