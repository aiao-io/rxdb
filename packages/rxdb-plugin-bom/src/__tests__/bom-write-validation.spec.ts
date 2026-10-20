/**
 * @fileoverview 写入入口校验回归（评审 P1-5 写入侧 / P2-12）
 *
 * - P1-5：凡写入 qtyFormula 的入口（仓储、历史通道、整批导入）断言 formulaGrammarVersion 是当前公式语法版本，
 *   不让惰性列携带求值期无法兑现的版本承诺；
 * - P2-12：入口对每个十进制列按存储层同一域规则规范化并校验（工序工时 / 制费 / 价格 / 费率 / 工序损耗同样
 *   规范化；阶梯边界 15 位、[0,1] 九位小数、良率制 [0,1) 在入口点名列与域）。
 *
 * 双后端（wa-sqlite / pglite）同断言。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomActivityRate,
  BomActivityType,
  BomHeader,
  BomItem,
  BomLine,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomRouting,
  BomRoutingOperation,
  BomWorkCenter
} from '../entities.js';
import { FORMULA_GRAMMAR_VERSION } from '../quantity/formula.js';
import { loadHistory } from '../resolve/history-loader.js';
import { importBomDraft } from '../resolve/integration.js';
import { BomDecimalFormatError, BomQuantityError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const rand = (): string => Math.random().toString(36).slice(2, 10);

for (const backend of BACKENDS) {
  describe(`写入入口校验 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const table = (name: string): string => (backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`);

    const storedValue = async (name: string, column: string, id: string): Promise<unknown> =>
      (await adapter.rawQuery(`SELECT "${column}" FROM ${table(name)} WHERE "id" = '${id}'`)).rows[0][0];

    const makeItem = async (prefix: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${prefix}-${rand()}`;
      await item.save();
      await loadHistory(adapter, {
        batchNo: `batch-${rand()}`,
        revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      return item;
    };

    const revisionIdOf = async (item: BomItem): Promise<string> =>
      String(
        (await adapter.rawQuery(`SELECT "id" FROM ${table('item_revision')} WHERE "itemId" = '${item.id}'`)).rows[0][0]
      );

    /** 草稿头下的一条逻辑行（行发生项由调用方写）。 */
    const draftLine = async (): Promise<{ line: BomLine; child: BomItem }> => {
      const parent = await makeItem('wv-p');
      const header = new BomHeader();
      header.parentRevisionId = await revisionIdOf(parent);
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      await header.save();
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10;
      await line.save();
      return { line, child: await makeItem('wv-c') };
    };

    const occurrenceOn = (line: BomLine, child: BomItem, overrides: Partial<BomLineOccurrence>): BomLineOccurrence => {
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '1';
      occurrence.effectiveFrom = day('2026-01-01');
      Object.assign(occurrence, overrides);
      return occurrence;
    };

    describe('P1-5 qtyFormula 写入须记当前公式语法版本', () => {
      it('仓储：未知版本 / 缺版本拒绝，当前版本放行；更新为未知版本同样拒绝', async () => {
        const { line, child } = await draftLine();
        const formula = { qty: null, qtyFormula: '长*宽' };
        await expect(occurrenceOn(line, child, { ...formula, formulaGrammarVersion: '9' }).save()).rejects.toThrow(
          BomQuantityError
        );
        await expect(occurrenceOn(line, child, { ...formula, formulaGrammarVersion: null }).save()).rejects.toThrow(
          /语法版本/
        );
        const accepted = occurrenceOn(line, child, { ...formula, formulaGrammarVersion: FORMULA_GRAMMAR_VERSION });
        await accepted.save();
        accepted.formulaGrammarVersion = '9';
        await expect(accepted.save()).rejects.toThrow(/语法版本/);
      });

      it('仓储：语法错的 qtyFormula 即使带当前版本也在写入期拒绝，不留到展开期', async () => {
        const { line, child } = await draftLine();
        for (const qtyFormula of ['长 *', '(长 + 宽', '长 宽']) {
          await expect(
            occurrenceOn(line, child, { qty: null, qtyFormula, formulaGrammarVersion: FORMULA_GRAMMAR_VERSION }).save(),
            qtyFormula
          ).rejects.toThrow(BomQuantityError);
        }
      });

      it('历史通道：公式行带未知语法版本整批拒绝', async () => {
        const parent = await makeItem('wv-h');
        const child = await makeItem('wv-hc');
        await expect(
          loadHistory(adapter, {
            batchNo: `batch-${rand()}`,
            revisions: [{ itemId: parent.id, revisionNo: 'B', effectiveFrom: day('2021-01-01') }],
            headers: [
              {
                revisionIndex: 0,
                bomType: 'ebom',
                orgId: 'org-x',
                lines: [
                  {
                    lineNo: 10,
                    occurrences: [
                      {
                        childItemId: child.id,
                        qty: null,
                        qtyFormula: '长*宽',
                        formulaGrammarVersion: '9',
                        effectiveFrom: day('2021-01-01')
                      }
                    ]
                  }
                ]
              }
            ]
          })
        ).rejects.toThrow(/语法版本/);
      });

      it('整批导入：公式行带未知语法版本 → 诊断点名、整批回滚', async () => {
        const key = rand();
        const identity = {
          itemNo: `IMP-${key}`,
          revisionNo: 'RevA',
          bomType: 'ebom',
          orgId: 'org-x',
          alternativeNo: 1
        };
        const result = await importBomDraft(adapter, [
          { kind: 'item', source_ref: 'i-p', itemNo: `IMP-${key}` },
          { kind: 'item', source_ref: 'i-c', itemNo: `IMC-${key}` },
          { kind: 'revision', source_ref: 'r-p', itemNo: `IMP-${key}`, revisionNo: 'RevA', state: 'draft' },
          {
            kind: 'header',
            source_ref: 'h-p',
            ...identity,
            state: 'draft',
            baseUom: 'pcs',
            baseQty: '1',
            assemblyScrap: '0'
          },
          { kind: 'line', source_ref: 'l-p', ...identity, lineNo: 10 },
          {
            kind: 'occurrence',
            source_ref: 'o-formula',
            ...identity,
            lineNo: 10,
            effectiveFrom: '2024-01-01',
            childItemNo: `IMC-${key}`,
            qty: null,
            qtyFormula: '2*x',
            formulaGrammarVersion: '9'
          }
        ]);
        expect(result.committed).toBe(false);
        expect(result.diagnostics.map(row => row.message).join('|')).toMatch(/o-formula.*语法版本/);
      });
    });

    describe('P2-12 十进制列入口域与存储层同口径', () => {
      it('工序工时 / 工序损耗 / 制费 / 价格 / 费率在入口规范化（不再被存储层以非规范串拒绝）', async () => {
        const parent = await makeItem('wv-r');
        const center = new BomWorkCenter();
        center.code = `wc-${rand()}`;
        center.orgId = 'org-x';
        center.overheadRate = '0.20';
        await center.save();
        expect(await storedValue('work_center', 'overheadRate', center.id)).toBe('0.2');
        const routing = new BomRouting();
        routing.parentRevisionId = await revisionIdOf(parent);
        routing.bomType = 'mbom';
        routing.orgId = 'org-x';
        routing.validFrom = day('2026-01-01');
        await routing.save();
        const operation = new BomRoutingOperation();
        operation.routingId = routing.id;
        operation.workCenterId = center.id;
        operation.operationSeq = 10;
        operation.setupTime = '1.50';
        operation.runTime = '2.0';
        operation.fixedTime = '25e-2';
        operation.operationScrap = '0.50';
        await operation.save();
        for (const [column, expected] of [
          ['setupTime', '1.5'],
          ['runTime', '2'],
          ['fixedTime', '0.25'],
          ['operationScrap', '0.5']
        ] as const) {
          expect(await storedValue('routing_operation', column, operation.id)).toBe(expected);
        }
        const item = new BomItem();
        item.itemNo = `wv-price-${rand()}`;
        item.unitPrice = '2.50';
        item.creditPrice = '0.10';
        await item.save();
        expect(await storedValue('item', 'unitPrice', item.id)).toBe('2.5');
        expect(await storedValue('item', 'creditPrice', item.id)).toBe('0.1');
        const activity = new BomActivityType();
        activity.code = `act-${rand()}`;
        activity.workCenterId = center.id;
        await activity.save();
        const rate = new BomActivityRate();
        rate.workCenterId = center.id;
        rate.activityTypeId = activity.id;
        rate.validFrom = day('2026-01-01');
        rate.rate = '10.0';
        rate.currency = 'CNY';
        rate.rateUom = 'h';
        await rate.save();
        expect(await storedValue('activity_rate', 'rate', rate.id)).toBe('10');
      });

      it('域违约在入口点名列与域：阶梯边界 15 位、[0,1] 九位小数、良率制 [0,1)', async () => {
        const { line, child } = await draftLine();
        const rejected = async (overrides: Partial<BomLineOccurrence>, pattern: RegExp): Promise<void> => {
          const failure = await occurrenceOn(line, child, overrides)
            .save()
            .then(
              () => undefined,
              (error: unknown) => error
            );
          expect(failure).toBeInstanceOf(BomDecimalFormatError);
          expect(String((failure as Error).message)).toMatch(pattern);
        };
        await rejected({ tierGroupNo: '1', lotsizeFrom: '1234567890123456' }, /lotsizeFrom.*阶梯边界/);
        await rejected({ usageProbability: '1.5' }, /usageProbability.*\[0,1\]/);
        await rejected({ usageProbability: '0.1234567891' }, /usageProbability.*\[0,1\]/);
        await rejected({ componentScrap: '1', componentScrapConvention: 'yield' }, /componentScrap.*良率制/);
        // 只改记法也按合并后的行判域
        const additive = occurrenceOn(line, child, { componentScrap: '1.5', effectiveTo: day('2027-01-01') });
        await additive.save();
        additive.componentScrapConvention = 'yield';
        const failure = await additive.save().then(
          () => undefined,
          (error: unknown) => error
        );
        expect(String((failure as Error).message)).toMatch(/componentScrap.*良率制/);
        // 份额 / 概率非规范串在入口规范化
        const probability = occurrenceOn(line, child, { usageProbability: '0.50', effectiveFrom: day('2030-01-01') });
        await probability.save();
        expect(await storedValue('bom_line_occurrence', 'usageProbability', probability.id)).toBe('0.5');
        const split = new BomLineOperationSplit();
        split.occurrenceId = probability.id;
        split.operationSeq = 10;
        split.ratio = '0.1234567891';
        await expect(split.save()).rejects.toThrow(/ratio.*\[0,1\]/);
      });

      it('整批导入：阶梯边界越界的诊断点名域，而非笼统的非规范串', async () => {
        const key = rand();
        const identity = {
          itemNo: `IML-${key}`,
          revisionNo: 'RevA',
          bomType: 'ebom',
          orgId: 'org-x',
          alternativeNo: 1
        };
        const result = await importBomDraft(adapter, [
          { kind: 'item', source_ref: 'i-p', itemNo: `IML-${key}` },
          { kind: 'item', source_ref: 'i-c', itemNo: `IMLC-${key}` },
          { kind: 'revision', source_ref: 'r-p', itemNo: `IML-${key}`, revisionNo: 'RevA', state: 'draft' },
          {
            kind: 'header',
            source_ref: 'h-p',
            ...identity,
            state: 'draft',
            baseUom: 'pcs',
            baseQty: '1',
            assemblyScrap: '0'
          },
          { kind: 'line', source_ref: 'l-p', ...identity, lineNo: 10 },
          {
            kind: 'occurrence',
            source_ref: 'o-tier',
            ...identity,
            lineNo: 10,
            effectiveFrom: '2024-01-01',
            childItemNo: `IMLC-${key}`,
            qty: '1',
            tierGroupNo: '1',
            lotsizeFrom: '1234567890123456'
          }
        ]);
        expect(result.committed).toBe(false);
        expect(result.diagnostics.map(row => row.message).join('|')).toMatch(/o-tier.*阶梯边界/);
      });
    });
  });
}
