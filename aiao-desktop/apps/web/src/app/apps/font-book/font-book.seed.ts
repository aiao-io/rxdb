import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { FontFamily } from './font-book.entities';

/** [字体族, font-family 声明, 字重说明]，次序即 Family 列表的次序。 */
const FONT_SEEDS = [
  ['SF Pro', '-apple-system,BlinkMacSystemFont,Inter,sans-serif', 'Regular · Medium · Semibold · Bold'],
  ['Inter', 'Inter,sans-serif', 'Variable 100–900'],
  ['Helvetica Neue', '"Helvetica Neue",Helvetica,sans-serif', 'Regular · Bold · Italic'],
  ['Georgia', 'Georgia,serif', 'Regular · Italic · Bold'],
  ['Times New Roman', '"Times New Roman",Times,serif', 'Regular · Bold'],
  ['JetBrains Mono', '"JetBrains Mono",ui-monospace,monospace', 'Regular · Bold'],
  ['Courier New', '"Courier New",monospace', 'Regular · Bold'],
  ['Impact', 'Impact,sans-serif', 'Regular']
] as const;

/** 字体册的初始数据：八个字体族。 */
export const FONT_BOOK_SEED: DataSeed = {
  domain: 'fontbook',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const families = executor.getRepository(FontFamily);
    for (const [position, [name, stack, styles]] of FONT_SEEDS.entries()) {
      await families.create(rxdb.entityManager.instantiate(FontFamily, { name, stack, styles, position }));
    }
  }
};
