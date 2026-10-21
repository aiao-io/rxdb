/**
 * @fileoverview 存储层守卫的边角回归测试
 *
 * 双后端同断言：投料工序与分摊行互斥的两侧都在保存期拒绝（US-520 AC#6）；分摊合计违约消息
 * 按统一定点格式还原（整数段保留、小数段补足 9 位）；开启态历史批次只放行历史覆盖补丁的
 * 两列，已发布头的其余字段与状态不能借开放批次改写（US-515 AC#22）；全部十进制串列的
 * 直连 SQL 写入按规范十进制串判定（US-511 AC#23 存储段），正数域列（换算率、头基准量、
 * 标准成本批量）直连写 0 拒绝。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomActivityRate,
  BomActivityType,
  BomEcn,
  BomHeader,
  BomHistoryBatch,
  BomItem,
  BomLine,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRouting,
  BomRoutingOperation,
  BomWorkCenter
} from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomPublishValidationError, BomWriteProtocolError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const settled = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error
  );

for (const backend of BACKENDS) {
  describe(`存储层守卫边角 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const table = (name: string): string => (backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`);

    const makeItem = async (prefix: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
      await item.save();
      return item;
    };

    /** 草稿头（父件经历史装载发布修订，无路线）。 */
    const draftHeader = async (): Promise<BomHeader> => {
      const parent = await makeItem('guard-p');
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const revisionId = await adapter.transaction(
        async executor =>
          String(
            (await executor.query(`SELECT "id" FROM ${table('item_revision')} WHERE "itemId" = '${parent.id}'`))
              .rows[0][0]
          ),
        false
      );
      const header = new BomHeader();
      header.parentRevisionId = revisionId;
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      await header.save();
      return header;
    };

    const addOccurrence = async (header: BomHeader, ecn?: BomEcn): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10 + Math.floor(Math.random() * 100000);
      if (ecn) line.ecnInId = ecn.id;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = (await makeItem('guard-c')).id;
      occurrence.qty = '1';
      occurrence.effectiveFrom = ecn ? ecn.effectiveDate : day('2026-01-01');
      if (ecn) occurrence.ecnInId = ecn.id;
      await occurrence.save();
      return occurrence;
    };

    const addSplit = async (occurrence: BomLineOccurrence, operationSeq: number, ratio: string): Promise<void> => {
      const split = new BomLineOperationSplit();
      split.occurrenceId = occurrence.id;
      split.operationSeq = operationSeq;
      split.ratio = ratio;
      await split.save();
    };

    /** 给草稿头挂一条含给定工序的路线（已发布头新增分摊行要求头已挂路线）。 */
    const attachRouting = async (header: BomHeader, operationSeqs: number[]): Promise<void> => {
      const center = new BomWorkCenter();
      center.code = `wc-${Math.random().toString(36).slice(2, 10)}`;
      center.orgId = header.orgId;
      await center.save();
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = header.bomType;
      routing.orgId = header.orgId;
      routing.validFrom = day('2026-01-01');
      await routing.save();
      for (const operationSeq of operationSeqs) {
        const operation = new BomRoutingOperation();
        operation.routingId = routing.id;
        operation.workCenterId = center.id;
        operation.operationSeq = operationSeq;
        await operation.save();
      }
      header.routingId = routing.id;
      await header.save();
    };

    it('发生项已有分摊行后再挂 operation_seq：插件入口与直连 SQL 都拒（AC#6 两侧互斥）', async () => {
      const header = await draftHeader();
      const occurrence = await addOccurrence(header);
      await addSplit(occurrence, 10, '1');
      occurrence.operationSeq = 10;
      await expect(occurrence.save()).rejects.toBeInstanceOf(BomWriteProtocolError);
      await expect(
        adapter.rawQuery(
          `UPDATE ${table('bom_line_occurrence')} SET "operationSeq" = 10 WHERE "id" = '${occurrence.id}'`
        )
      ).rejects.toThrow('两种表达互斥');
    });

    it('头发布的分摊合计违约消息保留整数段：0.6 + 0.6 报 1.200000000', async () => {
      const header = await draftHeader();
      const occurrence = await addOccurrence(header);
      await addSplit(occurrence, 10, '0.6');
      await addSplit(occurrence, 20, '0.6');
      header.state = 'released';
      const rejected = await settled(header.save());
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
      expect(String((rejected as Error).message)).toContain(`${occurrence.id}:1.200000000`);
    });

    it('ECN 投影的分摊合计违约消息小数段补足 9 位：0.05 报 0.050000000', async () => {
      const header = await draftHeader();
      await attachRouting(header, [10]);
      header.state = 'released';
      await header.save();
      const ecn = new BomEcn();
      ecn.ecnNo = `guard-${Math.random().toString(36).slice(2, 10)}`;
      ecn.effectiveDate = day('2099-01-01');
      await ecn.save();
      const occurrence = await addOccurrence(header, ecn);
      await addSplit(occurrence, 10, '0.05');
      ecn.state = 'released';
      const rejected = await settled(ecn.save());
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
      expect(String((rejected as Error).message)).toContain(`${occurrence.id}:0.050000000`);
    });

    it('开启态批次只放行历史覆盖补丁两列：已发布头的其余字段与状态不能借开放批次改写', async () => {
      const header = await draftHeader();
      header.state = 'released';
      await header.save();
      const update = (assignment: string): Promise<unknown> =>
        adapter.rawQuery(`UPDATE ${table('bom_header')} SET ${assignment} WHERE "id" = '${header.id}'`);
      // 悬空的开启态批次（应用误用或直连写入）：只该打开 loadHistory 覆盖补丁写的 cost_lot_qty / routing_id
      const batch = new BomHistoryBatch();
      batch.batchNo = `dangling-${Math.random().toString(36).slice(2, 10)}`;
      await batch.save();
      try {
        await expect(update(`"baseQty" = '2'`)).rejects.toThrow('rxdb:bom_write_protocol:bom_header:');
        await expect(update(`"state" = 'draft'`)).rejects.toThrow('rxdb:bom_write_protocol:bom_header:');
        await expect(update(`"costLotQty" = '5'`)).resolves.toBeDefined();
      } finally {
        batch.state = 'closed';
        await batch.save();
      }
      await expect(update(`"costLotQty" = '6'`)).rejects.toThrow('rxdb:bom_write_protocol:bom_header:');
    });

    it('全部十进制串列：直连 SQL 写非规范串被拒并点名列，规范串放行（值域守卫照旧叠加）', async () => {
      const suffix = Math.random().toString(36).slice(2, 10);
      const header = await draftHeader();
      const occurrence = await addOccurrence(header);
      const split = new BomLineOperationSplit();
      split.occurrenceId = occurrence.id;
      split.operationSeq = 10;
      split.ratio = '1';
      await split.save();
      const center = new BomWorkCenter();
      center.code = `wc-${suffix}`;
      center.orgId = 'org-x';
      await center.save();
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'mbom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2026-01-01');
      await routing.save();
      const operation = new BomRoutingOperation();
      operation.routingId = routing.id;
      operation.workCenterId = center.id;
      operation.operationSeq = 10;
      await operation.save();
      const activity = new BomActivityType();
      activity.code = `act-${suffix}`;
      activity.workCenterId = center.id;
      await activity.save();
      const rate = new BomActivityRate();
      rate.workCenterId = center.id;
      rate.activityTypeId = activity.id;
      rate.validFrom = day('2026-01-01');
      rate.rate = '10';
      rate.currency = 'CNY';
      rate.rateUom = 'h';
      await rate.save();
      const item = await makeItem('guard-dec');
      const cases: { table: string; id: string; column: string; bad: string[]; good: string }[] = [
        { table: 'item', id: item.id, column: 'uomConversion', bad: ['1.0', '0.abc', '01'], good: '2.5' },
        {
          table: 'bom_line_occurrence',
          id: occurrence.id,
          column: 'usageProbability',
          bad: ['0.abc', '0.10', '1.0'],
          good: '0.25'
        },
        {
          table: 'bom_line_occurrence',
          id: occurrence.id,
          column: 'equivQty',
          bad: ['1.0', '0.abc', '.5'],
          good: '2.5'
        },
        {
          table: 'bom_line_operation_split',
          id: split.id,
          column: 'ratio',
          bad: ['0.abc', '0.10', '1.0'],
          good: '0.5'
        },
        {
          table: 'routing_operation',
          id: operation.id,
          column: 'operationScrap',
          bad: ['0.10', '0.abc', '1.'],
          good: '0.05'
        },
        { table: 'activity_rate', id: rate.id, column: 'rate', bad: ['10.0', '1e3', '-1'], good: '12.5' },
        { table: 'bom_header', id: header.id, column: 'jointCostShare', bad: ['0.10', '0.abc', '1.0'], good: '0.4' }
      ];
      for (const { table: name, id, column, bad, good } of cases) {
        const write = (value: string): Promise<unknown> =>
          adapter.rawQuery(`UPDATE ${table(name)} SET "${column}" = '${value}' WHERE "id" = '${id}'`);
        for (const value of bad) {
          await expect(write(value), `${column} = '${value}'`).rejects.toThrow(`rxdb:bom_decimal_format:${column}`);
        }
        await expect(write(good), `${column} = '${good}'`).resolves.toBeDefined();
      }
    });

    it('正数域（物料级 / 行级换算率、头基准量、标准成本批量）：直连 SQL 插入或改成 0 两后端都拒绝并点名列与域', async () => {
      const header = await draftHeader();
      const occurrence = await addOccurrence(header);
      const item = await makeItem('guard-positive');
      const stamp = `'2026-01-01T00:00:00.000Z'`;
      const cases: { table: string; id: string; column: string; domain: string }[] = [
        { table: 'item', id: item.id, column: 'uomConversion', domain: '换算率' },
        { table: 'bom_line_occurrence', id: occurrence.id, column: 'uomConversion', domain: '换算率' },
        { table: 'bom_header', id: header.id, column: 'baseQty', domain: '头基准量' },
        { table: 'bom_header', id: header.id, column: 'costLotQty', domain: '标准成本批量' }
      ];
      for (const { table: name, id, column, domain } of cases) {
        const write = (value: string): Promise<unknown> =>
          adapter.rawQuery(`UPDATE ${table(name)} SET "${column}" = '${value}' WHERE "id" = '${id}'`);
        await expect(write('0'), column).rejects.toThrow(`rxdb:bom_decimal_format:${column}:${domain}必须大于 0`);
        await expect(write('0.5'), column).resolves.toBeDefined();
      }
      await expect(
        adapter.rawQuery(
          `INSERT INTO ${table('item')} ("id", "itemNo", "uomConversion", "createdAt", "updatedAt") ` +
            `VALUES ('${crypto.randomUUID()}', 'guard-zero-${Math.random().toString(36).slice(2, 10)}', '0', ${stamp}, ${stamp})`
        )
      ).rejects.toThrow('rxdb:bom_decimal_format:uomConversion:换算率必须大于 0');
      await expect(
        adapter.rawQuery(
          `INSERT INTO ${table('bom_header')} ("id", "parentRevisionId", "bomType", "orgId", "alternativeNo", "baseQty", "createdAt", "updatedAt") ` +
            `VALUES ('${crypto.randomUUID()}', '${header.parentRevisionId}', 'ebom', 'org-x', 2, '0', ${stamp}, ${stamp})`
        )
      ).rejects.toThrow('rxdb:bom_decimal_format:baseQty:头基准量必须大于 0');
    });
  });
}
