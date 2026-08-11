import { canBeNumber } from './canBeNumber.js';

/**
 * 安全地将值转换为数字，只在能转换为有效数字时才转换
 * 如果无法转换为有效数字（NaN、无穷大等），则返回原值不变
 * @param value - 要尝试转换的值
 * @returns 转换后的数字（如果成功）或原值（如果失败）
 * @example
 * tryToNumber('123'); // 返回 123（字符串数字转换为数字）
 * @example
 * tryToNumber('123.45'); // 返回 123.45（浮点数字符串）
 * @example
 * tryToNumber('abc'); // 返回 'abc'（无法转换为数字，返回原值）
 * @example
 * tryToNumber(true); // 返回 true（布尔值不转换）
 * @example
 * tryToNumber(null); // 返回 null（null不转换）
 * @example
 * tryToNumber(''); // 返回 ''（空字符串不转换）
 * @example
 * tryToNumber('Infinity'); // 返回 'Infinity'（无穷大字符串不转换）
 * **注意：** 使用 canBeNumber 检查是否可以转换为数字
 * **注意：** 即使通过了 canBeNumber 检查，仍会验证转换结果是否为有效数字
 * **注意：** 对于无法转换的值，始终返回原值，不抛出错误
 */
export const tryToNumber = <T>(value: T): number | T => {
  // 检查是否可以转换为数字
  if (canBeNumber(value)) {
    const number = Number(value);

    // 检查转换后的数字是否有效
    if (isNaN(number) || !isFinite(number)) {
      return value;
    }

    return number;
  }

  return value;
};
