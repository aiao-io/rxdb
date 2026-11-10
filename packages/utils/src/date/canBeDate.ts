/** 带时间值的 Date（含其他 realm 的）；只继承 Date.prototype 的普通对象不算 */
const isDateObject = (value: unknown): value is Date => Object.prototype.toString.call(value) === '[object Date]';

/**
 * 判断值能否表示有效日期。
 *
 * @param value - Date、时间戳或日期字符串
 * @returns 是否能转换为有限时间戳；声明域之外的值（bigint、Symbol、普通对象、数组、函数等）一律返回 false，不抛错
 */
export const canBeDate = (value?: unknown): boolean => {
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(new Date(value).getTime());
  if (typeof value !== 'number' && !isDateObject(value)) return false;
  return Number.isFinite(new Date(value).getTime());
};
