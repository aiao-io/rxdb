import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import { CLOCK_SEED } from '../apps/clock/clock.seed';
import { CONTACTS_SEED } from '../apps/contacts/contacts.seed';
import { FACETIME_SEED } from '../apps/facetime/facetime.seed';
import { FONT_BOOK_SEED } from '../apps/font-book/font-book.seed';
import { MAIL_SEED } from '../apps/mail/mail.seed';
import { MAPS_SEED } from '../apps/maps/maps.seed';
import { MESSAGES_SEED } from '../apps/messages/messages.seed';
import { MUSIC_SEED } from '../apps/music/music.seed';
import { NOTES_SEED } from '../apps/notes/notes.seed';
import { PHOTOS_SEED } from '../apps/photos/photos.seed';
import { REMINDERS_SEED } from '../apps/reminders/reminders.seed';
import { SAFARI_SEED } from '../apps/safari/safari.seed';
import { SHELF_SEED } from '../apps/shelf/shelf.seed';
import { STOCKS_SEED } from '../apps/stocks/stocks.seed';
import { VOICE_MEMOS_SEED } from '../apps/voice-memos/voice-memos.seed';
import { WEATHER_SEED } from '../apps/weather/weather.seed';
import { CALENDAR_SEED } from '../services/calendar.seed';

/**
 * 一个数据域的初始数据：首次打开时在一个事务里写入，和种子标记（`seed:<domain>`）一起提交，
 * 所以要么完整写入、要么什么都没写。之后用户的增删改都保留，不再重写。
 */
export interface DataSeed {
  readonly domain: string;
  /** 改了初始数据时递增；只影响新库，已有库不会被覆盖。 */
  readonly version: number;
  /** 只能经 `executor.getRepository(…)` 写入；实体用 `rxdb.entityManager.instantiate` 创建。 */
  run(executor: TransactionExecutor, rxdb: RxDB): Promise<void>;
}

/** 各内置应用的初始数据（每个应用一行）。磁盘的初始内容带文件体，由 FileSystem 单独写入。 */
export const DATA_SEEDS: readonly DataSeed[] = [
  NOTES_SEED,
  REMINDERS_SEED,
  CALENDAR_SEED,
  CONTACTS_SEED,
  MAIL_SEED,
  MESSAGES_SEED,
  PHOTOS_SEED,
  MUSIC_SEED,
  VOICE_MEMOS_SEED,
  STOCKS_SEED,
  WEATHER_SEED,
  CLOCK_SEED,
  SAFARI_SEED,
  MAPS_SEED,
  FACETIME_SEED,
  SHELF_SEED,
  FONT_BOOK_SEED
];
