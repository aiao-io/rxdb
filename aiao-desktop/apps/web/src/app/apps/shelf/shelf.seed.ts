import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { SHELF_APPS, SHELF_ROWS, ShelfAppId, ShelfRow } from './shelf-data';
import { ShelfItem, ShelfSection } from './shelf.entities';

/** 写入一个应用的一行：先写分区，再写它名下的内容；封面序号 = 条目序号 + 这一行的 seed。 */
async function seedRow(
  executor: TransactionExecutor,
  rxdb: RxDB,
  app: ShelfAppId,
  row: ShelfRow,
  position: number
): Promise<void> {
  const sectionFields = { app, heading: row.head, note: row.sub, ratio: row.ratio, position };
  const sections = executor.getRepository(ShelfSection);
  const section = await sections.create(rxdb.entityManager.instantiate(ShelfSection, sectionFields));
  const items = executor.getRepository(ShelfItem);
  for (const [index, [title, detail]] of row.items.entries()) {
    const itemFields = { app, sectionId: section.id, title, detail, cover: index + row.seed, position: index };
    await items.create(rxdb.entityManager.instantiate(ShelfItem, itemFields));
  }
}

/** 媒体书架的初始数据：四个应用各两行，每行四件内容，次序与原来一致。 */
export const SHELF_SEED: DataSeed = {
  domain: 'shelf',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    for (const app of SHELF_APPS) {
      for (const [position, row] of SHELF_ROWS[app].entries()) await seedRow(executor, rxdb, app, row, position);
    }
  }
};
