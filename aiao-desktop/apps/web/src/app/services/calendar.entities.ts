import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 日历列表里的一个日历（Home、Work…）：既是筛选器也是颜色来源，事件自身没有颜色，继承所属日历。
 * `key` 是稳定的短名，事件用它指向所属日历；`visible` 是侧栏里的勾选状态，所有窗口共用并会保留。
 */
@Entity({
  name: 'CalendarList',
  tableName: 'calendar_list',
  namespace: 'desktop',
  properties: [
    { name: 'key', type: PropertyType.string, required: true },
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'color', type: PropertyType.string, required: true },
    { name: 'visible', type: PropertyType.boolean, default: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'calendar_list_key', properties: ['key'], unique: true }]
})
export class CalendarListRow extends EntityBase {
  declare key: string;
  declare name: string;
  declare color: string;
  declare visible: boolean;
  declare position: number;
}

/**
 * 日历里的一个事件。`day` 是 `YYYY-MM-DD`（字符串顺序即日期顺序），`startMinutes` 是午夜起的开始分钟数
 * （`null` 表示全天），`calendar` 是所属日历的 `key`。
 */
@Entity({
  name: 'CalendarEvent',
  tableName: 'calendar_event',
  namespace: 'desktop',
  properties: [
    { name: 'day', type: PropertyType.string, required: true },
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'startMinutes', columnName: 'start_minutes', type: PropertyType.integer, nullable: true },
    { name: 'durationMinutes', columnName: 'duration_minutes', type: PropertyType.integer, required: true },
    { name: 'calendar', type: PropertyType.string, required: true },
    { name: 'location', type: PropertyType.string, default: '' },
    { name: 'notes', type: PropertyType.string, default: '' }
  ],
  indexes: [{ name: 'calendar_event_day', properties: ['day'] }]
})
export class CalendarEventRow extends EntityBase {
  declare day: string;
  declare title: string;
  declare startMinutes: number | null;
  declare durationMinutes: number;
  declare calendar: string;
  declare location: string;
  declare notes: string;
}

/** 日历登记到桌面库的实体。 */
export const CALENDAR_ENTITIES: readonly EntityType[] = [CalendarListRow, CalendarEventRow];
