/** @fileoverview 阶段 F 真实种子、既有整机计算与实例来源保护的双后端回归。 */

import { describe, expect, it } from 'vitest';
import {
  BomEcn,
  BomHeader,
  BomHistoryBatch,
  BomInstanceNode,
  BomItem,
  BomLine,
  BomLineOccurrence
} from '../entities.js';
import { rollupCost, type CostRollupContext, type CostRollupResult } from '../quantity/cost.js';
import { explodeBom, type ExplosionResult } from '../quantity/explosion.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import {
  deterministicId,
  loadScooterDataset,
  loadScooterDatasetC,
  loadScooterDatasetD,
  loadScooterDatasetE,
  loadScooterDatasetF,
  SCOOTER_SEED_ROW_COUNTS
} from '../testing/index.js';
import { createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

const day = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const allRows = { where: { combinator: 'and' as const, rules: [] } };

interface MasterSnapshot {
  context: ResolutionContext;
  costContext: CostRollupContext;
  explosion: ExplosionResult;
  cost: CostRollupResult;
}

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`SC-100 种子 F 层 [${backend}]`, () => {
    it('F 层真实落库，保持 A～E 整机展开与卷算，实例实际修订与草稿来源可追溯', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const itemIds = await loadScooterDataset(adapter);
        await loadScooterDatasetC(adapter, itemIds);
        await loadScooterDatasetD(adapter, itemIds);
        await loadScooterDatasetE(adapter, itemIds);
        const target = { parentItemId: itemIds['SC-100'] };
        const snapshots: MasterSnapshot[] = [];
        for (const date of ['2026-09-22', '2026-10-15', '2026-10-16']) {
          const context = {
            bomType: 'ebom' as const,
            orgId: 'org-x',
            asOfDate: day(date),
            unit: 137,
            configSelection: { 颜色: ['红'] }
          };
          const costContext = { ...context, currency: 'CNY', rateDate: context.asOfDate };
          const explosion = await explodeBom(adapter, context, target, { plannedQty: { value: '1', uom: 'pcs' } });
          const cost = await rollupCost(adapter, costContext, target);
          snapshots.push({ context, costContext, explosion, cost });
        }

        await loadScooterDatasetF(adapter, itemIds);

        for (const before of snapshots) {
          expect(await explodeBom(adapter, before.context, target, { plannedQty: { value: '1', uom: 'pcs' } })).toEqual(
            before.explosion
          );
          expect(await rollupCost(adapter, before.costContext, target)).toEqual(before.cost);
        }
        const installed = await adapter.getRepository(BomInstanceNode).find(allRows);
        expect(installed).toHaveLength(5);
        // 全量种子行数常量（demo 概览与 e2e 期望共用）由真实落库行数守住：改种子不改常量即红
        expect({
          item: (await adapter.getRepository(BomItem).find(allRows)).length,
          bomLineOccurrence: (await adapter.getRepository(BomLineOccurrence).find(allRows)).length,
          ecn: (await adapter.getRepository(BomEcn).find(allRows)).length,
          historyBatch: (await adapter.getRepository(BomHistoryBatch).find(allRows)).length,
          instanceNode: installed.length
        }).toEqual(SCOOTER_SEED_ROW_COUNTS);
        const serialized = (await adapter.getRepository(BomItem).find(allRows)).filter(item =>
          ['SC-100', 'BATT'].includes(item.itemNo)
        );
        expect(serialized).toHaveLength(2);
        expect(serialized.every(item => item.serialized)).toBe(true);

        const options = { asOfDate: day('2026-10-17') };
        const first = await adapter.rxdb.bom.expandInstance(deterministicId('instance:SC-100:SN-001'), options);
        const second = await adapter.rxdb.bom.expandInstance(deterministicId('instance:SC-100:SN-002'), options);
        expect(first.truncated).toBe(false);
        expect(second.truncated).toBe(false);
        expect(first.nodes.map(node => [node.itemNo, node.revisionNo, node.serialNumber])).toEqual([
          ['SC-100', 'A', 'SN-001'],
          ['BATT', 'A', 'PACK-001']
        ]);
        expect(second.nodes.find(node => node.itemNo === 'BATT')).toMatchObject({
          revisionNo: 'A',
          serialNumber: 'PACK-002'
        });
        const protectedSourceId = deterministicId('occurrence:BATT:F:0');
        expect(second.nodes.find(node => node.itemNo === 'CELL')).toMatchObject({
          revisionNo: 'A',
          serialNumber: null,
          lotCode: 'CELL-LOT-F',
          sourceOccurrenceId: protectedSourceId
        });
        const byLot = await adapter.rxdb.bom.whereUsedInstance({ lotCode: 'PACK-LOT-A' }, options);
        expect(byLot.truncated).toBe(false);
        expect(byLot.matches.map(match => match.root.serialNumber).sort()).toEqual(['SN-001', 'SN-002']);
        const bySerial = await adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'PACK-001' }, options);
        expect(bySerial.matches).toHaveLength(1);
        expect(bySerial.matches[0].path.map(node => node.itemNo)).toEqual(['SC-100', 'BATT']);
        expect(bySerial.matches[0].node.revisionNo).toBe('A');

        const source = (await adapter.getRepository(BomLineOccurrence).find(allRows)).find(
          row => row.id === protectedSourceId
        );
        expect(source).toBeDefined();
        const line = (await adapter.getRepository(BomLine).find(allRows)).find(row => row.id === source!.lineId);
        const header = (await adapter.getRepository(BomHeader).find(allRows)).find(row => row.id === line!.headerId);
        expect(header?.state).toBe('draft');
        const sourceTable = backend === 'pglite' ? '"bom"."bom_line_occurrence"' : '"bom$bom_line_occurrence"';
        const rejection = await adapter.rawQuery(`DELETE FROM ${sourceTable} WHERE "id" = '${protectedSourceId}'`).then(
          () => null,
          error => String(error)
        );
        expect(rejection).not.toBeNull();
        expect(rejection).toContain(protectedSourceId);
        expect(rejection).toMatch(/实例.*1|1.*实例/);
        expect(
          (await adapter.getRepository(BomLineOccurrence).find(allRows)).some(row => row.id === protectedSourceId)
        ).toBe(true);
        expect(await adapter.rxdb.bom.expandInstance(second.rootId, options)).toEqual(second);
        expect(await adapter.getRepository(BomInstanceNode).find(allRows)).toHaveLength(5);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 30000);
  });
}
