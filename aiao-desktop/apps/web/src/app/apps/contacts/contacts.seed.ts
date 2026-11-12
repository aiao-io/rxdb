import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { HOME_ADDRESS, SEED_CONTACTS, emailOf } from './contacts-data';
import { Contact } from './contacts.entities';

/** 通讯录的初始数据：十位联系人，顺序与原界面一致。 */
export const CONTACTS_SEED: DataSeed = {
  domain: 'contacts',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const contacts = executor.getRepository(Contact);
    for (const [position, seed] of SEED_CONTACTS.entries()) {
      const { name, role, color } = seed;
      const contact = rxdb.entityManager.instantiate(Contact, {
        name,
        role,
        color,
        email: emailOf(name),
        address: HOME_ADDRESS,
        position
      });
      await contacts.create(contact);
    }
  }
};
