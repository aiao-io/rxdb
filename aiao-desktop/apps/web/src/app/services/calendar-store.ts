import { Service, computed, inject } from '@angular/core';

import { DesktopData } from '../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../data/live-query';
import { eventOf, fieldsOf, listOf, patchOf } from './calendar-records';
import { CalendarEventRow, CalendarListRow } from './calendar.entities';

/** 日历既是筛选器也是颜色来源：事件自身没有颜色，继承所属日历。`id` 是库里日历行的稳定 `key`。 */
export interface CalendarList {
  readonly id: string;
  readonly name: string;
  readonly c: string;
  readonly on: boolean;
}

/** 日历事件。`id` 是库里事件行的 id；`s` 是午夜起的分钟数，`null` 表示全天；`dur` 为时长分钟。 */
export interface CalendarEvent {
  readonly id: string;
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

const dayIndex = (d: readonly [number, number, number]): number => new Date(d[0], d[1], d[2]).getTime();

/**
 * 日历与事件：存在桌面库里，日历应用、桌面和通知中心的小组件共用一份（活查询，谁改了大家都跟着变）。
 * 读是同步的 signal；写是异步的，写进库、活查询回读之后界面才变。
 */
@Service({ autoProvided: false })
export class CalendarStore {
  private readonly data = inject(DesktopData);
  private readonly listRows = liveQuery(
    () => CalendarListRow.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  private readonly eventRows = liveQuery(
    () =>
      CalendarEventRow.findAll({
        where: ALL_ROWS,
        orderBy: [
          { field: 'day', sort: 'asc' },
          { field: 'createdAt', sort: 'asc' }
        ]
      }),
    []
  );

  /** 全部日历（侧栏顺序），库还没就绪时为空。 */
  readonly calendars = computed(() => this.listRows().map(listOf));

  /** 全部事件（含被隐藏日历上的），库还没就绪时为空。 */
  readonly events = computed(() => this.eventRows().map(eventOf));

  /** 可见日历上的事件，供侧栏「即将到来」使用；所属日历还没加载好的事件先不显示。 */
  readonly visibleEvents = computed(() => {
    const visible = new Set(
      this.calendars()
        .filter(calendar => calendar.on)
        .map(calendar => calendar.id)
    );
    return this.events().filter(event => visible.has(event.cal));
  });

  /** 按 `key` 取日历；不认识的 `key` 抛错，不悄悄换成别的日历。 */
  calendarOf(id: string): CalendarList {
    const calendar = this.calendars().find(item => item.id === id);
    if (!calendar) throw new Error(`Unknown calendar: ${id}`);
    return calendar;
  }

  /** 事件的颜色：继承所属日历。 */
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

  /** 勾选或取消勾选一个日历（`id` 是日历的 `key`）。 */
  async toggleCalendar(id: string): Promise<void> {
    const row = this.listRows().find(item => item.key === id);
    if (!row) throw new Error(`Unknown calendar: ${id}`);
    await (await this.data.repository(CalendarListRow)).update(row, { visible: !row.visible });
  }

  /** 新建一个事件，写进库。 */
  async add(draft: CalendarEventDraft): Promise<void> {
    const repository = await this.data.repository(CalendarEventRow);
    await repository.create(this.data.instantiate(CalendarEventRow, fieldsOf(draft)));
  }

  /** 改一个事件的部分字段；找不到这个 id 就抛错。 */
  async update(id: string, patch: Partial<CalendarEventDraft>): Promise<void> {
    const row = this.eventRow(id);
    await (await this.data.repository(CalendarEventRow)).update(row, patchOf(patch));
  }

  /** 删掉一个事件；找不到这个 id 就抛错。 */
  async remove(id: string): Promise<void> {
    const row = this.eventRow(id);
    await (await this.data.repository(CalendarEventRow)).remove(row);
  }

  private eventRow(id: string): CalendarEventRow {
    const row = this.eventRows().find(item => item.id === id);
    if (!row) throw new Error(`Calendar event not found: ${id}`);
    return row;
  }
}
