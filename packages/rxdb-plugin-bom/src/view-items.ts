import type { TransactionExecutor } from '@aiao/rxdb';
import type { BomSqlDialect } from './resolve/bom-sql.js';
import type { BomViewSnapshot } from './view-types.js';

/** 物料 IN 列表的分块大小（避开两后端的绑定变量上限，与展开同口径）。 */
const CHUNK_SIZE = 200;

type ViewItem = BomViewSnapshot['items'][number];

const byId = (left: ViewItem, right: ViewItem): number => (left.id < right.id ? -1 : Number(left.id > right.id));

/** 分块取物料显示信息；合并后按 id 排序，与单条 `ORDER BY "id"` 同序，快照指纹不随分块变化。 */
export const readBomViewItems = async (
  executor: TransactionExecutor,
  dialect: BomSqlDialect,
  ids: readonly string[]
): Promise<ViewItem[]> => {
  const items: ViewItem[] = [];
  for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + CHUNK_SIZE);
    const result = await executor.query(
      `SELECT "id", "itemNo", "description" FROM ${dialect.table('item')} WHERE "id" IN (${chunk.map((_, index) => dialect.placeholder(index)).join(', ')})`,
      chunk
    );
    const indexOf = (column: string) => result.columns.indexOf(column);
    for (const row of result.rows) {
      items.push({
        id: String(row[indexOf('id')]),
        itemNo: String(row[indexOf('itemNo')]),
        description: row[indexOf('description')] == null ? null : String(row[indexOf('description')])
      });
    }
  }
  return items.sort(byId);
};
