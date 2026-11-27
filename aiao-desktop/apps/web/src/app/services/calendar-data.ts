import type { CalendarEventDraft, CalendarList } from './calendar-store';

/** 初始的四个日历，顺序即侧栏顺序，都是勾选状态。 */
export const SEED_CALENDARS: readonly CalendarList[] = [
  { id: 'home', name: 'Home', c: '#ff375f', on: true },
  { id: 'work', name: 'Work', c: '#0a84ff', on: true },
  { id: 'bday', name: 'Birthdays', c: '#30d158', on: true },
  { id: 'hol', name: 'Holidays', c: '#bf5af2', on: true }
];

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

/** 初始事件，顺序与原界面一致；没写时长的按 60 分钟、没写地点与备注的按空串（全天事件也是 60，和原来一样）。 */
export const SEED_EVENTS: readonly CalendarEventDraft[] = SEED.map(seed => ({
  dur: 60,
  loc: '',
  notes: '',
  ...seed
}));
