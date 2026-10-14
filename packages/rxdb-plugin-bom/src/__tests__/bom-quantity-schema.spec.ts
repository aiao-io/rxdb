/**
 * @fileoverview 数量语义的存储约束回归测试（US-511 阶段 A/B1 存储段：AC#7 / #12 / #21 / #25 / #26）
 *
 * 双后端（wa-sqlite / pglite）同断言：qty 与公式恰好一项、阶梯三字段形状、良率制损耗域、
 * 阶梯边界 15 位域（保存期一致拒绝）与直连 SQL 拒绝。
 */

import { RxDBCheckViolationError } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { BomDecimalFormatError } from '../types.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const settled = <T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> =>
  promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error })
  );

/** 建一套最小装配（draft 头 + 行），返回可挂发生项的 line 与头。 */
const setup = async (adapter: BomTestAdapter) => {
  const item = new BomItem();
  item.itemNo = `qs-item-${Math.random().toString(36).slice(2, 8)}`;
  await item.save();
  const revision = new BomItemRevision();
  revision.revisionNo = 'A';
  revision.itemId = item.id;
  await revision.save();
  const header = new BomHeader();
  header.parentRevisionId = revision.id;
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  const child = new BomItem();
  child.itemNo = `qs-child-${Math.random().toString(36).slice(2, 8)}`;
  await child.save();
  return { header, child };
};

/** 每次建一条新逻辑行再挂发生项（同一行同区间会被排他约束先拒，测不到 CHECK）。 */
const makeOccurrence = async (
  header: BomHeader,
  child: BomItem,
  overrides: Partial<BomLineOccurrence> = {}
): Promise<BomLineOccurrence> => {
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10 + Math.floor(Math.random() * 1000);
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = '1';
  occurrence.effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
  Object.assign(occurrence, overrides);
  return occurrence;
};

for (const backend of BACKENDS) {
  describe(`数量语义存储约束 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('qty 与 qty_formula 恰好一项（AC#7）', async () => {
      const { header, child } = await setup(adapter);
      await expect((await makeOccurrence(header, child)).save()).resolves.toBeDefined();
      const both = await settled((await makeOccurrence(header, child, { qty: '1', qtyFormula: '1+1' })).save());
      expect(both.ok).toBe(false);
      expect((both as { error: unknown }).error).toBeInstanceOf(RxDBCheckViolationError);
      const neither = await settled((await makeOccurrence(header, child, { qty: null })).save());
      expect(neither.ok).toBe(false);
      expect((neither as { error: unknown }).error).toBeInstanceOf(RxDBCheckViolationError);
      const formulaOnly = await makeOccurrence(header, child, { qty: null, qtyFormula: '长*宽', formulaGrammarVersion: '1' });
      await expect(formulaOnly.save()).resolves.toBeDefined();
      expect(formulaOnly.qtyFormula).toBe('长*宽');
    });

    it('阶梯三字段同空或 tier_group_no 与 lotsize_from 同非空（AC#21）', async () => {
      const { header, child } = await setup(adapter);
      await expect((await makeOccurrence(header, child)).save()).resolves.toBeDefined();
      const fromOnly = await settled((await makeOccurrence(header, child, { lotsizeFrom: '0' })).save());
      expect(fromOnly.ok).toBe(false);
      expect((fromOnly as { error: unknown }).error).toBeInstanceOf(RxDBCheckViolationError);
      const tierOnly = await settled((await makeOccurrence(header, child, { tierGroupNo: 'g1' })).save());
      expect(tierOnly.ok).toBe(false);
      expect((tierOnly as { error: unknown }).error).toBeInstanceOf(RxDBCheckViolationError);
      const tier = await makeOccurrence(header, child, { tierGroupNo: 'g1', lotsizeFrom: '0', lotsizeTo: '100' });
      await expect(tier.save()).resolves.toBeDefined();
      expect(tier.tierGroupNo).toBe('g1');
      expect(tier.lotsizeFrom).toBe('0');
    });

    it('新列存取往返（uom / 损耗 / 换算率 / phantom_override）', async () => {
      const { header, child } = await setup(adapter);
      const occurrence = await makeOccurrence(header, child, {
        uom: 'm',
        componentScrap: '0.02',
        componentScrapConvention: 'yield',
        componentScrapFixed: '0.5',
        uomConversion: '2.5',
        phantomOverride: true
      });
      await occurrence.save();
      const stored = occurrence as BomLineOccurrence;
      expect(stored.uom).toBe('m');
      expect(stored.componentScrap).toBe('0.02');
      expect(stored.componentScrapConvention).toBe('yield');
      expect(stored.componentScrapFixed).toBe('0.5');
      expect(stored.uomConversion).toBe('2.5');
      expect(stored.phantomOverride).toBe(true);
    });

    it('良率制损耗必须 < 1：s = 1 拒绝、加成制不受限（AC#12）', async () => {
      const { header, child } = await setup(adapter);
      const rejected = await settled(
        (await makeOccurrence(header, child, { componentScrap: '1', componentScrapConvention: 'yield' })).save()
      );
      expect(rejected.ok).toBe(false);
      expect((rejected as { error: unknown }).error).toBeInstanceOf(BomDecimalFormatError);
      expect(((rejected as { error: BomDecimalFormatError }).error).field).toBe('componentScrap');
      await expect((await makeOccurrence(header, child, { componentScrap: '0.05', componentScrapConvention: 'yield' })).save()).resolves.toBeDefined();
      await expect((await makeOccurrence(header, child, { componentScrap: '0', componentScrapConvention: 'yield' })).save()).resolves.toBeDefined();
      await expect((await makeOccurrence(header, child, { componentScrap: '1', componentScrapConvention: 'additive' })).save()).resolves.toBeDefined();
      // 装配损耗同型（头级）
      header.assemblyScrap = '1';
      header.assemblyScrapConvention = 'yield';
      const headerRejected = await settled(header.save());
      expect(headerRejected.ok).toBe(false);
      expect((headerRejected as { error: unknown }).error).toBeInstanceOf(BomDecimalFormatError);
      expect(((headerRejected as { error: BomDecimalFormatError }).error).field).toBe('assemblyScrap');
      header.assemblyScrap = '0.05';
      await expect(header.save()).resolves.toBeDefined();
    });

    it('阶梯边界域：15 位有效数字与整数/小数位数（AC#25/#26 保存段）', async () => {
      const { header, child } = await setup(adapter);
      // 15 位有效数字（14 位小数）与 15 位小数对照组、15 位整数对照组：接受
      await expect(
        (await makeOccurrence(header, child, { tierGroupNo: 'g', lotsizeFrom: '1.00000000000001', lotsizeTo: '999999999999999' })).save()
      ).resolves.toBeDefined();
      await expect(
        (await makeOccurrence(header, child, { tierGroupNo: 'g', lotsizeFrom: '0.000000000000001', lotsizeTo: '1' })).save()
      ).resolves.toBeDefined();
      // 16 位有效数字（15 位小数）：拒绝
      const sixteen = await settled(
        (await makeOccurrence(header, child, { tierGroupNo: 'g', lotsizeFrom: '1.000000000000001', lotsizeTo: '1' })).save()
      );
      expect(sixteen.ok).toBe(false);
      expect((sixteen as { error: unknown }).error).toBeInstanceOf(BomDecimalFormatError);
      expect(((sixteen as { error: BomDecimalFormatError }).error).field).toBe('lotsizeFrom');
      // 16 位整数：拒绝
      const wide = await settled(
        (await makeOccurrence(header, child, { tierGroupNo: 'g', lotsizeFrom: '1000000000000000', lotsizeTo: '1' })).save()
      );
      expect(wide.ok).toBe(false);
      // 1 位有效数字但幅值越界（1e-400 规范化后小数部分 400 位）：拒绝
      const tiny = await settled(
        (await makeOccurrence(header, child, { tierGroupNo: 'g', lotsizeFrom: '1e-400', lotsizeTo: '1' })).save()
      );
      expect(tiny.ok).toBe(false);
      expect((tiny as { error: unknown }).error).toBeInstanceOf(BomDecimalFormatError);
      expect(((tiny as { error: BomDecimalFormatError }).error).field).toBe('lotsizeFrom');
    });

    it('直连 SQL 写非规范串到新十进制列仍被拒', async () => {
      const { header, child } = await setup(adapter);
      const rawLine = new BomLine();
      rawLine.headerId = header.id;
      rawLine.lineNo = 500 + Math.floor(Math.random() * 100);
      await rawLine.save();
      const tableRef = backend === 'wa-sqlite' ? `"bom$bom_line_occurrence"` : `"bom"."bom_line_occurrence"`;
      const raw = await settled(
        adapter.rawQuery(
          `INSERT INTO ${tableRef} ("id", "lineId", "childItemId", "qty", "uom", "componentScrap", "effectiveFrom") VALUES ('${crypto.randomUUID()}', '${rawLine.id}', '${child.id}', '1', 'pcs', '1.5E-3', '2026-01-01T00:00:00.000Z')`
        )
      );
      expect(raw.ok).toBe(false);
      expect(String((raw as { error: Error }).error.message)).toContain('rxdb:bom_decimal_format:componentScrap');
    });
  });
}
