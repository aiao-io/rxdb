/**
 * @fileoverview 位号子表回归测试（US-507 阶段 C：AC#4 / #5 / #12 + AC#10 / #13 的位号部分）
 *
 * 双后端（wa-sqlite / pglite）同断言：位号完整返回且需求量取 qty、草稿可暂不合法、
 * 发布转移校验位号数 = qty（错误给两个数）、非 managed 行不校验、已发布头位号增删改与改指拒绝。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { BomHeader, BomItem, BomLine, BomLineDesignator, BomLineOccurrence } from '../entities.js';
import { explodeBom } from '../quantity/explosion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomPublishValidationError, BomWriteProtocolError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

/** 建一套 draft 装配：item（经 loadHistory 发布修订）→ header → line → occurrence（含 managed 标记）。 */
const setup = async (
  adapter: BomTestAdapter,
  options: { designatorManaged?: boolean; qty?: string } = {}
): Promise<{ header: BomHeader; occurrence: BomLineOccurrence; child: BomItem }> => {
  const item = new BomItem();
  item.itemNo = `dg-item-${Math.random().toString(36).slice(2, 8)}`;
  await item.save();
  const child = new BomItem();
  child.itemNo = `dg-child-${Math.random().toString(36).slice(2, 8)}`;
  await child.save();
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
    headers: []
  });
  const revisionTable = adapter.name === 'wa-sqlite' ? `"bom$item_revision"` : `"bom"."item_revision"`;
  const rows = (await adapter.rawQuery(`SELECT "id" FROM ${revisionTable} WHERE "itemId" = '${item.id}'`)) as unknown as {
    results: { rows: unknown[][] }[];
  } | { rows: unknown[][] };
  const shape = 'results' in rows ? rows.results[0] : rows;
  const header = new BomHeader();
  header.parentRevisionId = String(shape.rows[0][0]);
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10;
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = options.qty ?? '100';
  occurrence.effectiveFrom = day('2026-01-01');
  occurrence.designatorManaged = options.designatorManaged ?? true;
  await occurrence.save();
  return { header, occurrence, child };
};

const addDesignator = async (occurrence: BomLineOccurrence, designator: string): Promise<BomLineDesignator> => {
  const entity = new BomLineDesignator();
  entity.occurrenceId = occurrence.id;
  entity.designator = designator;
  await entity.save();
  return entity;
};

for (const backend of BACKENDS) {
  describe(`位号子表 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('AC#4 managed 行挂 100 个位号：清单完整返回，需求量取自 qty 不由位号数推导', async () => {
      const { header, occurrence, child } = await setup(adapter);
      for (let index = 1; index <= 100; index++) {
        await addDesignator(occurrence, `R${index}`);
      }
      const designators = await firstValueFrom(
        BomLineDesignator.find({ where: { combinator: 'and', rules: [{ field: 'occurrenceId', operator: '=', value: occurrence.id }] } })
      );
      expect(designators.length).toBe(100);
      header.state = 'released';
      await header.save();
      // 需求量取 qty（100），位号数相等但语义上不经位号推导
      const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '1', uom: 'pcs' } });
      const line = result.requirementLines.find(entry => entry.itemId === child.id);
      expect(line?.qty).toBe('100');
    });

    it('AC#5 草稿可暂不合法：99 位号 qty=100 可存，发布拒绝且错误给两个数', async () => {
      const { header, occurrence } = await setup(adapter);
      for (let index = 1; index <= 99; index++) {
        await addDesignator(occurrence, `R${index}`);
      }
      // 草稿下逐条录入允许（同 describe 共享库，按 occurrenceId 过滤）
      const stored = await firstValueFrom(
        BomLineDesignator.find({ where: { combinator: 'and', rules: [{ field: 'occurrenceId', operator: '=', value: occurrence.id }] } })
      );
      expect(stored.length).toBe(99);
      header.state = 'released';
      const rejected = await header.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
      const message = String((rejected as Error).message);
      expect(message).toContain('99');
      expect(message).toContain('100');
    });

    it('AC#12 非 managed 行不挂位号发布照常', async () => {
      const { header } = await setup(adapter, { designatorManaged: false, qty: '2.5' });
      header.state = 'released';
      await expect(header.save()).resolves.toBeDefined();
    });

    it('AC#10/#13 位号部分：已发布头的位号增删改与改指全部拒绝', async () => {
      const { header, occurrence } = await setup(adapter);
      // 挂满 qty 个位号才能发布（发布计数校验是另一条 AC，这里不测它）
      for (let index = 1; index <= 100; index++) {
        await addDesignator(occurrence, `R${index}`);
      }
      header.state = 'released';
      await header.save();
      // 删除
      const existing = await firstValueFrom(
        BomLineDesignator.find({ where: { combinator: 'and', rules: [{ field: 'occurrenceId', operator: '=', value: occurrence.id }] } })
      );
      const removed = await existing[0].remove().then(
        () => null,
        (error: unknown) => error
      );
      expect(removed).toBeInstanceOf(BomWriteProtocolError);
      // 新增
      const inserted = await addDesignator(occurrence, 'R3').then(
        () => null,
        (error: unknown) => error
      );
      expect(inserted).toBeInstanceOf(BomWriteProtocolError);
      // 改指另一发生项（结构归属列不可改）
      const other = await setup(adapter);
      existing[1].occurrenceId = other.occurrence.id;
      const moved = await existing[1].save().then(
        () => null,
        (error: unknown) => error
      );
      expect(moved).toBeInstanceOf(BomWriteProtocolError);
    });

    it('同发生项同位号唯一；位号随发生项删除级联', async () => {
      const { occurrence } = await setup(adapter);
      await addDesignator(occurrence, 'R1');
      const duplicate = await addDesignator(occurrence, 'R1').then(
        () => null,
        (error: unknown) => error
      );
      expect(duplicate).not.toBeNull();
      await occurrence.remove();
      const remaining = await firstValueFrom(
        BomLineDesignator.find({ where: { combinator: 'and', rules: [{ field: 'occurrenceId', operator: '=', value: occurrence.id }] } })
      );
      expect(remaining.length).toBe(0);
    });
  });
}
