import { Service, computed, signal } from '@angular/core';

/** 日历既是筛选器也是颜色来源：事件自身没有颜色，继承所属日历。 */
export interface CalendarList {
  readonly id: string;
  readonly name: string;
  readonly c: string;
  readonly on: boolean;
}

/** 日历事件。`s` 是午夜起的分钟数，`null` 表示全天；`dur` 为时长分钟。 */
export interface CalendarEvent {
  readonly id: number;
  readonly d: readonly [number, number, number];
  readonly t: string;
  readonly s: number | null;
  readonly dur: number;
  readonly cal: string;
  readonly loc: string;
  readonly notes: string;
}

export type CalendarEventDraft = Omit<CalendarEvent, 'id'>;

/** 分钟数转 `9:30 AM`。 */
export function clockLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** 事件在列表里显示的时间：全天或开始时刻。 */
export const eventTime = (event: CalendarEvent): string => (event.s === null ? 'all-day' : clockLabel(event.s));

type EventSeed = Pick<CalendarEventDraft, 'd' | 't' | 's' | 'cal'> & Partial<Pick<CalendarEventDraft, 'dur' | 'loc'>>;

const SEED: readonly EventSeed[] = [
  { d: [2026, 6, 27], t: 'Sprint planning', s: 570, dur: 45, cal: 'work' },
  { d: [2026, 6, 27], t: 'Dentist', s: 930, dur: 40, cal: 'home', loc: 'Dr. Reed · Stevens Creek' },
  { d: [2026, 6, 27], t: 'Dinner — Kate', s: 1200, dur: 120, cal: 'home', loc: 'Bar Aldo' },
  { d: [2026, 6, 28], t: 'One-on-one with Daniel', s: 630, dur: 30, cal: 'work' },
  { d: [2026, 6, 28], t: 'Deploy window', s: 1020, dur: 90, cal: 'work' },
  { d: [2026, 6, 29], t: 'Review PR #142', s: 660, dur: 60, cal: 'work' },
  { d: [2026, 6, 29], t: 'David — coffee', s: 1050, dur: 45, cal: 'home', loc: 'Third Wave' },
  { d: [2026, 6, 30], t: 'Podcast recording', s: 1020, dur: 90, cal: 'work', loc: 'Studio B' },
  { d: [2026, 7, 3], t: 'Flight to SFO', s: 375, dur: 210, cal: 'home', loc: 'BLR T2' },
  { d: [2026, 6, 21], t: 'Design review', s: 840, dur: 60, cal: 'work' },
  { d: [2026, 6, 15], t: 'Beta cutoff', s: null, cal: 'work' },
  { d: [2026, 6, 31], t: "John's birthday", s: null, cal: 'bday' },
  { d: [2026, 7, 15], t: 'Independence Day', s: null, cal: 'hol' }
];

const dayIndex = (d: readonly [number, number, number]): number => new Date(d[0], d[1], d[2]).getTime();

/** 日历与事件；日历应用、桌面和通知中心的小组件共用一份。 */
@Service({ autoProvided: false })
export class CalendarStore {
  private seq = 0;

  readonly calendars = signal<readonly CalendarList[]>([
    { id: 'home', name: 'Home', c: '#ff375f', on: true },
    { id: 'work', name: 'Work', c: '#0a84ff', on: true },
    { id: 'bday', name: 'Birthdays', c: '#30d158', on: true },
    { id: 'hol', name: 'Holidays', c: '#bf5af2', on: true }
  ]);

  readonly events = signal<readonly CalendarEvent[]>(
    SEED.map(seed => this.create({ dur: 60, loc: '', notes: '', ...seed }))
  );

  /** 可见日历上的事件，供侧栏「即将到来」使用。 */
  readonly visibleEvents = computed(() => this.events().filter(event => this.calendarOf(event.cal).on));

  calendarOf(id: string): CalendarList {
    const calendars = this.calendars();
    return calendars.find(calendar => calendar.id === id) ?? calendars[0];
  }

  colorOf(event: CalendarEvent): string {
    return this.calendarOf(event.cal).c;
  }

  /** 某天可见的事件，按一天里发生的顺序（全天在前）。 */
  on(year: number, month: number, day: number): CalendarEvent[] {
    return this.visibleEvents()
      .filter(event => event.d[0] === year && event.d[1] === month && event.d[2] === day)
      .sort((a, b) =>
        a.s === null ? -1
        : b.s === null ? 1
        : a.s - b.s
      );
  }

  /** 今天及以后的前几项。 */
  upcoming(today: Date, count: number): CalendarEvent[] {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return this.visibleEvents()
      .filter(event => dayIndex(event.d) >= start)
      .sort((a, b) => dayIndex(a.d) - dayIndex(b.d) || (a.s ?? -1) - (b.s ?? -1))
      .slice(0, count);
  }

  toggleCalendar(id: string): void {
    this.calendars.update(list =>
      list.map(calendar => (calendar.id === id ? { ...calendar, on: !calendar.on } : calendar))
    );
  }

  add(draft: CalendarEventDraft): CalendarEvent {
    const event = this.create(draft);
    this.events.update(list => [...list, event]);
    return event;
  }

  update(id: number, patch: Partial<CalendarEventDraft>): void {
    this.events.update(list => list.map(event => (event.id === id ? { ...event, ...patch } : event)));
  }

  remove(id: number): void {
    this.events.update(list => list.filter(event => event.id !== id));
  }

  private create(draft: CalendarEventDraft): CalendarEvent {
    return { ...draft, id: ++this.seq };
  }
}
