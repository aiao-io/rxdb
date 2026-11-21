import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { MEMO_SEED_DATA } from './voice-memos-data';
import { VoiceMemo } from './voice-memos.entities';

/** 语音备忘录的初始数据：四条备忘录的元数据（顺序与原来一致）。 */
export const VOICE_MEMOS_SEED: DataSeed = {
  domain: 'voice',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const memos = executor.getRepository(VoiceMemo);
    for (const [position, memo] of MEMO_SEED_DATA.entries())
      await memos.create(
        rxdb.entityManager.instantiate(VoiceMemo, {
          title: memo.title,
          recordedLabel: memo.recorded,
          duration: memo.duration,
          position
        })
      );
  }
};
