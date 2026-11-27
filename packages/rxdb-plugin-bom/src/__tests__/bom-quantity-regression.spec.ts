import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomConfigChar, BomConfigCharValue, BomConfigCondition, BomItem } from '../entities.js';
import * as publicBom from '../index.js';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { ecnDiff } from '../resolve/ecn.js';
import { loadHistory, type HistoryOccurrenceInput } from '../resolve/history-loader.js';
import { exportBom } from '../resolve/integration.js';
import { BomQuantityError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const context = { bomType: 'ebom' as const, orgId: 'quantity-regression', asOfDate: day('2026-10-20') };
const plannedQty = { value: '1', uom: 'pcs' };
const costContext = { ...context, currency: 'CNY', rateDate: context.asOfDate };

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`数量回归 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });
    afterAll(async () => {
      await disposeBomTestAdapter(adapter);
    });

    const item = async (): Promise<BomItem> => {
      const value = adapter.rxdb.entityManager.instantiate(BomItem, {
        itemNo: crypto.randomUUID(),
        unitPrice: '10',
        priceCurrency: 'CNY'
      });
      await value.save();
      return value;
    };

    const condition = async (): Promise<{ id: string; code: string }> => {
      const feature = adapter.rxdb.entityManager.instantiate(BomConfigChar, {
        code: `C${crypto.randomUUID().replaceAll('-', '')}`,
        orgId: context.orgId
      });
      await feature.save();
      for (const value of ['red', 'blue']) {
        await adapter.rxdb.entityManager.instantiate(BomConfigCharValue, { charId: feature.id, value }).save();
      }
      const value = adapter.rxdb.entityManager.instantiate(BomConfigCondition, {
        orgId: context.orgId,
        grammarVersion: '1',
        expression: `${feature.code} = red`
      });
      await value.save();
      return { id: value.id, code: feature.code };
    };

    const conditionalGroup = async (filteredRole: 'primary' | 'substitute') => {
      const parent = await item();
      const primary = await item();
      const substitute = await item();
      const filter = await condition();
      await loadHistory(adapter, {
        batchNo: crypto.randomUUID(),
        revisions: [parent, primary, substitute].map(value => ({
          itemId: value.id,
          revisionNo: 'A',
          effectiveFrom: day('2020-01-01')
        })),
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: context.orgId,
            costLotQty: '1',
            lines: [primary, substitute].map((value, index) => ({
              lineNo: (index + 1) * 10,
              occurrences: [
                {
                  childItemId: value.id,
                  qty: '10',
                  effectiveFrom: day('2020-01-01'),
                  selectionConditionId: (index === 0 ? 'primary' : 'substitute') === filteredRole ? filter.id : null
                }
              ]
            })),
            substituteGroups: [
              {
                code: `G${crypto.randomUUID()}`,
                strategy: 'proportional',
                members: [
                  { occurrenceIndex: 0, role: 'primary', probability: '0.5' },
                  { occurrenceIndex: 1, role: 'substitute', probability: '0.5', equivQty: '1' }
                ]
              }
            ]
          }
        ]
      });
      return { parent, configSelection: { [filter.code]: ['blue'] } };
    };

    it.each(['primary', 'substitute'] as const)('配置过滤 %s 后的替代组不得少算需求或成本', async role => {
      const fixture = await conditionalGroup(role);
      const selected = { ...context, configSelection: fixture.configSelection };
      const target = { parentItemId: fixture.parent.id };
      await expect(explodeBom(adapter, selected, target, { plannedQty })).rejects.toThrow(BomQuantityError);
      await expect(rollupCost(adapter, { ...costContext, ...selected }, target)).rejects.toThrow();
    });

    it('合法完整替代组仍按概率分配，完整性校验不自动归一化', async () => {
      const fixture = await conditionalGroup('substitute');
      const code = Object.keys(fixture.configSelection)[0];
      const result = await explodeBom(
        adapter,
        { ...context, configSelection: { [code]: ['red'] } },
        { parentItemId: fixture.parent.id },
        { plannedQty }
      );
      expect(result.requirementLines.map(line => line.qty)).toEqual(['5', '5']);
    });

    it('组件损耗与工序损耗记录各自中间量', async () => {
      const parent = await item();
      const child = await item();
      await loadHistory(adapter, {
        batchNo: crypto.randomUUID(),
        revisions: [parent, child].map(value => ({
          itemId: value.id,
          revisionNo: 'A',
          effectiveFrom: day('2020-01-01')
        })),
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: context.orgId,
            lines: [
              {
                lineNo: 10,
                occurrences: [
                  {
                    childItemId: child.id,
                    qty: '10',
                    componentScrap: '0.1',
                    operationSeq: 10,
                    effectiveFrom: day('2020-01-01')
                  }
                ]
              }
            ],
            routing: { workCenterCode: crypto.randomUUID(), operations: [{ seq: 10, scrap: '0.1' }], allocations: [] }
          }
        ]
      });
      const result = await explodeBom(adapter, context, { parentItemId: parent.id }, { plannedQty });
      expect(result.requirementLines[0].steps.componentScrapped).toEqual({ value: '11', uom: 'pcs' });
      expect(result.requirementLines[0].steps.operationScrapped).toEqual({ value: '12.1', uom: 'pcs' });
      expect(result.requirementLines[0].qty).toBe('13');
    });

    const scalarHeader = async (): Promise<BomItem> => {
      const parent = await item();
      const child = await item();
      await loadHistory(adapter, {
        batchNo: crypto.randomUUID(),
        revisions: [parent, child].map(value => ({
          itemId: value.id,
          revisionNo: 'A',
          effectiveFrom: day('2020-01-01')
        })),
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: context.orgId,
            costLotQty: '1',
            lines: [
              { lineNo: 10, occurrences: [{ childItemId: child.id, qty: '2', effectiveFrom: day('2020-01-01') }] }
            ]
          }
        ]
      });
      return parent;
    };

    it('根计划量拒绝负数，导出不产生完整负需求', async () => {
      const parent = await scalarHeader();
      const target = { parentItemId: parent.id };
      const options = { plannedQty: { value: '-1', uom: 'pcs' } };
      await expect(explodeBom(adapter, context, target, options)).rejects.toThrow();
      await expect(rollupCost(adapter, costContext, target, options.plannedQty)).rejects.toThrow();
      await expect(exportBom(adapter, context, target, options)).rejects.toThrow();
    });

    it('根计划量沿用十进制规范化，负零不产生负需求', async () => {
      const parent = await scalarHeader();
      const target = { parentItemId: parent.id };
      const result = await explodeBom(adapter, context, target, { plannedQty: { value: '01.00e1', uom: 'pcs' } });
      expect(result.requirementLines[0].qty).toBe('20');
      const zero = await explodeBom(adapter, context, target, { plannedQty: { value: '-0', uom: 'pcs' } });
      expect(zero.requirementLines[0].qty).toBe('0');
    });

    it('ECN 差异保留并比较公式用量', async () => {
      const parent = await item();
      const child = await item();
      const ecnId = crypto.randomUUID();
      const occurrence = (formula: string): HistoryOccurrenceInput => ({
        childItemId: child.id,
        qtyFormula: formula,
        formulaGrammarVersion: '1',
        effectiveFrom: day('2020-01-01')
      });
      await loadHistory(adapter, {
        batchNo: crypto.randomUUID(),
        revisions: [parent, child].map(value => ({
          itemId: value.id,
          revisionNo: 'A',
          effectiveFrom: day('2020-01-01')
        })),
        ecns: [{ id: ecnId, ecnNo: crypto.randomUUID(), state: 'released', effectiveDate: day('2026-10-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: context.orgId,
            lines: [
              {
                lineNo: 10,
                occurrences: [
                  { ...occurrence('1+1'), effectiveTo: day('2026-10-01'), ecnOutId: ecnId },
                  { ...occurrence('2+2'), effectiveFrom: day('2026-10-01'), ecnInId: ecnId }
                ]
              }
            ]
          }
        ]
      });
      const result = await ecnDiff(adapter, ecnId);
      expect(result.headers[0].entries).toHaveLength(1);
      expect(result.headers[0].entries[0]).toMatchObject({
        kind: 'qty_changed',
        before: { qtyFormula: '1+1' },
        after: { qtyFormula: '2+2' }
      });
    });
  });
}

it('映射实体可从公开入口创建', () => {
  expect(publicBom).toHaveProperty('BomMapScope');
  expect(publicBom).toHaveProperty('BomMap');
});
