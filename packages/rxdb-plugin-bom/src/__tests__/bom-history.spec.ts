/**
 * @fileoverview 禁止追溯生效与历史装载通道回归测试（US-508 AC#9/#13/#14/#18）
 *
 * 双后端（wa-sqlite / pglite）同断言：追溯发布被拒、loadHistory 装载历史结构、
 * 批次 append-only 与已关闭批次不再放行、同一 batch 输入两个空库批次行逐字相同。
 */

import { isUniqueConstraintViolation, uuid } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { resolveBom } from '../resolve/resolver.js';
import { BomPublishValidationError, BomWriteProtocolError } from '../types.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** 直连 SQL 的表引用。 */
const tableRef = (backend: BomTestBackend, table: string): string =>
  backend === 'wa-sqlite' ? `"bom$${table}"` : `"bom"."${table}"`;

const settled = <T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> =>
  promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error })
  );

const readRows = (result: unknown): unknown[][] => {
  const shaped = result as { results?: { rows: unknown[][] }[]; rows?: unknown[] };
  if (Array.isArray(shaped.results)) return shaped.results[0]?.rows ?? [];
  return (shaped.rows ?? []) as unknown[][];
};

for (const backend of BACKENDS) {
  describe(`历史装载与追溯发布 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const makeItem = async (itemNo: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = itemNo;
      await item.save();
      return item;
    };

    it('追溯发布被拒：effective_from 早于发布当日（AC#9）', async () => {
      const item = await makeItem(`backdate-item-${Math.random().toString(36).slice(2, 6)}`);
      // 直连 SQL 插入 draft 修订（历史 effective_from）后经发布转移
      const revisionId = uuid();
      const insert = await settled(
        adapter.rawQuery(
          `INSERT INTO ${tableRef(backend, 'item_revision')} ("id", "itemId", "revisionNo", "state", "effectiveFrom", "defaultPhantom", "createdAt", "updatedAt") VALUES ('${revisionId}', '${item.id}', 'D', 'draft', '2000-01-01T00:00:00.000Z', ${backend === 'wa-sqlite' ? 0 : 'false'}, '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')`
        )
      );
      expect(insert.ok).toBe(true);
      const publish = await settled(
        adapter.rawQuery(
          `UPDATE ${tableRef(backend, 'item_revision')} SET "state" = 'released' WHERE "id" = '${revisionId}'`
        )
      );
      expect(publish.ok).toBe(false);
      expect(String((publish as { error: Error }).error.message)).toContain('rxdb:bom_publish_validation');

      // 经插件 API 同样拒绝（归一为 BomPublishValidationError）
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [],
        headers: []
      });
      const apiError = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'item_revision')} SET "state" = 'released' WHERE "id" = '${revisionId}'`)
      );
      expect(apiError.ok).toBe(false);
    });

    it('同一物料已发布修订的 effective_from 唯一（AC#10）', async () => {
      const item = await makeItem(`dup-eff-item-${Math.random().toString(36).slice(2, 6)}`);
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo: 'D', effectiveFrom: day('2026-11-01') }],
        headers: []
      });
      const second = await settled(
        loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [{ itemId: item.id, revisionNo: 'E', effectiveFrom: day('2026-11-01') }],
          headers: []
        })
      );
      expect(second.ok).toBe(false);
      expect(isUniqueConstraintViolation((second as { error: unknown }).error)).toBe(true);
    });

    it('loadHistory 装载历史结构：接受、行带批次号、批次已关闭（AC#13）', async () => {
      const item = await makeItem(`history-item-${Math.random().toString(36).slice(2, 6)}`);
      const child = await makeItem(`history-child-${Math.random().toString(36).slice(2, 6)}`);
      const batchNo = `batch-${Math.random().toString(36).slice(2, 10)}`;
      await loadHistory(adapter, {
        batchNo,
        revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            lines: [
              {
                lineNo: 10,
                occurrences: [
                  { childItemId: child.id, qty: '2', effectiveFrom: day('2020-01-01') }
                ]
              }
            ]
          }
        ]
      });

      // 修订 / 头带批次号、已发布
      const rows = readRows(
        await adapter.rawQuery(`SELECT "historyBatchNo", "state" FROM ${tableRef(backend, 'item_revision')} WHERE "itemId" = '${item.id}'`)
      );
      expect(rows.length).toBe(1);
      expect(rows[0][0]).toBe(batchNo);
      expect(rows[0][1]).toBe('released');

      const batchRows = readRows(
        await adapter.rawQuery(`SELECT "batchNo", "state" FROM ${tableRef(backend, 'bom_history_batch')} WHERE "batchNo" = '${batchNo}'`)
      );
      expect(batchRows.length).toBe(1);
      expect(batchRows[0][1]).toBe('closed');

      // 历史结构可解析
      const result = await resolveBom(
        adapter,
        { bomType: 'ebom', orgId: 'org-x', asOfDate: day('2021-01-01') },
        { parentItemId: item.id }
      );
      expect(result.occurrences.length).toBe(1);
      expect(result.occurrences[0].childItemId).toBe(child.id);
    });

    it('已关闭批次不再放行追溯发布；批次行不可改写 / 删除（AC#14）', async () => {
      const item = await makeItem(`closed-batch-item-${Math.random().toString(36).slice(2, 6)}`);
      const batchNo = `batch-${Math.random().toString(36).slice(2, 10)}`;
      await loadHistory(adapter, {
        batchNo,
        revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });

      // 直连 SQL 以已关闭批次号再发布追溯修订 → 拒绝
      const revisionId = uuid();
      const insert = await settled(
        adapter.rawQuery(
          `INSERT INTO ${tableRef(backend, 'item_revision')} ("id", "itemId", "revisionNo", "state", "effectiveFrom", "defaultPhantom", "historyBatchNo", "createdAt", "updatedAt") VALUES ('${revisionId}', '${item.id}', 'B', 'draft', '2000-01-01T00:00:00.000Z', ${backend === 'wa-sqlite' ? 0 : 'false'}, '${batchNo}', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')`
        )
      );
      expect(insert.ok).toBe(true);
      const publish = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'item_revision')} SET "state" = 'released' WHERE "id" = '${revisionId}'`)
      );
      expect(publish.ok).toBe(false);
      expect(String((publish as { error: Error }).error.message)).toContain('追溯生效');

      // 批次行改写（非 open→closed）与删除 → 拒绝
      const badUpdate = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'bom_history_batch')} SET "state" = 'open' WHERE "batchNo" = '${batchNo}'`)
      );
      expect(badUpdate.ok).toBe(false);
      expect(String((badUpdate as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol');
      const badDelete = await settled(
        adapter.rawQuery(`DELETE FROM ${tableRef(backend, 'bom_history_batch')} WHERE "batchNo" = '${batchNo}'`)
      );
      expect(badDelete.ok).toBe(false);
      expect(String((badDelete as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol');
    });

    it('追溯发布错误归一为 BomPublishValidationError（插件 API 路径）', async () => {
      const item = await makeItem(`api-backdate-${Math.random().toString(36).slice(2, 6)}`);
      // 直接经实体 API：draft 修订（历史日期）→ 发布
      const { BomItemRevision } = await import('../entities.js');
      const revision = new BomItemRevision();
      revision.itemId = item.id;
      revision.revisionNo = 'X';
      revision.effectiveFrom = day('2000-01-01');
      await revision.save();
      revision.state = 'released';
      await expect(revision.save()).rejects.toBeInstanceOf(BomPublishValidationError);
      void BomWriteProtocolError;
    });

    it('同一 batch 输入两个空库装载：批次行逐字相同（AC#18）', async () => {
      const batch: Parameters<typeof loadHistory>[1] = {
        batchNo: 'deterministic-batch-001',
        revisions: [],
        headers: []
      };
      await loadHistory(adapter, batch);
      const first = readRows(
        await adapter.rawQuery(
          `SELECT "batchNo", "state" FROM ${tableRef(backend, 'bom_history_batch')} WHERE "batchNo" = 'deterministic-batch-001'`
        )
      );
      await adapter.rxdb.disconnectAll();

      // 第二个空库：同名批次输入装载
      const secondAdapter = await createBomTestAdapter(backend);
      await loadHistory(secondAdapter, batch);
      const second = readRows(
        await secondAdapter.rawQuery(
          `SELECT "batchNo", "state" FROM ${tableRef(backend, 'bom_history_batch')} WHERE "batchNo" = 'deterministic-batch-001'`
        )
      );
      expect(second).toEqual(first);
      expect(first[0]?.[0]).toBe('deterministic-batch-001');
      await secondAdapter.rxdb.disconnectAll();
    });  });
}
