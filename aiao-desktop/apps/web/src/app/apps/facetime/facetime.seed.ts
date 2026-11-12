import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { callSeeds } from './facetime-log';
import { FaceTimeCall } from './facetime.entities';

/** FaceTime 的初始数据：四条通话记录；时刻按首次打开的那一刻往前推。 */
export const FACETIME_SEED: DataSeed = {
  domain: 'facetime',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const calls = executor.getRepository(FaceTimeCall);
    for (const call of callSeeds(new Date())) {
      await calls.create(rxdb.entityManager.instantiate(FaceTimeCall, call));
    }
  }
};
