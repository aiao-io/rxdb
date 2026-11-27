import { describe, expect, it } from 'vitest';

import { callSeeds, lengthLabel, whenLabel } from './facetime-log';

/** 2026-11-12 是星期四。 */
const THURSDAY_2PM = new Date(2026, 10, 12, 14, 0, 0);

const minutesAgo = (minutes: number, from = THURSDAY_2PM): Date => new Date(from.getTime() - minutes * 60e3);

describe('lengthLabel', () => {
  it('打出和接入的通话显示 m:ss', () => {
    expect(lengthLabel('Outgoing', 24 * 60 + 12)).toBe('24:12');
    expect(lengthLabel('Incoming', 8 * 60 + 31)).toBe('8:31');
  });

  it('刚拨出就挂断的通话显示 0:00', () => {
    expect(lengthLabel('Outgoing', 0)).toBe('0:00');
  });

  it('未接的通话没有时长文字', () => {
    expect(lengthLabel('Missed', 0)).toBe('');
  });
});

describe('whenLabel', () => {
  it('一分钟内是 Just now', () => {
    expect(whenLabel(new Date(THURSDAY_2PM.getTime() - 30e3), THURSDAY_2PM)).toBe('Just now');
    expect(whenLabel(new Date(THURSDAY_2PM.getTime() - 59_999), THURSDAY_2PM)).toBe('Just now');
  });

  it('满一分钟起按钟点显示，当天带 Today', () => {
    expect(whenLabel(minutesAgo(1), THURSDAY_2PM)).toBe('Today 1:59 PM');
    expect(whenLabel(new Date(2026, 10, 12, 11, 2), THURSDAY_2PM)).toBe('Today 11:02 AM');
  });

  it('前一天是 Yesterday，跨午夜也按日历天算', () => {
    expect(whenLabel(new Date(2026, 10, 11, 20, 15), THURSDAY_2PM)).toBe('Yesterday');
    const justAfterMidnight = new Date(2026, 10, 12, 0, 10);
    expect(whenLabel(new Date(2026, 10, 11, 23, 50), justAfterMidnight)).toBe('Yesterday');
  });

  it('一周内是星期几', () => {
    expect(whenLabel(new Date(2026, 10, 10, 9, 0), THURSDAY_2PM)).toBe('Tuesday');
    expect(whenLabel(new Date(2026, 10, 6, 9, 0), THURSDAY_2PM)).toBe('Friday');
  });

  it('满一周是日期，跨年带年份', () => {
    expect(whenLabel(new Date(2026, 10, 5, 9, 0), THURSDAY_2PM)).toBe('Nov 5');
    expect(whenLabel(new Date(2025, 11, 31, 9, 0), THURSDAY_2PM)).toBe('Dec 31, 2025');
  });
});

describe('callSeeds', () => {
  const at = (hour: number, minute = 0): Date => new Date(2026, 10, 12, hour, minute);

  it('四条记录，名字、方向与时长和原来一致', () => {
    const seeds = callSeeds(at(18));

    expect(seeds.map(seed => [seed.name, seed.kind, seed.duration])).toEqual([
      ['Anna Haro', 'Outgoing', 1452],
      ['Design Crew', 'Missed', 0],
      ['John Appleseed', 'Incoming', 511],
      ['Mom', 'Outgoing', 2467]
    ]);
  });

  it('傍晚之后打开：今天的两条保留原来的钟点', () => {
    const [anna, design] = callSeeds(at(18));

    expect(anna.startedAt).toEqual(at(15, 40));
    expect(design.startedAt).toEqual(at(11, 2));
  });

  it('中午打开：晚于现在的钟点退到现在之前，不会出现在未来', () => {
    const now = at(12);
    const [anna, design] = callSeeds(now);

    expect(anna.startedAt).toEqual(minutesAgo(10, now));
    expect(design.startedAt).toEqual(at(11, 2));
  });

  it.each([at(0, 5), at(9), at(12), at(14), at(18), at(23, 59)])('%s 打开：由新到旧排列，且都早于现在', now => {
    const times = callSeeds(now).map(seed => seed.startedAt.getTime());

    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
    expect(Math.max(...times)).toBeLessThanOrEqual(now.getTime() - 10 * 60e3);
  });

  it('昨天和前天的记录显示成 Yesterday 与星期几', () => {
    const now = at(18);
    const [, , john, mom] = callSeeds(now);

    expect(whenLabel(john.startedAt, now)).toBe('Yesterday');
    expect(whenLabel(mom.startedAt, now)).toBe('Tuesday');
  });
});
