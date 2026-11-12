import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { SEED_REMINDERS } from './reminders-data';
import { Reminder } from './reminders.entities';

/** 提醒事项的初始数据：七条提醒（五条待办、两条已完成），顺序与原界面一致。 */
export const REMINDERS_SEED: DataSeed = {
  domain: 'reminders',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const reminders = executor.getRepository(Reminder);
    for (const [position, seed] of SEED_REMINDERS.entries()) {
      await reminders.create(rxdb.entityManager.instantiate(Reminder, { ...seed, position }));
    }
  }
};
