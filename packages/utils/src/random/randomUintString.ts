import { NUMBER_WITHOUT_ZERO, NUMBERS, randomString } from './randomString.js';

/**
 * 生成指定长度的数字字符串，非空结果的第一位不为 0。
 *
 * @param length - 结果长度
 * @returns 随机数字字符串
 */
export const randomUintString = (length: number = 16): string => {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('length must be a non-negative safe integer');
  }
  if (length === 0) return '';
  return randomString(1, NUMBER_WITHOUT_ZERO) + randomString(length - 1, NUMBERS);
};
