import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomAttrDef } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { COPRODUCT_DATASET, COPRODUCT_GOLDEN, loadCoproductDataset } from '../testing/coproduct-dataset.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const context = {
  bomType: 'ebom' as const,
  orgId: COPRODUCT_DATASET.orgId,
  asOfDate: new Date('2026-10-15T00:00:00.000Z'),
  rateDate: new Date('2026-10-15T00:00:00.000Z'),
  currency: 'CNY'
};

for (const backend of ['wa-sqlite', 'pglite'] satisfies BomTestBackend[]) {
  describe(`共享联产演示种子 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });
    afterAll(async () => {
      await disposeBomTestAdapter(adapter);
    });

    it('手写220/132/88与下游17.6真实接入kernel，来源不选择时拒绝', async () => {
      const ids = await loadCoproductDataset(adapter);
      expect(ids).toEqual(COPRODUCT_DATASET.ids);
      const result = await rollupCost(
        adapter,
        context,
        { parentRevisionId: ids.primaryRevisionId },
        { value: '100', uom: 'kg' }
      );
      expect(result.root.jointCost?.netCost).toBe(COPRODUCT_GOLDEN.netCost);
      expect(result.root.batchCost).toBe(COPRODUCT_GOLDEN.primaryBatchCost);
      expect(result.root.jointCost?.outputs.map(output => [output.qty, output.batchCost, output.unitCost])).toEqual([
        ['100', '132', '1.32'],
        ['50', '88', '1.76']
      ]);
      await expect(rollupCost(adapter, context, { parentRevisionId: ids.consumerRevisionId })).rejects.toThrow(
        /联产.*来源/
      );
      const consumer = await rollupCost(
        adapter,
        { ...context, jointCostSources: { [ids.coproductRevisionId]: ids.producerHeaderId } },
        { parentRevisionId: ids.consumerRevisionId }
      );
      expect(consumer.root.batchCost).toBe(COPRODUCT_GOLDEN.consumerBatchCost);
    });

    it('两个独立库装载的标识符和成本输出逐字一致', async () => {
      const first = await createBomTestAdapter(backend);
      const second = await createBomTestAdapter(backend);
      try {
        const a = await loadCoproductDataset(first);
        const b = await loadCoproductDataset(second);
        expect(a).toEqual(b);
        const root = { parentRevisionId: a.primaryRevisionId };
        expect(await rollupCost(first, context, root)).toEqual(await rollupCost(second, context, root));
      } finally {
        await disposeBomTestAdapter(first);
        await disposeBomTestAdapter(second);
      }
    });

    it('现有必填字典要求显式itemExt，缺失或非法值仍拒绝，合法值随四物料保存', async () => {
      const existing = await createBomTestAdapter(backend);
      try {
        const definition = existing.rxdb.entityManager.instantiate(BomAttrDef, {
          code: 'rohs',
          dataType: 'string',
          required: true,
          enumValues: '["yes","no"]',
          appliesTo: 'item'
        });
        await definition.save();
        await expect(loadCoproductDataset(existing)).rejects.toThrow(/rohs.*必填/);
        await expect(loadCoproductDataset(existing, { itemExt: { rohs: 'maybe' } })).rejects.toThrow(/rohs.*yes.*no/);
        const table = bomSqlDialectFor(existing.name).table('item');
        const before = await existing.transaction(executor => executor.query(`SELECT COUNT(*) FROM ${table}`));
        expect(Number(before.rows[0][0])).toBe(0);

        const ids = await loadCoproductDataset(existing, { itemExt: { rohs: 'yes' } });
        const items = await existing.transaction(executor => executor.query(`SELECT "ext" FROM ${table}`));
        expect(items.rows.map(row => row[0])).toEqual(Array<string>(4).fill('{"rohs":"yes"}'));
        expect(definition.required).toBe(true);
        expect(definition.enumValues).toBe('["yes","no"]');
        const result = await rollupCost(
          existing,
          context,
          { parentRevisionId: ids.primaryRevisionId },
          { value: '100', uom: 'kg' }
        );
        expect(result.root.jointCost?.outputs.map(output => output.batchCost)).toEqual(['132', '88']);
      } finally {
        await disposeBomTestAdapter(existing);
      }
    });
  });
}
