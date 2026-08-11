const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * 检查值是否为有限数字或完整的十进制数字字符串。
 *
 * @param value - 待检查值
 * @returns 是否可无损识别为十进制有限数字
 */
export const canBeNumber = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;

  const normalized = value.trim();
  if (!DECIMAL_NUMBER.test(normalized)) return false;
  return Number.isFinite(Number(normalized));
};
