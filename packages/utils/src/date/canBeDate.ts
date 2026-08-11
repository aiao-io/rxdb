/**
 * 判断值能否表示有效日期。
 *
 * @param value - Date、时间戳或日期字符串
 * @returns 是否能转换为有限时间戳
 */
export const canBeDate = (value?: unknown): boolean => {
  if (value === null || value === undefined || typeof value === 'boolean') return false;
  if (typeof value === 'string' && value.trim() === '') return false;

  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime());
};
