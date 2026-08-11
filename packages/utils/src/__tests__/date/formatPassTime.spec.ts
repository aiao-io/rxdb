import { describe, expect, it } from 'vitest';
import { formatPassTime } from '../../date/formatPassTime.js';

describe('formatPassTime', () => {
  const config = {
    year: '年前',
    month: '个月前',
    day: '天前',
    hour: '小时',
    minute: '分钟前',
    second: '秒前'
  };

  it('1', () => {
    const d = formatPassTime(new Date('2015-11-01'), new Date('2018-11-01'), config);
    expect(d).toEqual('3 年前');
  });

  it('2', () => {
    const d = formatPassTime(new Date('2015-11-01'), new Date('2018-11-01'));
    expect(d).toEqual('3 year');
  });

  it('3', () => {
    const d = formatPassTime(new Date('2015-11-01'), new Date('2016-03-01'), config);
    expect(d).toEqual('4 个月前');
  });

  it('4', () => {
    const d = formatPassTime(new Date('2016-11-01'), new Date('2016-11-21'), config);
    expect(d).toEqual('20 天前');
  });

  it('5', () => {
    const d = formatPassTime(new Date('2015-11-01 18:12'), new Date('2015-11-01 20:18'), config);
    expect(d).toEqual('2 小时');
  });

  it('6', () => {
    const d = formatPassTime(new Date('2015-11-01 20:12'), new Date('2015-11-01 20:18'), config);
    expect(d).toEqual('6 分钟前');
  });

  it('7', () => {
    const d = formatPassTime(new Date('2015-11-01 20:18:10'), new Date('2015-11-01 20:18:30'), config);
    expect(d).toEqual('20 秒前');
  });

  it('formatPassTime without config', () => {
    const d = formatPassTime(new Date('2015-11-01 20:18:10'), new Date('2015-11-01 20:18:30'), {
      s: 'a'
    } as unknown as Parameters<typeof formatPassTime>[2]);
    expect(d).toEqual('20 second');
  });
  it('formatPassTime 0 second', () => {
    const d = formatPassTime(new Date('2015-11-01 20:18:10'), new Date('2015-11-01 20:18:10'), {
      s: 'a'
    } as unknown as Parameters<typeof formatPassTime>[2]);
    expect(d).toEqual('0 second');
  });

  it('formatPassTime', () => {
    const d = formatPassTime(
      new Date('2015-11-01 20:18:10'),
      new Date('2015-11-01 20:18:30'),
      ({ key, value }) => `${value} ${key}`
    );
    expect(d).toEqual('20 second');
  });
});
