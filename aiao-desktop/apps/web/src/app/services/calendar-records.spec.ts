import { describe, expect, it } from 'vitest';

import { SEED_CALENDARS, SEED_EVENTS } from './calendar-data';
import { EventRecord, dayKey, dayOf, eventOf, fieldsOf, listOf, patchOf } from './calendar-records';

describe('dayKey / dayOf', () => {
  it('界面里的月份从 0 起，库里的 YYYY-MM-DD 月份从 1 起', () => {
    expect(dayKey([2026, 6, 27])).toBe('2026-07-27');
    expect(dayKey([2026, 0, 1])).toBe('2026-01-01');
    expect(dayKey([2026, 11, 31])).toBe('2026-12-31');
  });

  it('个位数的月和日补零，年份至少四位', () => {
    expect(dayKey([2026, 7, 3])).toBe('2026-08-03');
    expect(dayKey([5, 0, 9])).toBe('0005-01-09');
  });

  it('dayOf 是 dayKey 的逆运算，包括很大的年份和负年份', () => {
    const dates = [
      [2026, 6, 27],
      [2026, 0, 1],
      [2026, 11, 31],
      [5, 3, 9],
      [275760, 8, 13],
      [-5, 1, 2]
    ] as const;
    for (const date of dates) expect(dayOf(dayKey(date))).toEqual(date);
  });

  it('字符串顺序就是日期顺序', () => {
    const keys = [
      [2026, 7, 3],
      [2026, 6, 31],
      [2026, 6, 4],
      [2025, 11, 31],
      [2026, 6, 27]
    ].map(date => dayKey(date as [number, number, number]));
    expect([...keys].sort()).toEqual(['2025-12-31', '2026-07-04', '2026-07-27', '2026-07-31', '2026-08-03']);
  });

  it('格式不对就抛错，不猜', () => {
    expect(() => dayOf('2026-7-27')).toThrow('Invalid calendar day');
    expect(() => dayOf('27/07/2026')).toThrow('Invalid calendar day');
    expect(() => dayOf('')).toThrow('Invalid calendar day');
  });
});

describe('eventOf / fieldsOf', () => {
  it('初始事件写进库再读出来，与原来的事件完全一致', () => {
    for (const draft of SEED_EVENTS) {
      const row: EventRecord = { id: 'e1', ...fieldsOf(draft) };
      expect(eventOf(row)).toEqual({ id: 'e1', ...draft });
    }
  });

  it('字段对应：t→title、s→startMinutes、dur→durationMinutes、cal→calendar、loc→location', () => {
    const fields = fieldsOf({
      d: [2026, 6, 27],
      t: 'Dentist',
      s: 930,
      dur: 40,
      cal: 'home',
      loc: 'Stevens Creek',
      notes: 'x'
    });
    expect(fields).toEqual({
      day: '2026-07-27',
      title: 'Dentist',
      startMinutes: 930,
      durationMinutes: 40,
      calendar: 'home',
      location: 'Stevens Creek',
      notes: 'x'
    });
  });

  it('全天事件的开始分钟数是 null', () => {
    expect(
      fieldsOf({ d: [2026, 6, 15], t: 'Beta cutoff', s: null, dur: 0, cal: 'work', loc: '', notes: '' }).startMinutes
    ).toBeNull();
  });
});

describe('patchOf', () => {
  it('只带出改动的字段', () => {
    expect(patchOf({ d: [2026, 6, 28] })).toEqual({ day: '2026-07-28' });
    expect(patchOf({ t: 'Renamed', loc: '' })).toEqual({ title: 'Renamed', location: '' });
  });

  it('s 为 null 是改成全天，不算没提到；dur 为 0 同理', () => {
    expect(patchOf({ s: null, dur: 0 })).toEqual({ startMinutes: null, durationMinutes: 0 });
  });

  it('什么都没改就是空补丁', () => {
    expect(patchOf({})).toEqual({});
  });
});

describe('listOf', () => {
  it('日历行转成界面用的日历：id 是 key，c 是颜色，on 是勾选状态', () => {
    expect(listOf({ key: 'work', name: 'Work', color: '#0a84ff', visible: false })).toEqual({
      id: 'work',
      name: 'Work',
      c: '#0a84ff',
      on: false
    });
  });
});

describe('初始数据', () => {
  it('四个日历、十三个事件', () => {
    expect(SEED_CALENDARS.map(calendar => calendar.id)).toEqual(['home', 'work', 'bday', 'hol']);
    expect(SEED_EVENTS).toHaveLength(13);
  });

  it('每个事件都属于已有的日历，日期是真实存在的', () => {
    const keys = new Set(SEED_CALENDARS.map(calendar => calendar.id));
    for (const event of SEED_EVENTS) {
      expect(keys.has(event.cal)).toBe(true);
      const [year, month, day] = event.d;
      const date = new Date(year, month, day);
      expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([year, month, day]);
    }
  });

  it('没写时长、地点、备注的按 60 分钟与空串补齐（全天事件也是 60）', () => {
    const beta = SEED_EVENTS.find(event => event.t === 'Beta cutoff');
    expect(beta).toMatchObject({ s: null, dur: 60, loc: '', notes: '' });
    const dentist = SEED_EVENTS.find(event => event.t === 'Dentist');
    expect(dentist).toMatchObject({ s: 930, dur: 40, loc: 'Dr. Reed · Stevens Creek', notes: '' });
  });
});
