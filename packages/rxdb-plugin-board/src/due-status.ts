/**
 * @fileoverview 截止日派生状态（US-539 AC#12 / 看板 v2 筛选）
 *
 * 截止日与本地当天都是 `YYYY-MM-DD` 纯日期串，按字典序比较即公历先后，
 * 不把日期解析成 UTC 时刻；三端卡片、详情与筛选共用这一份判定。
 */

/** 截止日状态：逾期 / 今天到期 / 未到期。 */
export type DueStatus = 'overdue' | 'today' | 'upcoming';

/** 截止日相对本地今天的状态；没有截止日返回 `null`。 */
export const dueStatus = (dueDate: string | null, today: string): DueStatus | null => {
  if (dueDate === null) return null;
  if (dueDate < today) return 'overdue';
  return dueDate === today ? 'today' : 'upcoming';
};

const DUE_PREFIX: Readonly<Record<DueStatus, string>> = {
  overdue: '已逾期 ',
  today: '今天到期 ',
  upcoming: ''
};

/** 截止日文字：逾期 / 今天用文字说明，颜色只作辅助（US-539 交互约定「卡片」行）。 */
export const dueStatusText = (dueDate: string, today: string): string =>
  `${DUE_PREFIX[dueStatus(dueDate, today) ?? 'upcoming']}${dueDate}`;

/** 本地日期键 `YYYY-MM-DD`（取本地年月日，不经 UTC）。 */
export const localDateKey = (now: Date): string => {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/** 距下一个本地午夜的毫秒数，至少 1 秒（跨午夜重新计算派生状态用）。 */
export const msUntilNextLocalMidnight = (now: Date): number => {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return Math.max(nextMidnight - now.getTime(), 1000);
};
