import { describe, expect, it } from 'vitest';

import { parseClock, parseDate } from './calendar-model';
import { parseCalendarInput } from './calendar-draft';

const valid = {
  title: 'Review', location: 'Room 3', date: '2026-11-17', from: '9:00 AM', to: '10:00 AM',
  allDay: false, calendar: 'work', notes: 'Keep 🌏'
};

describe('严格日期与时间输入', () => {
  it.each(['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '', 'tomorrow', 'Nov 31, 2026'])
    ('无效日期不回退或滚入下个月：%s', value => {
      expect(parseDate(value)).toBeNull();
    });
  it.each([
    ['2028-02-29', [2028, 1, 29]], ['2026-11-17', [2026, 10, 17]],
    ['Nov 17, 2026', [2026, 10, 17]], ['November 17, 2026', [2026, 10, 17]],
    ['11/17/2026', [2026, 10, 17]]
  ])('有效日期按本地年月日解析：%s', (value, expected) => {
    expect(parseDate(String(value))).toEqual(expected);
  });
  it.each(['24:00', '9:60', '13pm', '0am', '9m', '', 'later', '9:3'])('无效时间不回退：%s', value => {
    expect(parseClock(value)).toBeNull();
  });
  it.each([['9', 540], ['9:30', 570], ['9p', 1260], ['9:30 pm', 1290], ['21:30', 1290], ['12am', 0], ['12pm', 720]])
    ('常用有效时间：%s', (value, expected) => {
      expect(parseClock(String(value))).toBe(expected);
    });
});

describe('parseCalendarInput', () => {
  it('明确校验必填字段，不替换用户输入', () => {
    expect(() => parseCalendarInput({ ...valid, title: ' ' })).toThrow('Enter an event title');
    expect(() => parseCalendarInput({ ...valid, date: '2026-02-30' })).toThrow('valid date');
    expect(() => parseCalendarInput({ ...valid, from: '25:00' })).toThrow('valid start time');
    expect(() => parseCalendarInput({ ...valid, to: 'bad' })).toThrow('valid end time');
    expect(() => parseCalendarInput({ ...valid, to: '8:00 AM' })).toThrow('after the start');
    expect(() => parseCalendarInput({ ...valid, to: '9:00 AM' })).toThrow('after the start');
    expect(() => parseCalendarInput({ ...valid, calendar: '' })).toThrow('Choose a calendar');
  });
  it('保留真实分钟间隔，全天不读取隐藏的无效时间字段', () => {
    expect(parseCalendarInput({ ...valid, to: '9:05 AM' })).toEqual({
      d: [2026, 10, 17], t: 'Review', loc: 'Room 3', s: 540, dur: 5, cal: 'work', notes: 'Keep 🌏'
    });
    expect(parseCalendarInput({ ...valid, allDay: true, from: 'bad', to: 'bad' })).toMatchObject({ s: null, dur: 0 });
  });
});
