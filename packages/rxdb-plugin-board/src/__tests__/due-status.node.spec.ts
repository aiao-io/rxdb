import { describe, expect, it } from 'vitest';

import { dueStatus, dueStatusText, localDateKey, msUntilNextLocalMidnight } from '../due-status.js';

/**
 * 截止日派生状态（US-539 AC#12）：纯日期串比较，不经 UTC；三端卡片 / 详情 / 筛选共用一份。
 */
describe('dueStatus（截止日状态）', () => {
  it('早于今天逾期、等于今天到期、晚于今天未到期，空值无状态', () => {
    expect(dueStatus('2026-10-18', '2026-10-19')).toBe('overdue');
    expect(dueStatus('2026-10-19', '2026-10-19')).toBe('today');
    expect(dueStatus('2026-10-20', '2026-10-19')).toBe('upcoming');
    expect(dueStatus(null, '2026-10-19')).toBeNull();
  });

  it('文字说明逾期 / 今天（颜色只作辅助）', () => {
    expect(dueStatusText('2026-10-18', '2026-10-19')).toBe('已逾期 2026-10-18');
    expect(dueStatusText('2026-10-19', '2026-10-19')).toBe('今天到期 2026-10-19');
    expect(dueStatusText('2026-10-20', '2026-10-19')).toBe('2026-10-20');
  });
});

describe('本地日期', () => {
  it('localDateKey 取本地年月日、补零', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('msUntilNextLocalMidnight 到下一个本地午夜（至少 1 秒）', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 19, 23, 0, 0))).toBe(3_600_000);
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 19, 23, 59, 59, 999))).toBe(1000);
  });
});
