import type { EntityType, RxDB, TransactionExecutor } from '@aiao/rxdb';

import { CLOCK_ENTITIES } from '../apps/clock/clock.entities';
import { CONTACTS_ENTITIES } from '../apps/contacts/contacts.entities';
import { FACETIME_ENTITIES } from '../apps/facetime/facetime.entities';
import { FONT_BOOK_ENTITIES } from '../apps/font-book/font-book.entities';
import { MAIL_ENTITIES } from '../apps/mail/mail.entities';
import { MAPS_ENTITIES } from '../apps/maps/maps.entities';
import { MESSAGES_ENTITIES } from '../apps/messages/messages.entities';
import { MUSIC_ENTITIES } from '../apps/music/music.entities';
import { NOTES_ENTITIES } from '../apps/notes/notes.entities';
import { PHOTOS_ENTITIES } from '../apps/photos/photos.entities';
import { REMINDERS_ENTITIES } from '../apps/reminders/reminders.entities';
import { SAFARI_ENTITIES } from '../apps/safari/safari.entities';
import { SHELF_ENTITIES } from '../apps/shelf/shelf.entities';
import { STOCKS_ENTITIES } from '../apps/stocks/stocks.entities';
import { VOICE_MEMOS_ENTITIES } from '../apps/voice-memos/voice-memos.entities';
import { WEATHER_ENTITIES } from '../apps/weather/weather.entities';
import { CALENDAR_ENTITIES } from '../services/calendar.entities';

/**
 * 一个数据域的初始数据：第一次被读取时在一个事务里写入，和种子标记（`seed:<domain>`）一起提交，
 * 所以要么完整写入、要么什么都没写。之后用户的增删改都保留，不再重写。
 */
export interface DataSeed {
  readonly domain: string;
  /** 改了初始数据时递增；只影响新库，已有库不会被覆盖。 */
  readonly version: number;
  /** 只能经 `executor.getRepository(…)` 写入；实体用 `rxdb.entityManager.instantiate` 创建。 */
  run(executor: TransactionExecutor, rxdb: RxDB): Promise<void>;
}

/**
 * 一个数据域（ADESK-US-206，D-18）：属于它的任何一个实体第一次被读取，才装载并写入种子，
 * 而不是桌面一启动就把全部应用的种子都写一遍。种子数据模块用动态导入，不进首屏；
 * 打开应用 A 不会触发应用 B 独有的数据域。壳层自己读的域（通知中心的日历、天气、股票、提醒事项小组件）
 * 在壳层第一次读它时触发。实体本身随库一起登记（`entities.ts`），建表不受影响。
 */
export interface DataDomain {
  readonly domain: string;
  /** 这个数据域的实体。 */
  readonly entities: readonly EntityType[];
  /** 装载种子（动态导入）。 */
  load(): Promise<DataSeed>;
}

/** 各内置应用的数据域（每个应用一行）。磁盘的初始内容带文件体，由 FileSystem 单独写入。 */
export const DATA_DOMAINS: readonly DataDomain[] = [
  { domain: 'notes', entities: NOTES_ENTITIES, load: () => import('../apps/notes/notes.seed').then(m => m.NOTES_SEED) },
  {
    domain: 'reminders',
    entities: REMINDERS_ENTITIES,
    load: () => import('../apps/reminders/reminders.seed').then(m => m.REMINDERS_SEED)
  },
  {
    domain: 'calendar',
    entities: CALENDAR_ENTITIES,
    load: () => import('../services/calendar.seed').then(m => m.CALENDAR_SEED)
  },
  {
    domain: 'contacts',
    entities: CONTACTS_ENTITIES,
    load: () => import('../apps/contacts/contacts.seed').then(m => m.CONTACTS_SEED)
  },
  { domain: 'mail', entities: MAIL_ENTITIES, load: () => import('../apps/mail/mail.seed').then(m => m.MAIL_SEED) },
  {
    domain: 'messages',
    entities: MESSAGES_ENTITIES,
    load: () => import('../apps/messages/messages.seed').then(m => m.MESSAGES_SEED)
  },
  {
    domain: 'photos',
    entities: PHOTOS_ENTITIES,
    load: () => import('../apps/photos/photos.seed').then(m => m.PHOTOS_SEED)
  },
  { domain: 'music', entities: MUSIC_ENTITIES, load: () => import('../apps/music/music.seed').then(m => m.MUSIC_SEED) },
  {
    domain: 'voice',
    entities: VOICE_MEMOS_ENTITIES,
    load: () => import('../apps/voice-memos/voice-memos.seed').then(m => m.VOICE_MEMOS_SEED)
  },
  {
    domain: 'stocks',
    entities: STOCKS_ENTITIES,
    load: () => import('../apps/stocks/stocks.seed').then(m => m.STOCKS_SEED)
  },
  {
    domain: 'weather',
    entities: WEATHER_ENTITIES,
    load: () => import('../apps/weather/weather.seed').then(m => m.WEATHER_SEED)
  },
  { domain: 'clock', entities: CLOCK_ENTITIES, load: () => import('../apps/clock/clock.seed').then(m => m.CLOCK_SEED) },
  {
    domain: 'safari',
    entities: SAFARI_ENTITIES,
    load: () => import('../apps/safari/safari.seed').then(m => m.SAFARI_SEED)
  },
  { domain: 'maps', entities: MAPS_ENTITIES, load: () => import('../apps/maps/maps.seed').then(m => m.MAPS_SEED) },
  {
    domain: 'facetime',
    entities: FACETIME_ENTITIES,
    load: () => import('../apps/facetime/facetime.seed').then(m => m.FACETIME_SEED)
  },
  { domain: 'shelf', entities: SHELF_ENTITIES, load: () => import('../apps/shelf/shelf.seed').then(m => m.SHELF_SEED) },
  {
    domain: 'fontbook',
    entities: FONT_BOOK_ENTITIES,
    load: () => import('../apps/font-book/font-book.seed').then(m => m.FONT_BOOK_SEED)
  }
];

/** 实体所属的数据域；没有数据域的实体（系统偏好、磁盘文件行、Freeform 笔迹）为 `undefined`。 */
export function domainOf(entity: EntityType): DataDomain | undefined {
  return DATA_DOMAINS.find(domain => domain.entities.includes(entity));
}
