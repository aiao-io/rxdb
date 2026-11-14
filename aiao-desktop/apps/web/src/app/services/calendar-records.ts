import type { CalendarEvent, CalendarEventDraft, CalendarList } from './calendar-store';

/** 事件在库里的字段（实体 `CalendarEventRow` 满足它，测试里用普通对象）。 */
export interface EventFields {
  /** `YYYY-MM-DD`，月份按日常习惯从 1 起；字符串的顺序就是日期的顺序。 */
  readonly day: string;
  readonly title: string;
  /** 午夜起的开始分钟数；`null` 表示全天。 */
  readonly startMinutes: number | null;
  readonly durationMinutes: number;
  /** 所属日历的 `key`（`home`、`work`…）。 */
  readonly calendar: string;
  readonly location: string;
  readonly notes: string;
}

/** 库里的一行事件。 */
export interface EventRecord extends EventFields {
  readonly id: string;
}

/** 库里的一行日历。 */
export interface ListRecord {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  readonly visible: boolean;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const pad2 = (value: number): string => String(value).padStart(2, '0');

const DAY_KEY = /^(-?\d{4,})-(\d{2})-(\d{2})$/;

/** 界面里的事件日期 `[年, 月(0 起), 日]` 转成库里的 `YYYY-MM-DD`。 */
export function dayKey(date: CalendarEvent['d']): string {
  const [year, month, day] = date;
  const digits = String(Math.abs(year)).padStart(4, '0');
  return `${year < 0 ? '-' : ''}${digits}-${pad2(month + 1)}-${pad2(day)}`;
}

/** 库里的 `YYYY-MM-DD` 转回界面里的 `[年, 月(0 起), 日]`；格式不对就抛错，不猜。 */
export function dayOf(key: string): CalendarEvent['d'] {
  const match = DAY_KEY.exec(key);
  if (!match) throw new Error(`Invalid calendar day: ${key}`);
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
}

/** 库里的事件行转成界面用的事件。 */
export const eventOf = (row: EventRecord): CalendarEvent => ({
  id: row.id,
  d: dayOf(row.day),
  t: row.title,
  s: row.startMinutes,
  dur: row.durationMinutes,
  cal: row.calendar,
  loc: row.location,
  notes: row.notes
});

/** 界面里的事件草稿转成库里的字段。 */
export const fieldsOf = (draft: CalendarEventDraft): EventFields => ({
  day: dayKey(draft.d),
  title: draft.t,
  startMinutes: draft.s,
  durationMinutes: draft.dur,
  calendar: draft.cal,
  location: draft.loc,
  notes: draft.notes
});

/** 界面里的部分改动转成库里的字段补丁；没提到的字段不动（`s: null` 是改成全天，不算没提到）。 */
export function patchOf(patch: Partial<CalendarEventDraft>): Partial<EventFields> {
  const fields: Partial<Mutable<EventFields>> = {};
  if (patch.d !== undefined) fields.day = dayKey(patch.d);
  if (patch.t !== undefined) fields.title = patch.t;
  if (patch.s !== undefined) fields.startMinutes = patch.s;
  if (patch.dur !== undefined) fields.durationMinutes = patch.dur;
  if (patch.cal !== undefined) fields.calendar = patch.cal;
  if (patch.loc !== undefined) fields.location = patch.loc;
  if (patch.notes !== undefined) fields.notes = patch.notes;
  return fields;
}

/** 库里的日历行转成界面用的日历：`id` 就是稳定的 `key`。 */
export const listOf = (row: ListRecord): CalendarList => ({
  id: row.key,
  name: row.name,
  c: row.color,
  on: row.visible
});
