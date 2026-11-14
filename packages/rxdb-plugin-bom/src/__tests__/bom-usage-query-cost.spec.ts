import type { TransactionFun } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { BomHeader, BomHistoryBatch, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { whereUsed } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const effectiveFrom = new Date('2020-01-01T00:00:00Z');
const context = { bomType: 'ebom' as const, orgId: 'usage-query-cache', asOfDate: new Date('2026-01-01T00:00:00Z') };

const seedUsageGraph = async (adapter: BomTestAdapter) => {
  const items: BomItem[] = [];
  for (const role of ['root', 'left', 'right', 'leaf', 'above']) {
    const item = new BomItem();
    item.itemNo = `usage-cache-${role}`;
    await item.save();
    items.push(item);
  }
  const [root, left, right, leaf, above] = items;
  await loadHistory(adapter, {
    batchNo: 'usage-cache-initial',
    revisions: items.slice(0, 4).map(item => ({ itemId: item.id, revisionNo: 'A', effectiveFrom })),
    headers: [
      { revisionIndex: 0, children: [left, right, leaf, leaf] },
      { revisionIndex: 1, children: [leaf] },
      { revisionIndex: 2, children: [leaf] }
    ].map(({ revisionIndex, children }) => ({
      revisionIndex,
      bomType: context.bomType,
      orgId: context.orgId,
      lines: children.map((child, index) => ({
        lineNo: 10 + index,
        occurrences: [{ childItemId: child.id, qty: '1', effectiveFrom }]
      }))
    }))
  });
  return { root, left, right, leaf, above };
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`长短路径的同快照反查读取 [${backend}]`, () => {
    it('每个物料只读取一次使用方，保留全部路径且下一次查询看到新增的使用方', async () => {
      const adapter = await createBomTestAdapter(backend);
      const transaction = adapter.transaction;
      try {
        const { root, leaf, above } = await seedUsageGraph(adapter);
        let rootReads = 0;
        adapter.transaction = async <Fun extends TransactionFun>(
          fun: Fun,
          transactionLog?: boolean
        ): Promise<Awaited<ReturnType<Fun>>> =>
          transaction.call(
            adapter,
            async executor => {
              const query = executor.query;
              executor.query = (sql, params) => {
                if (sql.startsWith('SELECT\n  r."itemId" AS "parentItemId"') && params?.includes(root.id))
                  rootReads += 1;
                return query.call(executor, sql, params);
              };
              try {
                return await fun(executor);
              } finally {
                executor.query = query;
              }
            },
            transactionLog
          ) as Promise<Awaited<ReturnType<Fun>>>;
        const first = await whereUsed(adapter, context, { childItemId: leaf.id });
        expect(first.nodes).toHaveLength(6);
        expect(new Set(first.nodes.map(node => JSON.stringify(node.path))).size).toBe(6);
        expect(first.nodes.map(node => node.depth)).toEqual([1, 1, 1, 1, 2, 2]);
        expect(first.nodes.filter(node => node.itemId === root.id)).toHaveLength(4);
        expect(first.truncated).toBeNull();
        expect(first.unresolved).toBeUndefined();
        expect(rootReads).toBe(1);
        await loadHistory(adapter, {
          batchNo: 'usage-cache-new-parent',
          revisions: [{ itemId: above.id, revisionNo: 'A', effectiveFrom }],
          headers: [
            {
              revisionIndex: 0,
              bomType: context.bomType,
              orgId: context.orgId,
              lines: [{ lineNo: 10, occurrences: [{ childItemId: root.id, qty: '1', effectiveFrom }] }]
            }
          ]
        });
        const second = await whereUsed(adapter, context, { childItemId: leaf.id });
        expect(second.nodes).toHaveLength(10);
        expect(new Set(second.nodes.map(node => JSON.stringify(node.path))).size).toBe(10);
        expect(second.nodes.filter(node => node.itemId === above.id)).toHaveLength(4);
        expect(second.truncated).toBeNull();
        expect(second.unresolved).toBeUndefined();
        expect(rootReads).toBe(2);
      } finally {
        adapter.transaction = transaction;
        await disposeBomTestAdapter(adapter);
      }
    });

    it('保留数据库微秒时间的发生项顺序，不因缓存合并而按截断后的毫秒重排', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = new BomHistoryBatch();
        batch.batchNo = 'usage-sort-history';
        await batch.save();
        const leaf = new BomItem();
        leaf.itemNo = 'usage-sort-leaf';
        await leaf.save();
        const headers: BomHeader[] = [];
        const ids: string[] = [];
        for (let index = 0; index < 2; index += 1) {
          const parent = new BomItem();
          parent.itemNo = `usage-sort-parent-${index}`;
          await parent.save();
          const revision = new BomItemRevision();
          revision.itemId = parent.id;
          revision.revisionNo = 'A';
          revision.effectiveFrom = effectiveFrom;
          revision.historyBatchNo = batch.batchNo;
          await revision.save();
          revision.state = 'released';
          await revision.save();
          const header = new BomHeader();
          header.parentRevisionId = revision.id;
          header.bomType = context.bomType;
          header.orgId = context.orgId;
          header.historyBatchNo = batch.batchNo;
          await header.save();
          headers.push(header);
          const line = new BomLine();
          line.headerId = header.id;
          line.lineNo = 10;
          await line.save();
          const occurrence = new BomLineOccurrence();
          occurrence.lineId = line.id;
          occurrence.childItemId = leaf.id;
          occurrence.qty = '1';
          occurrence.effectiveFrom = effectiveFrom;
          await occurrence.save();
          ids.push(occurrence.id);
        }
        ids.sort();
        const dialect = bomSqlDialectFor(backend);
        for (const [index, id] of ids.entries())
          await adapter.rawQuery(
            `UPDATE ${dialect.table('bom_line_occurrence')} SET "effectiveFrom" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
            [`2020-01-01T00:00:00.00000${2 - index}Z`, id]
          );
        for (const header of headers) {
          header.state = 'released';
          await header.save();
        }
        batch.state = 'closed';
        await batch.save();
        const result = await whereUsed(adapter, context, { childItemId: leaf.id });
        expect(result.nodes).toHaveLength(2);
        expect(result.nodes.slice(0, 2).map(node => node.occurrenceId)).toEqual([ids[1], ids[0]]);
        expect(result.truncated).toBeNull();
        expect(result.unresolved).toBeUndefined();
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}
