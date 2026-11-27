/** 不换行空格：菜单栏时钟与 12 小时制时间之间的分隔符。 */
export const NBSP = ' ';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;
export const MONS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** 把数值限制在闭区间内。 */
export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min
  : value > max ? max
  : value;

/** 线性插值。 */
export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** 12 小时制时间，例如 `4:34 PM`（中间是不换行空格）。 */
export function time12(date: Date): string {
  const hour = date.getHours() % 12 || 12;
  return `${hour}:${String(date.getMinutes()).padStart(2, '0')}${NBSP}${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** 12 小时制时间，使用普通空格。 */
export const time12Plain = (date: Date): string => time12(date).replace(NBSP, ' ');

/** 秒数格式化为 `m:ss`。 */
export const mmss = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Finder 风格的完整日期，例如 `Jul 27, 2026 at 4:34 PM`。 */
export const finderDate = (date: Date | undefined): string =>
  date ? `${MONS3[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${time12Plain(date)}` : '--';
