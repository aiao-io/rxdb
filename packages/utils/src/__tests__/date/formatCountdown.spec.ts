import { describe, expect, it } from 'vitest';
import { formatCountdown } from '../../date/formatCountdown.js';

describe('formatCountdown', () => {
  it('1', () => {
    const d = formatCountdown(new Date('2015-11-01 10:38:10'), new Date('2015-11-01 20:18:30'));
    expect(d).toEqual('0 year 0 month 0 day 9 hour 40 minute 20 second');
  });

  it('2 function', () => {
    const d = formatCountdown(
      new Date('2015-11-01 10:38:10'),
      new Date('2015-11-01 20:18:30'),
      ({ year, month, day, hour, minute, second }) => `${year} ${month} ${day} ${hour} ${minute} ${second}`
    );
    expect(d).toEqual('0 0 0 9 40 20');
  });

  it('3', () => {
    const d = formatCountdown(new Date('2015-11-01 10:38:10'), new Date('2015-11-01 20:18:30'), {
      year: '年',
      month: '月',
      day: '天',
      hour: '小时',
      minute: '分钟',
      second: '秒'
    });
    expect(d).toEqual('0 年 0 月 0 天 9 小时 40 分钟 20 秒');
  });
});
