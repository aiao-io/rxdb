import { describe, expect, it } from 'vitest';
import { createBomTestAdapter, disposeBomTestAdapter } from '../src/__tests__/test-utils.js';
import { BomLineOccurrence } from '../src/entities.js';
import { bomSqlDialectFor } from '../src/resolve/bom-sql.js';
import { assertCompleteResolution } from '../src/resolve/expansion.js';
import { BomCycleError, normalizeBomError } from '../src/types.js';
import { newReachLine, reachChain, reachDiamonds, seedReachGraph } from './graph-test-utils.js';
import { expectReachMatches, readReachPairs, readReachRows } from './reach-test-utils.js';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 可达性规模和深度 [${backend}]`, () => {
    it('20串菱形物化1810对，双向查询仍按10000路径预算硬停', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const graph = reachDiamonds();
        const { ids } = await seedReachGraph(adapter, graph);
        expect(graph.items).toHaveLength(61);
        expect(graph.edges).toHaveLength(80);
        expect(await readReachPairs(adapter)).toHaveLength(1810);
        await expectReachMatches(adapter);
        const context = {
          bomType: 'ebom' as const,
          orgId: 'reach-scale',
          asOfDate: new Date('2026-01-01T00:00:00.000Z')
        };
        const options = { budgets: { depth: 50, expansions: 100_000, paths: 10_000 } };
        const down = await adapter.rxdb.bom.expandBom(context, { parentItemId: ids.get('root') }, options);
        const up = await adapter.rxdb.bom.whereUsed(context, { childItemId: ids.get('bottom-19')! }, options);
        for (const result of [down, up]) {
          expect(result.nodes).toHaveLength(10_000);
          expect(result.truncated).toEqual({ reason: 'paths' });
          expect(() => assertCompleteResolution(result)).toThrow(/paths/);
        }
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('索引已知可达时只取一个有界环见证，不枚举百万条菱形路径', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const { ids, revisions } = await seedReachGraph(adapter, reachDiamonds());
        const line = await newReachLine(adapter, revisions.get('bottom-19')!);
        const dialect = bomSqlDialectFor(backend);
        const data = [crypto.randomUUID(), line.id, ids.get('root'), '1', 'pcs', '2026-01-01T00:00:00.000Z'];
        const start = performance.now();
        const failure = await adapter
          .transaction(executor =>
            executor.query(
              `INSERT INTO ${dialect.table('bom_line_occurrence')} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "createdAt", "updatedAt")
            VALUES (${data.map((_, index) => dialect.placeholder(index)).join(', ')}, ${dialect.placeholder(data.length)}, ${dialect.placeholder(data.length + 1)})`,
              [...data, data[5], data[5]]
            )
          )
          .then(
            () => null,
            (error: unknown) => error
          );
        const elapsedMs = performance.now() - start;
        const normalized = normalizeBomError(failure);
        expect(normalized).toBeInstanceOf(BomCycleError);
        if (!(normalized instanceof BomCycleError)) throw new Error('没有取得有界环见证');
        expect(normalized.path).toHaveLength(41);
        expect(normalized.path[0]).toBe(ids.get('root'));
        expect(normalized.path.at(-1)).toBe(ids.get('bottom-19'));
        expect(elapsedMs).toBeLessThan(100);
        console.info(`reach点查和单见证 [${backend}] ${elapsedMs.toFixed(3)}ms`);
        await expectReachMatches(adapter);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('闭包未命中也不能绕过原有128层判定硬停，被拒后派生行不变', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const shape = reachChain(130);
        const { ids, revisions } = await seedReachGraph(adapter, { ...shape, items: [...shape.items, 'new-parent'] });
        const before = await readReachRows(adapter);
        const line = await newReachLine(adapter, revisions.get('new-parent')!);
        const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
          lineId: line.id,
          childItemId: ids.get('chain-0')!,
          qty: '1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
        });
        await expect(occurrence.save()).rejects.toMatchObject({ code: 'BOM_CYCLE', path: [] });
        expect(await readReachRows(adapter)).toEqual(before);
        await expectReachMatches(adapter);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);
  });
}
