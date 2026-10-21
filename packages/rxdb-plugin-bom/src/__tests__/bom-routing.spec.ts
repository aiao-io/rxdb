/**
 * @fileoverview 工艺路线与投料分摊回归测试（US-524 阶段 A/D 存储面 + US-520 非 ECN）
 *
 * 双后端同断言：工序按序返回、工作中心引用完整性、路线唯一键与 BOM 头对齐、
 * 头 routing_id 指向不存在的路线保存拒绝（FK）、工序损耗记法可读、
 * 分摊比例域与发布合计校验、投料工序与分摊行在路由序集内校验；
 * 头未挂路线时投料工序与分摊行在发布门、已发布头写入与历史通道补丁三处都拒绝（挂了必须可解析）。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomEcn,
  BomHeader,
  BomItem,
  BomLine,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRouting,
  BomRoutingOperation,
  BomWorkCenter
} from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import {
  BomDecimalFormatError,
  BomPublishValidationError,
  BomWriteProtocolError,
  normalizeBomError
} from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

const makeItem = async (prefix: string, stockUom = 'pcs', uomDecimals = 0): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  item.stockUom = stockUom;
  item.uomDecimals = uomDecimals;
  await item.save();
  return item;
};

/** 建 draft 头（挂在指定物料已发布修订下）。 */
const setup = async (adapter: BomTestAdapter, parent: BomItem): Promise<BomHeader> => {
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
    headers: []
  });
  const table = adapter.name === 'wa-sqlite' ? `"bom$item_revision"` : `"bom"."item_revision"`;
  const rows = (await adapter.rawQuery(`SELECT "id" FROM ${table} WHERE "itemId" = '${parent.id}'`)) as unknown as
    { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
  const shape = 'results' in rows ? rows.results[0] : rows;
  const header = new BomHeader();
  header.parentRevisionId = String(shape.rows[0][0]);
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  return header;
};

const makeWorkCenter = async (code: string): Promise<BomWorkCenter> => {
  const center = new BomWorkCenter();
  center.code = `${code}-${Math.random().toString(36).slice(2, 6)}`;
  center.orgId = 'org-x';
  await center.save();
  return center;
};

const makeRouting = async (header: BomHeader, center: BomWorkCenter): Promise<BomRouting> => {
  const routing = new BomRouting();
  routing.parentRevisionId = header.parentRevisionId;
  routing.bomType = 'ebom';
  routing.orgId = 'org-x';
  routing.validFrom = day('2020-01-01');
  await routing.save();
  for (const seq of [10, 20, 30]) {
    const operation = new BomRoutingOperation();
    operation.routingId = routing.id;
    operation.operationSeq = seq;
    operation.workCenterId = center.id;
    await operation.save();
  }
  return routing;
};

const addOccurrence = async (
  header: BomHeader,
  child: BomItem,
  overrides: Partial<BomLineOccurrence> = {}
): Promise<BomLineOccurrence> => {
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10 + Math.floor(Math.random() * 100000);
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = '1';
  occurrence.uom = 'pcs';
  occurrence.effectiveFrom = day('2026-01-01');
  Object.assign(occurrence, overrides);
  await occurrence.save();
  return occurrence;
};

const settled = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error
  );

/** 草稿 ECN：生效日在未来，其成员可在已发布头下增改（US-515 矩阵）。 */
const makeDraftEcn = async (): Promise<BomEcn> => {
  const ecn = new BomEcn();
  ecn.ecnNo = `rt-ecn-${Math.random().toString(36).slice(2, 10)}`;
  ecn.effectiveDate = day('2099-01-01');
  await ecn.save();
  return ecn;
};

/** 已发布头下经草稿 ECN 引入一行：逻辑行与发生项都挂该 ECN，生效日由 ECN 派生。 */
const addEcnOccurrence = async (
  header: BomHeader,
  child: BomItem,
  ecn: BomEcn,
  overrides: Partial<BomLineOccurrence> = {}
): Promise<BomLineOccurrence> => {
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10 + Math.floor(Math.random() * 100000);
  line.ecnInId = ecn.id;
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = '1';
  occurrence.uom = 'pcs';
  occurrence.effectiveFrom = ecn.effectiveDate;
  occurrence.ecnInId = ecn.id;
  Object.assign(occurrence, overrides);
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

for (const backend of BACKENDS) {
  describe(`工艺路线 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('US-524 AC#1 工序按 operation_seq 有序返回，各带工作中心', async () => {
      const parent = await makeItem('rt-1');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WC');
      const routing = await makeRouting(header, center);
      const result = await adapter.rawQuery(
        adapter.name === 'wa-sqlite' ?
          `SELECT "operationSeq", "workCenterId" FROM "bom$routing_operation" WHERE "routingId" = '${routing.id}' ORDER BY "operationSeq"`
        : `SELECT "operationSeq", "workCenterId" FROM "bom"."routing_operation" WHERE "routingId" = '${routing.id}' ORDER BY "operationSeq"`
      );
      const shape = ('results' in (result as unknown as object) ?
        (result as unknown as { results: { rows: unknown[][] }[] }).results[0]
      : result) as unknown as { rows: unknown[][] };
      expect(shape.rows.map(row => Number(row[0]))).toEqual([10, 20, 30]);
      expect(shape.rows.every(row => String(row[1]) === center.id)).toBe(true);
    });

    it('US-524 AC#2 工序引用不存在的工作中心：保存拒绝（引用完整性）', async () => {
      const parent = await makeItem('rt-2');
      const header = await setup(adapter, parent);
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'ebom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2020-01-01');
      await routing.save();
      const operation = new BomRoutingOperation();
      operation.routingId = routing.id;
      operation.operationSeq = 10;
      operation.workCenterId = crypto.randomUUID();
      const rejected = await operation.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('US-524 AC#6 工序损耗与 scrap_convention 可读（记法与 US-511 一致）', async () => {
      const parent = await makeItem('rt-6');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WC6');
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'ebom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2020-01-01');
      await routing.save();
      const operation = new BomRoutingOperation();
      operation.routingId = routing.id;
      operation.operationSeq = 20;
      operation.workCenterId = center.id;
      operation.operationScrap = '0.03';
      operation.scrapConvention = 'yield';
      await operation.save();
      expect(operation.operationScrap).toBe('0.03');
      expect(operation.scrapConvention).toBe('yield');
      // 良率制 s=1 拒绝（US-511 记法同域）
      operation.operationScrap = '1';
      const rejected = await operation.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('US-524 AC#11 路线唯一键与 BOM 头对齐：EBOM/MBOM 并存、重复 MBOM 拒绝', async () => {
      const parent = await makeItem('rt-11');
      const header = await setup(adapter, parent);
      const ebom = new BomRouting();
      ebom.parentRevisionId = header.parentRevisionId;
      ebom.bomType = 'ebom';
      ebom.orgId = 'org-x';
      ebom.validFrom = day('2020-01-01');
      await ebom.save();
      const mbom = new BomRouting();
      mbom.parentRevisionId = header.parentRevisionId;
      mbom.bomType = 'mbom';
      mbom.orgId = 'org-x';
      mbom.validFrom = day('2020-01-01');
      await mbom.save();
      const duplicate = new BomRouting();
      duplicate.parentRevisionId = header.parentRevisionId;
      duplicate.bomType = 'mbom';
      duplicate.orgId = 'org-x';
      duplicate.validFrom = day('2020-01-01');
      const rejected = await duplicate.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('US-524 AC#8 头 routing_id 指向不存在的路线：保存拒绝（FK）', async () => {
      const parent = await makeItem('rt-8');
      const header = await setup(adapter, parent);
      header.routingId = crypto.randomUUID();
      const rejected = await header.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('US-520 分摊比例域与发布合计校验：0.6/0.4 通过、越界保存拒绝、合计 0.9 发布拒绝', async () => {
      const parent = await makeItem('rt-s');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WCS');
      const routing = await makeRouting(header, center);
      header.routingId = routing.id;
      await header.save();
      const child = await makeItem('rt-s-child');
      // AC#6 互斥：有分摊行的发生项不设 operation_seq
      const occurrence = await addOccurrence(header, child);
      const split1 = new BomLineOperationSplit();
      split1.occurrenceId = occurrence.id;
      split1.operationSeq = 10;
      split1.ratio = '0.6';
      await split1.save();
      const split2 = new BomLineOperationSplit();
      split2.occurrenceId = occurrence.id;
      split2.operationSeq = 30;
      split2.ratio = '0.4';
      await split2.save();
      header.state = 'released';
      await expect(header.save()).resolves.toBeDefined();
      // 越界比例保存拒绝
      const parent2 = await makeItem('rt-s2');
      const header2 = await setup(adapter, parent2);
      const center2 = await makeWorkCenter('WCS2');
      const routing2 = await makeRouting(header2, center2);
      header2.routingId = routing2.id;
      await header2.save();
      const occurrence2 = await addOccurrence(header2, await makeItem('rt-s2-child'));
      const badSplit = new BomLineOperationSplit();
      badSplit.occurrenceId = occurrence2.id;
      badSplit.operationSeq = 10;
      badSplit.ratio = '0.5000000000000001';
      const rejected = await badSplit.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomDecimalFormatError);
      // 合计 0.9 发布拒绝
      const goodSplit = new BomLineOperationSplit();
      goodSplit.occurrenceId = occurrence2.id;
      goodSplit.operationSeq = 10;
      goodSplit.ratio = '0.5';
      await goodSplit.save();
      const shortSplit = new BomLineOperationSplit();
      shortSplit.occurrenceId = occurrence2.id;
      shortSplit.operationSeq = 30;
      shortSplit.ratio = '0.4';
      await shortSplit.save();
      header2.state = 'released';
      const publishRejected = await header2.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(publishRejected).toBeInstanceOf(BomPublishValidationError);
    });

    it('US-511 AC#13 工序损耗方向：10→20→30 只有 20 损耗 3%（加成制）→ 103 / 103 / 100', async () => {
      const parent = await makeItem('op-13');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('OP13');
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'ebom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2020-01-01');
      await routing.save();
      const scrapOf: Record<number, string> = { 20: '0.03' };
      for (const seq of [10, 20, 30]) {
        const operation = new BomRoutingOperation();
        operation.routingId = routing.id;
        operation.operationSeq = seq;
        operation.workCenterId = center.id;
        operation.operationScrap = scrapOf[seq] ?? '0';
        operation.scrapConvention = 'additive';
        await operation.save();
      }
      header.routingId = routing.id;
      await header.save();
      const children = [await makeItem('op-13-a'), await makeItem('op-13-b'), await makeItem('op-13-c')];
      for (const [index, child] of children.entries()) {
        await addOccurrence(header, child, { operationSeq: [10, 20, 30][index], qty: '100' });
      }
      header.state = 'released';
      await header.save();
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentRevisionId: header.parentRevisionId },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      const qtyOf = (child: BomItem): string =>
        result.requirementLines.find(line => line.itemId === child.id)?.qty ?? '';
      // 10 投料经 20 的损耗 ×1.03；20 投料经自身 ×1.03；30 投料不经过 20
      expect(qtyOf(children[0])).toBe('103');
      expect(qtyOf(children[1])).toBe('103');
      expect(qtyOf(children[2])).toBe('100');
    });

    it('US-511 AC#1 golden：G′=216.4948… 经工序 10 加成 2% → 220.8247422680412371134020618556701 → 需求行 221', async () => {
      const parent = await makeItem('op-1');
      const header = await setup(adapter, parent);
      (header as unknown as { baseQty: string }).baseQty = '1';
      (header as unknown as { assemblyScrap: string }).assemblyScrap = '0.05';
      (header as unknown as { assemblyScrapConvention: string }).assemblyScrapConvention = 'additive';
      await header.save();
      const center = await makeWorkCenter('OP1');
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'ebom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2020-01-01');
      await routing.save();
      const operation = new BomRoutingOperation();
      operation.routingId = routing.id;
      operation.operationSeq = 10;
      operation.workCenterId = center.id;
      operation.operationScrap = '0.02';
      operation.scrapConvention = 'additive';
      await operation.save();
      header.routingId = routing.id;
      await header.save();
      const child = await makeItem('op-1-child');
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '2';
      occurrence.uom = 'pcs';
      occurrence.componentScrap = '0.03';
      occurrence.componentScrapConvention = 'yield';
      occurrence.effectiveFrom = day('2026-01-01');
      occurrence.operationSeq = 10;
      await occurrence.save();
      header.state = 'released';
      await header.save();
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentRevisionId: header.parentRevisionId },
        { plannedQty: { value: '100', uom: 'pcs' } }
      );
      const requirement = result.requirementLines.find(line => line.itemId === child.id);
      expect(requirement?.qty).toBe('221');
      // 第 5 步中间值：G'' = 216.4948453608247422680412371134021 × 1.02
      expect(requirement?.steps.operationScrapped).toEqual({
        value: '220.8247422680412371134020618556701',
        uom: 'pcs'
      });
    });

    it('US-520 AC#5 行挂不属于头路线的 operation_seq：保存即拒', async () => {
      const parent = await makeItem('rt-5');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WC5');
      const routing = await makeRouting(header, center);
      header.routingId = routing.id;
      await header.save();
      const child = await makeItem('rt-5-child');
      // 99 不在路由序集：保存期即拒（AC#5），走不到发布
      const rejected = await addOccurrence(header, child, { operationSeq: 99 }).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('US-520 AC#6 行既有 operation_seq 又有分摊行：保存拒绝（互斥）', async () => {
      const parent = await makeItem('rt-6x');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WC6x');
      const routing = await makeRouting(header, center);
      header.routingId = routing.id;
      await header.save();
      const child = await makeItem('rt-6x-child');
      const occurrence = await addOccurrence(header, child, { operationSeq: 10 });
      const split = new BomLineOperationSplit();
      split.occurrenceId = occurrence.id;
      split.operationSeq = 10;
      split.ratio = '1';
      const rejected = await split.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('US-520 AC#8 分摊不重复施加损耗：10 损耗 2%，10 份额 61.2、30 份额 40、合计 101.2', async () => {
      const parent = await makeItem('rt-8x');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WC8x');
      const routing = new BomRouting();
      routing.parentRevisionId = header.parentRevisionId;
      routing.bomType = 'ebom';
      routing.orgId = 'org-x';
      routing.validFrom = day('2020-01-01');
      await routing.save();
      for (const [seq, scrap] of [
        [10, '0.02'],
        [30, '0']
      ] as const) {
        const operation = new BomRoutingOperation();
        operation.routingId = routing.id;
        operation.operationSeq = seq;
        operation.workCenterId = center.id;
        operation.operationScrap = scrap;
        operation.scrapConvention = 'additive';
        await operation.save();
      }
      header.routingId = routing.id;
      await header.save();
      const child = await makeItem('rt-8x-child', 'pcs', 1);
      const occurrence = await addOccurrence(header, child, { qty: '100' });
      for (const [seq, ratio] of [
        [10, '0.6'],
        [30, '0.4']
      ] as const) {
        const split = new BomLineOperationSplit();
        split.occurrenceId = occurrence.id;
        split.operationSeq = seq;
        split.ratio = ratio;
        await split.save();
      }
      header.state = 'released';
      await header.save();
      const result = await explodeBom(
        adapter,
        CONTEXT,
        { parentRevisionId: header.parentRevisionId },
        { plannedQty: { value: '1', uom: 'pcs' } }
      );
      // 60×1.02=61.2 + 40 = 101.2（库存小数位 1 不取整）
      expect(result.requirementLines.find(line => line.itemId === child.id)?.qty).toBe('101.2');
    });

    it('US-520 投料工序与分摊行必须在路由序集内：发布拒绝', async () => {
      const parent = await makeItem('rt-x');
      const header = await setup(adapter, parent);
      const center = await makeWorkCenter('WCX');
      const routing = await makeRouting(header, center);
      header.routingId = routing.id;
      await header.save();
      const child = await makeItem('rt-x-child');
      const occurrence = await addOccurrence(header, child);
      const badSplit = new BomLineOperationSplit();
      badSplit.occurrenceId = occurrence.id;
      badSplit.operationSeq = 99;
      badSplit.ratio = '1';
      await badSplit.save();
      header.state = 'released';
      const rejected = await header.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
    });

    it('P1-3 发布门：头未挂路线却有投料工序即拒绝；行先建、路线后挂的草稿序照常发布', async () => {
      const header = await setup(adapter, await makeItem('rt-p13a'));
      // 草稿头可暂缺路线（历史装载即先建行、再挂路线），保存期放行
      await addOccurrence(header, await makeItem('rt-p13a-c'), { operationSeq: 10 });
      header.state = 'released';
      const unrouted = await settled(header.save());
      expect(unrouted).toBeInstanceOf(BomPublishValidationError);
      expect(String((unrouted as Error).message)).toContain('未挂工艺路线');
      const routed = await setup(adapter, await makeItem('rt-p13a2'));
      await addOccurrence(routed, await makeItem('rt-p13a2-c'), { operationSeq: 10 });
      routed.routingId = (await makeRouting(routed, await makeWorkCenter('WC13A'))).id;
      routed.state = 'released';
      await expect(routed.save()).resolves.toBeDefined();
    });

    it('P1-3 发布门：头未挂路线却有分摊行即拒绝（合计恒 1，不被合计校验遮蔽）', async () => {
      const header = await setup(adapter, await makeItem('rt-p13b'));
      const occurrence = await addOccurrence(header, await makeItem('rt-p13b-c'));
      await addSplit(occurrence, 10, '0.6');
      await addSplit(occurrence, 30, '0.4');
      header.state = 'released';
      const unrouted = await settled(header.save());
      expect(unrouted).toBeInstanceOf(BomPublishValidationError);
      expect(String((unrouted as Error).message)).toContain('未挂工艺路线');
    });

    it('P1-3 已发布头未挂路线：ECN 引入或改挂投料工序、新增分摊行在保存期拒绝，挂了路线的头照常放行', async () => {
      const header = await setup(adapter, await makeItem('rt-p13c'));
      header.state = 'released';
      await header.save();
      const ecn = await makeDraftEcn();
      const inserted = await settled(addEcnOccurrence(header, await makeItem('rt-p13c-1'), ecn, { operationSeq: 10 }));
      expect(inserted).toBeInstanceOf(BomWriteProtocolError);
      expect(String((inserted as Error).message)).toContain('未挂工艺路线');
      // 不挂工序的 ECN 发生项照常引入；之后改挂工序（草稿 ECN 成员的可改列）同样拒绝
      const plain = await addEcnOccurrence(header, await makeItem('rt-p13c-2'), ecn);
      plain.operationSeq = 10;
      const updated = await settled(plain.save());
      expect(updated).toBeInstanceOf(BomWriteProtocolError);
      expect(String((updated as Error).message)).toContain('未挂工艺路线');
      const other = await addEcnOccurrence(header, await makeItem('rt-p13c-3'), ecn);
      const split = await settled(addSplit(other, 10, '1'));
      expect(split).toBeInstanceOf(BomWriteProtocolError);
      expect(String((split as Error).message)).toContain('未挂工艺路线');
      // 对照：挂了路线的已发布头，ECN 引入挂工序的发生项照常放行
      const routed = await setup(adapter, await makeItem('rt-p13c4'));
      routed.routingId = (await makeRouting(routed, await makeWorkCenter('WC13C'))).id;
      await routed.save();
      routed.state = 'released';
      await routed.save();
      const routedOccurrence = await addEcnOccurrence(routed, await makeItem('rt-p13c-4'), ecn, { operationSeq: 20 });
      expect(routedOccurrence.operationSeq).toBe(20);
    });

    it('P1-3 历史通道补丁：已发布头有投料工序时 routing_id 不可置空、不可改挂不含该工序的路线', async () => {
      const center = await makeWorkCenter('WC13D');
      const header = await setup(adapter, await makeItem('rt-p13d'));
      const routing = await makeRouting(header, center);
      header.routingId = routing.id;
      await header.save();
      await addOccurrence(header, await makeItem('rt-p13d-c'), { operationSeq: 10 });
      header.state = 'released';
      await header.save();
      const patch = (routingId: string | null): Promise<unknown> =>
        settled(
          loadHistory(adapter, {
            batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
            revisions: [],
            headers: [],
            headerOverlays: [{ headerId: header.id, headerPatch: { routingId } }]
          })
        );
      // 开启态批次放行 routing_id 补丁列；置空会让投料工序失去可解析路线
      const detached = normalizeBomError(await patch(null));
      expect(detached).toBeInstanceOf(BomWriteProtocolError);
      expect(detached?.message).toContain('未挂工艺路线');
      // 改挂的路线不含工序 10（只有 20）
      const narrow = new BomRouting();
      narrow.parentRevisionId = header.parentRevisionId;
      narrow.bomType = 'ebom';
      narrow.orgId = 'org-x';
      narrow.alternativeNo = 2;
      narrow.validFrom = day('2020-01-01');
      await narrow.save();
      const operation = new BomRoutingOperation();
      operation.routingId = narrow.id;
      operation.operationSeq = 20;
      operation.workCenterId = center.id;
      await operation.save();
      const uncovered = normalizeBomError(await patch(narrow.id));
      expect(uncovered).toBeInstanceOf(BomWriteProtocolError);
      expect(uncovered?.message).toContain('不在路由工序序集内');
      // 对照：无投料工序 / 分摊行的已发布头，补丁照常改挂或置空（种子的 routing_id 补丁形态）
      const bare = await setup(adapter, await makeItem('rt-p13d2'));
      bare.routingId = (await makeRouting(bare, center)).id;
      await bare.save();
      await addOccurrence(bare, await makeItem('rt-p13d2-c'));
      bare.state = 'released';
      await bare.save();
      await expect(
        loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [],
          headers: [],
          headerOverlays: [{ headerId: bare.id, headerPatch: { routingId: null } }]
        })
      ).resolves.toBeUndefined();
    });
  });
}

describe('US-524 阶段 B/C 费率与工时', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      it('AC#3 同一 (work_center, activity_type) 两段费率并存；同日起始的第二段拒绝', async () => {
        const { BomActivityRate, BomActivityType, BomWorkCenter } = await import('../entities.js');
        const center = new BomWorkCenter();
        center.code = `WC-${Math.random().toString(36).slice(2, 6)}`;
        center.orgId = 'org-x';
        await center.save();
        const type = new BomActivityType();
        type.code = `ACT-${Math.random().toString(36).slice(2, 6)}`;
        type.workCenterId = center.id;
        await type.save();
        const first = new BomActivityRate();
        first.workCenterId = center.id;
        first.activityTypeId = type.id;
        first.validFrom = new Date('2026-01-01T00:00:00.000Z');
        first.rate = '60';
        first.currency = 'CNY';
        first.rateUom = 'h';
        await first.save();
        // 不同日期的第二段：并存（取值时命中对应区间）
        const second = new BomActivityRate();
        second.workCenterId = center.id;
        second.activityTypeId = type.id;
        second.validFrom = new Date('2026-07-01T00:00:00.000Z');
        second.rate = '70';
        second.currency = 'CNY';
        second.rateUom = 'h';
        await second.save();
        // 同 key 同日起始：拒绝
        const overlap = new BomActivityRate();
        overlap.workCenterId = center.id;
        overlap.activityTypeId = type.id;
        overlap.validFrom = new Date('2026-01-01T00:00:00.000Z');
        overlap.rate = '80';
        overlap.currency = 'CNY';
        overlap.rateUom = 'h';
        await expect(overlap.save()).rejects.toThrow();
      });
    });
  }
});
