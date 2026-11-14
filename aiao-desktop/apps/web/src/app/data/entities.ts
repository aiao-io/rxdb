import type { EntityType } from '@aiao/rxdb';

import { CLOCK_ENTITIES } from '../apps/clock/clock.entities';
import { CONTACTS_ENTITIES } from '../apps/contacts/contacts.entities';
import { FACETIME_ENTITIES } from '../apps/facetime/facetime.entities';
import { FONT_BOOK_ENTITIES } from '../apps/font-book/font-book.entities';
import { FREEFORM_ENTITIES } from '../apps/freeform/freeform.entities';
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
import { DesktopFile } from '../disk/desktop-file.entity';
import { CALENDAR_ENTITIES } from '../services/calendar.entities';
import { SystemPreference } from './system-preference.entity';

/**
 * 桌面库的全部实体。各内置应用把自己的实体数组展开到这里（每个应用一行），
 * storage 插件的文件元数据实体由插件自己登记。
 */
export const DESKTOP_ENTITIES: readonly EntityType[] = [
  SystemPreference,
  DesktopFile,
  ...NOTES_ENTITIES,
  ...REMINDERS_ENTITIES,
  ...CALENDAR_ENTITIES,
  ...CONTACTS_ENTITIES,
  ...MAIL_ENTITIES,
  ...MESSAGES_ENTITIES,
  ...PHOTOS_ENTITIES,
  ...MUSIC_ENTITIES,
  ...VOICE_MEMOS_ENTITIES,
  ...STOCKS_ENTITIES,
  ...WEATHER_ENTITIES,
  ...CLOCK_ENTITIES,
  ...FREEFORM_ENTITIES,
  ...SAFARI_ENTITIES,
  ...MAPS_ENTITIES,
  ...FACETIME_ENTITIES,
  ...SHELF_ENTITIES,
  ...FONT_BOOK_ENTITIES
];
