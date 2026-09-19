/**
 * 将日期格式化为 YYYY-MM-DD 字符串。
 *
 * @param date 要格式化的日期（Date 对象或可解析的日期字符串）
 * @returns YYYY-MM-DD 格式的日期字符串；输入为空值或无法解析时返回空字符串
 */
export function formatDateToYmd(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 将 YYYY-MM-DD 字符串解析为本地时区的 Date。
 *
 * @param ymd YYYY-MM-DD 格式的日期字符串
 * @returns 本地时区当天 00:00:00 的 Date 对象；输入为空、段数不为 3 或任一段 parseInt 结果为 NaN 时返回 null
 */
export function parseYmdToLocalDate(ymd: string | null | undefined): Date | null {
  if (!ymd) return null;
  const parts = ymd.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  const date = new Date();
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}
