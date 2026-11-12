import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { WorldClock } from './clock.entities';

/** [城市, 与本机的时差（小时）]，次序即表盘排列的次序。 */
const WORLD_CLOCK_SEEDS = [
  ['Cupertino', -12.5],
  ['Kolkata', 0],
  ['London', -4.5],
  ['Tokyo', 3.5]
] as const;

/** 时钟的初始数据：四座城市的世界时钟。 */
export const CLOCK_SEED: DataSeed = {
  domain: 'clock',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const clocks = executor.getRepository(WorldClock);
    for (const [position, [city, offsetHours]] of WORLD_CLOCK_SEEDS.entries()) {
      await clocks.create(rxdb.entityManager.instantiate(WorldClock, { city, offsetHours, position }));
    }
  }
};
