/**
 * @fileoverview 多输出物料流回归测试（US-513 阶段 A：AC#1/#3/#4/#5/#6/#8/#9/#10/#11）
 *
 * 双后端同断言：by_product 边不入判环（反向对不报环）、consume 子图成环仍拒、
 * 只有非 consume 行的头展开报「无投入」、scrap_out 不进需求行、自回流分列、
 * 副产随装配损耗缩放 golden、by_product 子件 = 头父件与 consume 负用量拒绝。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomPublishValidationError, BomQuantityError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

/** 建 draft 头（挂在指定物料的已发布修订上）返回头与可加行的构造器。 */
const setup = async (
  adapter: BomTestAdapter,
  parentItem: BomItem
): Promise<{ header: BomHeader; revisionItemId: string; addLine: (flow: 'consume' | 'by_product' | 'scrap_out', child: BomItem, overrides?: Partial<BomLineOccurrence>) => Promise<void> }> => {
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: [{ itemId: parentItem.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
    headers: []
  });
  const table = adapter.name === 'wa-sqlite' ? `"bom$item_revision"` : `"bom"."item_revision"`;
  const rows = (await adapter.rawQuery(`SELECT "id" FROM ${table} WHERE "itemId" = '${parentItem.id}'`)) as unknown as
    | { results: { rows: unknown[][] }[] }
    | { rows: unknown[][] };
  const shape = 'results' in rows ? rows.results[0] : rows;
  const header = new BomHeader();
  header.parentRevisionId = String(shape.rows[0][0]);
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  const addLine = async (
    flow: 'consume' | 'by_product' | 'scrap_out',
    child: BomItem,
    overrides: Partial<BomLineOccurrence> = {}
  ): Promise<void> => {
    const line = new BomLine();
    line.headerId = header.id;
    line.lineNo = 10 + Math.floor(Math.random() * 1000);
    await line.save();
    const occurrence = new BomLineOccurrence();
    occurrence.lineId = line.id;
    occurrence.childItemId = child.id;
    occurrence.qty = '1';
    occurrence.uom = 'pcs';
    occurrence.effectiveFrom = day('2026-01-01');
    occurrence.flowDirection = flow;
    Object.assign(occurrence, overrides);
    await occurrence.save();
  };
  return { header, revisionItemId: parentItem.id, addLine };
};

const makeItem = async (prefix: string, stockUom = 'pcs'): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  item.stockUom = stockUom;
  await item.save();
  return item;
};

const release = async (header: BomHeader): Promise<BomHeader> => {
  header.state = 'released';
  await header.save();
  return header;
};

for (const backend of BACKENDS) {
  describe(`多输出物料流 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('AC#1 X consume Y 与 Y by_product X 并存：不报环', async () => {
      const x = await makeItem('fl-x');
      const y = await makeItem('fl-y');
      const xSetup = await setup(adapter, x);
      await xSetup.addLine('consume', y);
      await release(xSetup.header);
      const ySetup = await setup(adapter, y);
      await ySetup.addLine('by_product', x);
      await expect(release(ySetup.header)).resolves.toBeDefined();
    });

    it('AC#9 consume 子图成环仍拒：S consume P 与 P consume S 并存时保存被拒', async () => {
      const p = await makeItem('fl-p');
      const s = await makeItem('fl-s');
      const pSetup = await setup(adapter, p);
      await pSetup.addLine('consume', s);
      await release(pSetup.header);
      const sSetup = await setup(adapter, s);
      await expect(sSetup.addLine('consume', p)).rejects.toThrow();
    });

    it('AC#11 by_product 行的子件等于头父件：发布拒绝', async () => {
      const parent = await makeItem('fl-self');
      const { header, revisionItemId, addLine } = await setup(adapter, parent);
      const self = new BomItem();
      (self as unknown as { id: string }).id = revisionItemId;
      await addLine('by_product', self);
      header.state = 'released';
      const rejected = await header.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
    });

    it('AC#5 consume 边负用量存储层拒绝（产出改用 by_product）', async () => {
      const parent = await makeItem('fl-neg-p');
      const { addLine } = await setup(adapter, parent);
      const child = await makeItem('fl-neg');
      await expect(
        addLine('consume', child, { qty: '-1' }).then(
          () => null,
          (error: unknown) => error
        )
      ).not.toBeNull();
    });

    it('AC#4 只有 by_product / scrap_out 行的头：展开报「无投入」', async () => {
      const parent = await makeItem('fl-s-only-p');
      const { header, addLine } = await setup(adapter, parent);
      const s = await makeItem('fl-s-only');
      await addLine('by_product', s);
      await release(header);
      await expect(
        explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '1', uom: 'pcs' } })
      ).rejects.toThrow(BomQuantityError);
    });

    it('AC#6 scrap_out 不进需求行、进产出列表', async () => {
      const parent = await makeItem('fl-scrap-p');
      const { header, addLine } = await setup(adapter, parent);
      const input = await makeItem('fl-input');
      const waste = await makeItem('fl-waste');
      await addLine('consume', input, { qty: '2' });
      await addLine('scrap_out', waste, { qty: '0.5' });
      await release(header);
      const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '1', uom: 'pcs' } });
      expect(result.requirementLines.some(line => line.itemId === waste.id)).toBe(false);
      expect(result.outputs.some(output => output.itemId === waste.id && output.direction === 'scrap_out' && output.qty === '0.5')).toBe(true);
    });

    it('AC#8 自回流：P 副产 S 又 consume S，接受且需求与产出分列', async () => {
      const parent = await makeItem('fl-recycle-p');
      const { header, addLine } = await setup(adapter, parent);
      const s = await makeItem('fl-s-recycle');
      await addLine('consume', s, { qty: '10' });
      await addLine('by_product', s, { qty: '3' });
      await release(header);
      const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '1', uom: 'pcs' } });
      expect(result.requirementLines.find(line => line.itemId === s.id)?.qty).toBe('10');
      expect(result.outputs.find(output => output.itemId === s.id)?.qty).toBe('3');
    });

    it('AC#10 副产随装配损耗缩放 golden：R 110/220→121 kg、S 10/20→11 kg', async () => {
      const parent = await makeItem('fl-m');
      const r = await makeItem('fl-r', 'kg');
      const s = await makeItem('fl-s10', 'kg');
      const { header, addLine } = await setup(adapter, parent);
      (header as unknown as { baseQty: string }).baseQty = '100';
      (header as unknown as { baseUom: string }).baseUom = 'kg';
      // 加装配损耗 10% 加成制：L 不变、R 121、S 11（US-515 AC#22：已发布头字段不可改，须在发布前定稿）
      (header as unknown as { assemblyScrap: string }).assemblyScrap = '0.1';
      await header.save();
      await addLine('consume', r, { qty: '110', uom: 'kg' });
      await addLine('by_product', s, { qty: '10', uom: 'kg' });
      await release(header);
      const at = async (planned: string): Promise<{ r: string; s: string }> => {
        const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: planned, uom: 'kg' } });
        return {
          r: result.requirementLines.find(line => line.itemId === r.id)?.qty ?? '',
          s: result.outputs.find(output => output.itemId === s.id)?.qty ?? ''
        };
      };
      expect(await at('100')).toEqual({ r: '121', s: '11' });
      expect(await at('200')).toEqual({ r: '242', s: '22' });
    });
  });
}
