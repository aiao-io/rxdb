import { DAYS, MONS3, mmss, time12Plain } from '../../shared/format';

/** 通话方向：打出、接入、未接。 */
export const CALL_KINDS = ['Outgoing', 'Incoming', 'Missed'] as const;

export type CallKind = (typeof CALL_KINDS)[number];

/** 一条通话记录的内容；`duration` 是通话秒数，未接为 0。 */
export interface CallRecord {
  readonly name: string;
  readonly kind: CallKind;
  readonly duration: number;
  readonly startedAt: Date;
}

const MINUTE = 60e3;
const DAY = 24 * 60 * MINUTE;

/** 当天零点；按本地日历算「今天 / 昨天」。 */
const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** 通话时长文字，例如 `24:12`；未接的通话没有时长，是空串。 */
export const lengthLabel = (kind: CallKind, seconds: number): string => (kind === 'Missed' ? '' : mmss(seconds));

/**
 * 通话记录上的时间文字：一分钟内是 `Just now`，当天是 `Today 3:40 PM`，前一天是 `Yesterday`，
 * 一周内是星期几，更早的是日期（跨年带年份）。
 */
export function whenLabel(startedAt: Date, now: Date): string {
  const elapsed = now.getTime() - startedAt.getTime();
  if (elapsed >= 0 && elapsed < MINUTE) return 'Just now';
  const days = Math.round((startOfDay(now) - startOfDay(startedAt)) / DAY);
  if (days <= 0) return `Today ${time12Plain(startedAt)}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return DAYS[startedAt.getDay()];
  const date = `${MONS3[startedAt.getMonth()]} ${startedAt.getDate()}`;
  return startedAt.getFullYear() === now.getFullYear() ? date : `${date}, ${startedAt.getFullYear()}`;
}

/**
 * 首次打开时的四条通话记录，次序与原来一致（新的在前）：今天两条、昨天一条、前天一条。
 * 今天的两条取原来的钟点（15:40、11:02），但不晚于 `now` 之前的 10 / 20 分钟，
 * 这样此后新拨的通话（`startedAt` 为拨出时刻）永远排在它们前面。
 */
export function callSeeds(now: Date): readonly CallRecord[] {
  const at = (daysAgo: number, hour: number, minute: number): Date =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute);
  const notLater = (moment: Date, minutes: number): Date =>
    new Date(Math.min(moment.getTime(), now.getTime() - minutes * MINUTE));
  return [
    { name: 'Anna Haro', kind: 'Outgoing', duration: 24 * 60 + 12, startedAt: notLater(at(0, 15, 40), 10) },
    { name: 'Design Crew', kind: 'Missed', duration: 0, startedAt: notLater(at(0, 11, 2), 20) },
    { name: 'John Appleseed', kind: 'Incoming', duration: 8 * 60 + 31, startedAt: at(1, 20, 15) },
    { name: 'Mom', kind: 'Outgoing', duration: 41 * 60 + 7, startedAt: at(2, 17, 30) }
  ];
}
