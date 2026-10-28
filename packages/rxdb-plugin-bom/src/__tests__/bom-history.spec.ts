/**
 * @fileoverview 禁止追溯生效与历史装载通道回归测试（US-508 AC#9/#13/#14/#18）
 *
 * 双后端（wa-sqlite / pglite）同断言：追溯发布被拒、loadHistory 装载历史结构、
 * 批次 append-only 与已关闭批次不再放行、同一 batch 输入两个空库批次行逐字相同；
 * 历史通道的头与发生项写入和仓储同一套保存期校验（扩展属性、选择条件组织、批次集合，评审 P1-2）。
 */

import { isUniqueConstraintViolation, uuid } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomAttrDef,
  BomConfigChar,
  BomConfigCharValue,
  BomConfigCondition,
  BomItem,
  BomItemRevision
} from '../entities.js';
import { BomConfigError } from '../resolve/config-condition.js';
import { BomExtAttrError } from '../resolve/ext-attr.js';
import {
  loadHistory,
  type HistoryBatchInput,
  type HistoryHeaderInput,
  type HistoryOccurrenceInput
} from '../resolve/history-loader.js';
import { BomResolutionError } from '../resolve/resolution.js';
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

      // 经仓储门面发布同一条修订：存储层的拒绝归一为 BomPublishValidationError
      const revisions = adapter.rxdb.entityManager.getRepository(BomItemRevision);
      const revision = await firstValueFrom(revisions.get(revisionId));
      await expect(revisions.update(revision, { state: 'released' })).rejects.toBeInstanceOf(BomPublishValidationError);
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
                occurrences: [{ childItemId: child.id, qty: '2', effectiveFrom: day('2020-01-01') }]
              }
            ]
          }
        ]
      });

      // 修订 / 头带批次号、已发布
      const rows = readRows(
        await adapter.rawQuery(
          `SELECT "historyBatchNo", "state" FROM ${tableRef(backend, 'item_revision')} WHERE "itemId" = '${item.id}'`
        )
      );
      expect(rows.length).toBe(1);
      expect(rows[0][0]).toBe(batchNo);
      expect(rows[0][1]).toBe('released');

      const batchRows = readRows(
        await adapter.rawQuery(
          `SELECT "batchNo", "state" FROM ${tableRef(backend, 'bom_history_batch')} WHERE "batchNo" = '${batchNo}'`
        )
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
        adapter.rawQuery(
          `UPDATE ${tableRef(backend, 'item_revision')} SET "state" = 'released' WHERE "id" = '${revisionId}'`
        )
      );
      expect(publish.ok).toBe(false);
      expect(String((publish as { error: Error }).error.message)).toContain('追溯生效');

      // 批次行改写（非 open→closed）与删除 → 拒绝
      const badUpdate = await settled(
        adapter.rawQuery(
          `UPDATE ${tableRef(backend, 'bom_history_batch')} SET "state" = 'open' WHERE "batchNo" = '${batchNo}'`
        )
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
    });
  });

  describe(`历史通道写入与仓储同一口径 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    const conditions = { own: '', foreign: '' };
    const rand = (): string => Math.random().toString(36).slice(2, 10);

    const count = async (table: string, where: string): Promise<number> =>
      Number(readRows(await adapter.rawQuery(`SELECT COUNT(*) FROM ${tableRef(backend, table)} WHERE ${where}`))[0][0]);

    const makeItem = async (prefix: string): Promise<BomItem> => {
      const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: `${prefix}-${rand()}` });
      await item.save();
      return item;
    };

    /** 组织下一条「颜色 = 红」的选择条件。 */
    const conditionIn = async (orgId: string): Promise<string> => {
      const char = adapter.rxdb.entityManager.instantiate(BomConfigChar, { orgId, code: '颜色', required: false });
      await char.save();
      await adapter.rxdb.entityManager.instantiate(BomConfigCharValue, { charId: char.id, value: '红' }).save();
      const condition = adapter.rxdb.entityManager.instantiate(BomConfigCondition, {
        orgId,
        expression: '颜色 = 红',
        grammarVersion: '1'
      });
      await condition.save();
      return condition.id;
    };

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
      // 字典：发生项 grade 必填枚举、头 plant 必填（本 describe 的每条合法写入都要带上）
      for (const [code, appliesTo, enumValues] of [
        ['grade', 'bom_line_occurrence', '["A","B"]'],
        ['plant', 'bom_header', null]
      ] as const) {
        await adapter.rxdb.entityManager
          .instantiate(BomAttrDef, { code, dataType: 'string', required: true, enumValues, appliesTo })
          .save();
      }
      conditions.own = await conditionIn('org-x');
      conditions.foreign = await conditionIn('org-other');
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    /** 一批：新父件修订 + 一张头（合法 plant）+ 一行一个发生项（合法 grade），按需覆盖。 */
    const batchWith = async (
      occurrence: Partial<HistoryOccurrenceInput> = {},
      header: Partial<HistoryHeaderInput> = {}
    ): Promise<{ batch: HistoryBatchInput; parent: BomItem }> => {
      const parent = await makeItem('p12-parent');
      const child = await makeItem('p12-child');
      const occurrenceInput: HistoryOccurrenceInput = {
        childItemId: child.id,
        qty: '1',
        effectiveFrom: day('2020-01-01'),
        ext: '{"grade":"A"}',
        ...occurrence
      };
      return {
        parent,
        batch: {
          batchNo: `batch-${rand()}`,
          revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              ext: '{"plant":"P1"}',
              ...header,
              lines: [{ lineNo: 10, occurrences: [occurrenceInput] }]
            }
          ]
        }
      };
    };

    /** 整批被拒（类型与消息）且一行不留：批次行与修订都不在库里。 */
    const rejectedAndRolledBack = async (
      input: { batch: HistoryBatchInput; parent: BomItem },
      type: new (...args: never[]) => Error,
      pattern: RegExp
    ): Promise<void> => {
      const outcome = await settled(loadHistory(adapter, input.batch));
      expect(outcome.ok).toBe(false);
      const error = (outcome as { error: unknown }).error;
      expect(error).toBeInstanceOf(type);
      expect(String((error as Error).message)).toMatch(pattern);
      expect(await count('bom_history_batch', `"batchNo" = '${input.batch.batchNo}'`)).toBe(0);
      expect(await count('item_revision', `"itemId" = '${input.parent.id}'`)).toBe(0);
    };

    /** 父件下已装载的头 / 行 / 发生项（各取第一条）。 */
    const loadedOf = async (parent: BomItem): Promise<{ headerId: string; lineId: string; ext: unknown[] }> => {
      const rows = readRows(
        await adapter.rawQuery(
          `SELECT h."id" AS "headerId", l."id" AS "lineId", h."ext" AS "headerExt", o."ext" AS "occurrenceExt" FROM ${tableRef(backend, 'bom_line_occurrence')} o JOIN ${tableRef(backend, 'bom_line')} l ON l."id" = o."lineId" JOIN ${tableRef(backend, 'bom_header')} h ON h."id" = l."headerId" JOIN ${tableRef(backend, 'item_revision')} r ON r."id" = h."parentRevisionId" WHERE r."itemId" = '${parent.id}'`
        )
      );
      return { headerId: String(rows[0][0]), lineId: String(rows[0][1]), ext: [rows[0][2], rows[0][3]] };
    };

    it('选择条件指向他组织：整批拒绝并回滚；本组织条件照常装载', async () => {
      await rejectedAndRolledBack(
        await batchWith({ selectionConditionId: conditions.foreign }),
        BomConfigError,
        /不属于组织「org-x」/
      );
      const own = await batchWith({ selectionConditionId: conditions.own });
      await loadHistory(adapter, own.batch);
      expect(await count('item_revision', `"itemId" = '${own.parent.id}'`)).toBe(1);
    });

    it('发生项 ext 违约（缺必填 / 非枚举 / 越界）整批拒绝并回滚；合法 ext 以规范 JSON 落库', async () => {
      await rejectedAndRolledBack(await batchWith({ ext: null }), BomExtAttrError, /grade.*必填/);
      await rejectedAndRolledBack(await batchWith({ ext: '{"grade":"C"}' }), BomExtAttrError, /grade.*枚举/);
      await rejectedAndRolledBack(
        await batchWith({ ext: '{"grade":"A","color":"red"}' }),
        BomExtAttrError,
        /color.*越界/
      );
      const valid = await batchWith({ ext: '{ "grade" : "B" }' }, { ext: '{ "plant" : "P2" }' });
      await loadHistory(adapter, valid.batch);
      expect((await loadedOf(valid.parent)).ext).toEqual(['{"plant":"P2"}', '{"grade":"B"}']);
    });

    it('坏批次集合整批拒绝并回滚', async () => {
      await rejectedAndRolledBack(await batchWith({ lotCodes: 'not-json' }), BomResolutionError, /批次集合/);
      await rejectedAndRolledBack(await batchWith({ lotCodes: '[1]' }), BomResolutionError, /字符串数组/);
    });

    it('头 ext 同样按字典校验：缺必填整批拒绝并回滚', async () => {
      await rejectedAndRolledBack(await batchWith({}, { ext: null }), BomExtAttrError, /plant.*必填/);
    });

    it('headerOverlays 的追加行与 occurrenceAdds 同样校验，合法追加照常装载', async () => {
      const base = await batchWith();
      await loadHistory(adapter, base.batch);
      const { headerId, lineId } = await loadedOf(base.parent);
      const child = await makeItem('p12-overlay');
      const effectiveDate = day('2021-01-01');
      /** 一批 overlay：本批装载一张已发布 ECN，追加的行与发生项都挂它。 */
      const overlayBatch = (
        build: (ecnId: string) => NonNullable<HistoryBatchInput['headerOverlays']>[number]
      ): HistoryBatchInput => {
        const ecnId = uuid();
        return {
          batchNo: `batch-${rand()}`,
          revisions: [],
          ecns: [{ id: ecnId, ecnNo: `ECN-${rand()}`, state: 'released', effectiveDate }],
          headers: [],
          headerOverlays: [build(ecnId)]
        };
      };
      const addedOccurrence = (ecnId: string, ext: string | null): HistoryOccurrenceInput => ({
        childItemId: child.id,
        qty: '1',
        effectiveFrom: effectiveDate,
        ecnInId: ecnId,
        ext
      });
      const lineAdd = (ext: string | null) =>
        overlayBatch(ecnId => ({
          headerId,
          lines: [{ lineNo: 20, ecnInId: ecnId, occurrences: [addedOccurrence(ecnId, ext)] }]
        }));
      const occurrenceAdd = overlayBatch(ecnId => ({
        headerId,
        occurrenceAdds: [{ lineId, occurrences: [addedOccurrence(ecnId, null)] }]
      }));
      for (const batch of [lineAdd('{"grade":"C"}'), occurrenceAdd]) {
        const outcome = await settled(loadHistory(adapter, batch));
        expect(outcome.ok).toBe(false);
        expect((outcome as { error: unknown }).error).toBeInstanceOf(BomExtAttrError);
      }
      await loadHistory(adapter, lineAdd('{"grade":"A"}'));
      expect(await count('bom_line', `"headerId" = '${headerId}'`)).toBe(2);
    });
  });
}
