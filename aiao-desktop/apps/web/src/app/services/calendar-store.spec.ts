import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { configureServices } from '../testing/angular';
import { FakeDesktopData, restoreEntityStubs, stubFindAll } from '../testing/fake-desktop-data';
import { SEED_CALENDARS, SEED_EVENTS } from './calendar-data';
import { CalendarEventDraft, CalendarStore, clockLabel, eventTime } from './calendar-store';
import { CalendarEventRow, CalendarListRow } from './calendar.entities';
import { CALENDAR_SEED } from './calendar.seed';

interface ListRow {
  id?: string;
  key: string;
  name: string;
  color: string;
  visible: boolean;
  position: number;
}

interface EventRow {
  id?: string;
  day: string;
  title: string;
  startMinutes: number | null;
  durationMinutes: number;
  calendar: string;
  location: string;
  notes: string;
}

const LISTS: ListRow[] = [
  { key: 'home', name: 'Home', color: '#ff375f', visible: true, position: 0 },
  { key: 'work', name: 'Work', color: '#0a84ff', visible: true, position: 1 },
  { key: 'hol', name: 'Holidays', color: '#bf5af2', visible: false, position: 2 }
];

const event = (patch: Partial<EventRow>): EventRow => ({
  day: '2026-07-27',
  title: 'Event',
  startMinutes: 600,
  durationMinutes: 60,
  calendar: 'home',
  location: '',
  notes: '',
  ...patch
});

/** 让库就绪后的活查询订阅跑一轮。 */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

async function setup(events: EventRow[] = []) {
  const data = new FakeDesktopData();
  const lists = data.table<ListRow>(CalendarListRow);
  const rows = data.table<EventRow>(CalendarEventRow);
  lists.seed(LISTS);
  rows.seed(events);
  stubFindAll(CalendarListRow, lists.rows$ as Observable<ListRow[]>);
  stubFindAll(CalendarEventRow, rows.rows$ as Observable<EventRow[]>);
  configureServices([CalendarStore, { provide: DesktopData, useValue: data }]);
  const store = TestBed.inject(CalendarStore);
  await tick();
  return { store, data, lists, rows };
}

afterEach(() => {
  restoreEntityStubs();
});

describe('时间标签', () => {
  it('clockLabel 把午夜起的分钟数写成 12 小时制', () => {
    expect(clockLabel(0)).toBe('12:00 AM');
    expect(clockLabel(570)).toBe('9:30 AM');
    expect(clockLabel(720)).toBe('12:00 PM');
    expect(clockLabel(1200)).toBe('8:00 PM');
    expect(clockLabel(1439)).toBe('11:59 PM');
  });

  it('eventTime：全天事件显示 all-day，其余显示开始时刻', () => {
    const base = { id: '1', d: [2026, 6, 27], t: 'x', dur: 60, cal: 'home', loc: '', notes: '' } as const;
    expect(eventTime({ ...base, s: null })).toBe('all-day');
    expect(eventTime({ ...base, s: 930 })).toBe('3:30 PM');
  });
});

describe('CalendarStore 读', () => {
  it('读之前先保证日历与事件所属的数据域已经种过初始数据（首次读取才种）', async () => {
    const { data } = await setup();
    expect(data.ensureSeeded).toHaveBeenCalledWith(CalendarListRow);
    expect(data.ensureSeeded).toHaveBeenCalledWith(CalendarEventRow);
  });

  it('库就绪后给出全部日历（侧栏顺序）和事件', async () => {
    const { store } = await setup([event({ title: 'Dentist' })]);
    expect(store.calendars().map(calendar => calendar.id)).toEqual(['home', 'work', 'hol']);
    expect(store.calendars()[0]).toEqual({ id: 'home', name: 'Home', c: '#ff375f', on: true });
    expect(store.events()).toHaveLength(1);
    expect(store.events()[0]).toMatchObject({ t: 'Dentist', d: [2026, 6, 27], s: 600, cal: 'home' });
  });

  it('库还没就绪时日历与事件都为空', () => {
    const data = new FakeDesktopData();
    data.ready = new Promise(() => undefined);
    configureServices([CalendarStore, { provide: DesktopData, useValue: data }]);
    const store = TestBed.inject(CalendarStore);
    expect(store.calendars()).toEqual([]);
    expect(store.events()).toEqual([]);
  });

  it('visibleEvents 只含勾选日历上的事件', async () => {
    const { store } = await setup([
      event({ title: 'Visible', calendar: 'work' }),
      event({ title: 'Hidden', calendar: 'hol' }),
      event({ title: 'Orphan', calendar: 'nope' })
    ]);
    expect(store.visibleEvents().map(item => item.t)).toEqual(['Visible']);
  });

  it('calendarOf 按 key 取日历，不认识的 key 抛错；colorOf 继承所属日历', async () => {
    const { store } = await setup([event({ calendar: 'work' })]);
    expect(store.calendarOf('work').name).toBe('Work');
    expect(() => store.calendarOf('nope')).toThrow('Unknown calendar: nope');
    expect(store.colorOf(store.events()[0])).toBe('#0a84ff');
  });

  it('on 取某天可见的事件，全天事件在前，其余按开始时间', async () => {
    const { store } = await setup([
      event({ title: 'Late', startMinutes: 1200 }),
      event({ title: 'Early', startMinutes: 540 }),
      event({ title: 'Allday', startMinutes: null }),
      event({ title: 'Other day', day: '2026-07-28' }),
      event({ title: 'Hidden', calendar: 'hol' })
    ]);
    expect(store.on(2026, 6, 27).map(item => item.t)).toEqual(['Allday', 'Early', 'Late']);
    expect(store.on(2026, 6, 28).map(item => item.t)).toEqual(['Other day']);
    expect(store.on(2026, 6, 1)).toEqual([]);
  });

  it('upcoming 取今天及以后的前几项，按日期和开始时间排序', async () => {
    const { store } = await setup([
      event({ title: 'Past', day: '2026-07-20' }),
      event({ title: 'Today late', startMinutes: 900 }),
      event({ title: 'Today allday', startMinutes: null }),
      event({ title: 'Tomorrow', day: '2026-07-28' }),
      event({ title: 'Next week', day: '2026-08-03' })
    ]);
    const today = new Date(2026, 6, 27, 15, 0);
    expect(store.upcoming(today, 10).map(item => item.t)).toEqual([
      'Today allday',
      'Today late',
      'Tomorrow',
      'Next week'
    ]);
    expect(store.upcoming(today, 2).map(item => item.t)).toEqual(['Today allday', 'Today late']);
  });
});

describe('CalendarStore 写', () => {
  it('toggleCalendar 勾选或取消勾选，改动写进库，可见事件随之变化', async () => {
    const { store, lists } = await setup([event({ title: 'Holiday', calendar: 'hol' })]);
    expect(store.visibleEvents()).toEqual([]);
    await store.toggleCalendar('hol');
    expect(lists.rows.find(row => row.key === 'hol')?.visible).toBe(true);
    expect(store.visibleEvents().map(item => item.t)).toEqual(['Holiday']);

    await store.toggleCalendar('home');
    expect(lists.rows.find(row => row.key === 'home')?.visible).toBe(false);
  });

  it('toggleCalendar 不认识的日历抛错', async () => {
    const { store } = await setup();
    await expect(store.toggleCalendar('nope')).rejects.toThrow('Unknown calendar: nope');
  });

  it('add 把草稿转成库里的字段新建一行', async () => {
    const { store, rows } = await setup();
    const draft: CalendarEventDraft = {
      d: [2026, 6, 29],
      t: 'Review',
      s: 660,
      dur: 30,
      cal: 'work',
      loc: 'Room 4',
      notes: 'bring laptop'
    };
    await store.add(draft);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      day: '2026-07-29',
      title: 'Review',
      startMinutes: 660,
      durationMinutes: 30,
      calendar: 'work',
      location: 'Room 4',
      notes: 'bring laptop'
    });
    expect(store.events()[0].t).toBe('Review');
  });

  it('update 只改传入的字段，其余保持不变；找不到事件抛错', async () => {
    const { store, rows } = await setup([event({ id: 'e1', title: 'Old', location: 'HQ' })]);
    await store.update('e1', { t: 'New', s: null });
    expect(rows.rows[0]).toMatchObject({ title: 'New', startMinutes: null, location: 'HQ', calendar: 'home' });
    await expect(store.update('nope', { t: 'x' })).rejects.toThrow('Calendar event not found: nope');
  });

  it('remove 删掉事件；找不到事件抛错', async () => {
    const { store, rows } = await setup([event({ id: 'e1' }), event({ id: 'e2', title: 'Keep' })]);
    await store.remove('e1');
    expect(rows.rows.map(row => row.title)).toEqual(['Keep']);
    await expect(store.remove('e1')).rejects.toThrow('Calendar event not found: e1');
  });
});

describe('日历的初始数据', () => {
  it('四个日历按侧栏顺序、十三个事件，时长缺省 60 分钟', () => {
    expect(SEED_CALENDARS.map(calendar => calendar.id)).toEqual(['home', 'work', 'bday', 'hol']);
    expect(SEED_EVENTS).toHaveLength(13);
    expect(SEED_EVENTS.find(item => item.t === 'Beta cutoff')).toMatchObject({ s: null, dur: 60, loc: '', notes: '' });
    expect(SEED_EVENTS.find(item => item.t === 'Dentist')).toMatchObject({ dur: 40, loc: 'Dr. Reed · Stevens Creek' });
  });

  it('CALENDAR_SEED 在一个事务里写入全部日历和事件', async () => {
    const created: { type: unknown; data: Record<string, unknown> }[] = [];
    const executor = {
      getRepository: (type: unknown) => ({
        create: vi.fn(async (data: Record<string, unknown>) => {
          created.push({ type, data });
          return data;
        })
      })
    };
    const rxdb = { entityManager: { instantiate: (_type: unknown, data: object) => ({ ...data }) } };

    await CALENDAR_SEED.run(executor as never, rxdb as never);
    expect(CALENDAR_SEED).toMatchObject({ domain: 'calendar', version: 1 });
    const lists = created.filter(item => item.type === CalendarListRow);
    const events = created.filter(item => item.type === CalendarEventRow);
    expect(lists.map(item => item.data['key'])).toEqual(['home', 'work', 'bday', 'hol']);
    expect(lists.map(item => item.data['position'])).toEqual([0, 1, 2, 3]);
    expect(lists[0].data).toMatchObject({ name: 'Home', color: '#ff375f', visible: true });
    expect(events).toHaveLength(13);
    expect(events[0].data).toMatchObject({ day: '2026-07-27', title: 'Sprint planning', calendar: 'work' });
  });
});
