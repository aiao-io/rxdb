import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../data/seeds';
import { SEED_CALENDARS, SEED_EVENTS } from './calendar-data';
import { fieldsOf } from './calendar-records';
import { CalendarEventRow, CalendarListRow } from './calendar.entities';

/** 日历的初始数据：四个日历和十三个事件，顺序与原界面一致。 */
export const CALENDAR_SEED: DataSeed = {
  domain: 'calendar',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const lists = executor.getRepository(CalendarListRow);
    for (const [position, calendar] of SEED_CALENDARS.entries()) {
      const { id: key, name, c: color, on: visible } = calendar;
      await lists.create(rxdb.entityManager.instantiate(CalendarListRow, { key, name, color, visible, position }));
    }
    const events = executor.getRepository(CalendarEventRow);
    for (const draft of SEED_EVENTS) {
      await events.create(rxdb.entityManager.instantiate(CalendarEventRow, fieldsOf(draft)));
    }
  }
};
