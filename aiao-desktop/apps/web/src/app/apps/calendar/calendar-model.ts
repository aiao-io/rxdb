import { CalendarEvent } from '../../services/calendar-store';
import { DAYS, MONS, MONS3 } from '../../shared/format';

/** `[年, 月(0 起), 日]`，和日历存储里的事件日期同形。 */
export type EventDate = readonly [number, number, number];

/** 日历窗口的四种视图。 */
export type CalendarView = 'day' | 'week' | 'month' | 'year';

/**
 * 时间轴的起止整点：整天都画出来，和 Calendar.app 一样。
 * 只画 7 点到 9 点的话，凌晨的航班会被压在格子顶端，好像凌晨不存在。
 */
export const FIRST_HOUR = 0;
/** 时间轴画到的最后一个整点。 */
export const LAST_HOUR = 23;
/** 时间轴上每个小时行的像素高度。 */
export const HOUR_ROW = 42;
/** 时间轴画出的全部整点。 */
export const HOURS: readonly number[] = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, index) => FIRST_HOUR + index
);

/** 月视图里的一格；`out` 表示属于相邻月份的补位格。 */
export interface MonthCell {
  readonly y: number;
  readonly m: number;
  readonly d: number;
  readonly out: boolean;
}

/** 时间轴上排好位置的事件：`x`、`w` 是占整列宽度的百分比。 */
export interface PlacedEvent {
  readonly event: CalendarEvent;
  readonly x: number;
  readonly w: number;
}

/** 时间轴左侧的整点标签，例如 `12 AM`、`3 PM`。 */
export const hourLabel = (hour: number): string => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

/** 事件编辑器里的日期文字，例如 `Jul 27, 2026`。 */
export const dateLabel = (date: EventDate): string => `${MONS3[date[1]]} ${date[2]}, ${date[0]}`;

/** 一个月的格子：前后补相邻月份的日期，凑满整周且至少五行。 */
export function monthCells(y: number, m: number): MonthCell[] {
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const pdim = new Date(y, m, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < first; i++) {
    cells.push({ d: pdim - first + 1 + i, out: true, y: m === 0 ? y - 1 : y, m: (m + 11) % 12 });
  }
  for (let d = 1; d <= dim; d++) cells.push({ d, out: false, y, m });
  const next = (): void => {
    cells.push({ d: cells.length - first - dim + 1, out: true, y: m === 11 ? y + 1 : y, m: (m + 1) % 12 });
  };
  while (cells.length % 7) next();
  while (cells.length < 35) next();
  return cells;
}

/** 某天所在那一周（周日起）的七天。 */
export function weekOf(y: number, m: number, day: number): Date[] {
  const base = new Date(y, m, day || 1);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

/**
 * 时间轴排版：纵向位置由开始时刻与时长决定，重叠的事件把整列平分。
 * 列数是这一天里用到的总列数，所以只要有一处重叠，当天所有事件都会变窄——
 * 这是原版的排法，保持不变。全天事件不进时间轴，由上方的横条另外画。
 */
export function layoutDay(events: readonly CalendarEvent[]): PlacedEvent[] {
  const timed = events.filter((event): event is CalendarEvent & { s: number } => event.s !== null);
  const columns: (CalendarEvent & { s: number })[][] = [];
  const slots = timed.map(event => {
    const end = event.s + (event.dur || 60);
    const free = (other: { s: number; dur: number }): boolean =>
      event.s >= other.s + (other.dur || 60) || end <= other.s;
    let slot = columns.findIndex(column => column.every(free));
    if (slot < 0) slot = columns.push([]) - 1;
    columns[slot].push(event);
    return slot;
  });
  const width = 100 / Math.max(1, columns.length);
  return timed.map((event, index) => ({ event, x: slots[index] * width, w: width }));
}

/** 接受人们实际会输入的写法：“9”、“9:30”、“9:30 pm”、“21:30”、“9p”；读不懂就用 `fallback`。 */
export function parseClock(text: string, fallback: number): number {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a|p)?m?\s*$/i.exec(text);
  if (!match) return fallback;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour > 23 || minute > 59) return fallback;
  if (match[3]) {
    hour %= 12;
    if (/p/i.test(match[3])) hour += 12;
  }
  return hour * 60 + minute;
}

/** 解析日期输入框里的文字；读不懂就用 `fallback`。 */
export function parseDate(text: string, fallback: EventDate): EventDate {
  const time = Date.parse(text);
  if (Number.isNaN(time)) return fallback;
  const date = new Date(time);
  return [date.getFullYear(), date.getMonth(), date.getDate()];
}

/** 标题栏里的大标题：随视图变成年、月、周范围或某一天。 */
export function viewTitle(view: CalendarView, y: number, m: number, day: number): string {
  if (view === 'year') return String(y);
  if (view === 'month') return `${MONS[m]} ${y}`;
  if (view === 'day') {
    const date = new Date(y, m, day || 1);
    return `${DAYS[date.getDay()]}, ${MONS[m]} ${date.getDate()}, ${y}`;
  }
  const days = weekOf(y, m, day);
  const [a, b] = [days[0], days[6]];
  return a.getMonth() === b.getMonth() ?
      `${MONS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
    : `${MONS3[a.getMonth()]} ${a.getDate()} – ${MONS3[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
}

/** 侧栏迷你月历的一格：补位格没有文字。 */
export interface MiniCell {
  readonly text: string;
  readonly out: boolean;
  readonly today: boolean;
}

/** 侧栏的迷你月历：月初前的空位加上当月每一天。 */
export function miniMonth(y: number, m: number, now: Date): { label: string; cells: MiniCell[] } {
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: MiniCell[] = Array.from({ length: first }, () => ({ text: '', out: true, today: false }));
  for (let d = 1; d <= dim; d++) {
    const today = d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
    cells.push({ text: String(d), out: false, today });
  }
  return { label: `${MONS[m]} ${y}`, cells };
}
