const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/;

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * 判断字符串是否为带时区的完整 ISO 日期时间。
 *
 * @param value - 待检查值
 * @returns 是否为合法 ISO 日期时间
 */
export const isISODateString = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  return isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
};
