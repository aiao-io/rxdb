/**
 * @fileoverview 共用字段校验（US-526 / US-528）
 *
 * 标题校验在创建、内联编辑与详情保存三处共用；截止日是纯日期串，
 * 校验走公历算术、不经 `Date` / UTC 换算。
 */

/** 去除首尾空白后的合法标题；空串或全空白返回 `null`。 */
export const normalizeBoardTitle = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const title = raw.trim();
  return title.length > 0 ? title : null;
};

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * `YYYY-MM-DD` 且为合法公历日期（2024-02-29 合法，2026-02-29 / 2026-13-01 非法）。
 * 纯算术实现：不把日期解析成 UTC 时刻，跨时区不漂移（US-528 AC#13）。
 */
export const isValidDueDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const monthDays = month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
  return day <= monthDays;
};
