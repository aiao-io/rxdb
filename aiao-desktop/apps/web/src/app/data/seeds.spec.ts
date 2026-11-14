import { describe, expect, it } from 'vitest';

import { Note, NOTES_ENTITIES } from '../apps/notes/notes.entities';
import { WeatherCity } from '../apps/weather/weather.entities';
import { DesktopFile } from '../disk/desktop-file.entity';
import { CalendarEventRow, CalendarListRow } from '../services/calendar.entities';
import { DATA_DOMAINS, domainOf } from './seeds';
import { SystemPreference } from './system-preference.entity';

describe('domainOf：实体所属的数据域', () => {
  it('返回实体所在的那个数据域', () => {
    expect(domainOf(Note)?.domain).toBe('notes');
    expect(domainOf(WeatherCity)?.domain).toBe('weather');
  });

  it('同一个数据域的多个实体回到同一个域对象', () => {
    expect(domainOf(CalendarListRow)).toBe(domainOf(CalendarEventRow));
    expect(domainOf(CalendarListRow)?.domain).toBe('calendar');
  });

  it('登记的每个实体都能反查回它的数据域', () => {
    for (const domain of DATA_DOMAINS) for (const entity of domain.entities) expect(domainOf(entity)).toBe(domain);
    expect(domainOf(NOTES_ENTITIES[0])).toBe(DATA_DOMAINS.find(domain => domain.domain === 'notes'));
  });

  it('没有数据域的实体（系统偏好、磁盘文件行）和不认识的类都是 undefined', () => {
    expect(domainOf(SystemPreference)).toBeUndefined();
    expect(domainOf(DesktopFile)).toBeUndefined();
    expect(domainOf(class Stranger {})).toBeUndefined();
  });
});

describe('DATA_DOMAINS', () => {
  it('每个数据域的 load 动态导入各自的种子，并返回同一个种子对象', async () => {
    const weather = DATA_DOMAINS.find(domain => domain.domain === 'weather');
    const first = await weather?.load();
    const second = await weather?.load();
    expect(first?.domain).toBe('weather');
    expect(second).toBe(first);
  });
});
