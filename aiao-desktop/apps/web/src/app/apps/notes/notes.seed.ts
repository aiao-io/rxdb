import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { SEED_NOTES } from './notes-data';
import { Note } from './notes.entities';

/** 备忘录的初始数据：六条示例笔记（五条在 Notes，其中一条置顶；一条在 Recently Deleted），顺序与原界面一致。 */
export const NOTES_SEED: DataSeed = {
  domain: 'notes',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const notes = executor.getRepository(Note);
    for (const seed of SEED_NOTES) {
      await notes.create(rxdb.entityManager.instantiate(Note, { ...seed, pinned: seed.pinned ?? false }));
    }
  }
};
