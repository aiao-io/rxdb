import type { TransactionFun } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { bomSqlDialectFor, buildAlternativeHeadersSql, buildHeaderOccurrencesSql } from '../resolve/bom-sql.js';
import { loadBomViewFixture } from '../testing/bom-view-fixture.js';
import { readBomViewSnapshot } from '../view.js';
import { createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`重复物料的同快照子头读取 [${backend}]`, () => {
    it('活视图的结构与数量共享同一快照读取，下一次快照读取更新后的物料与计划量', async () => {
      const adapter = await createBomTestAdapter(backend);
      const transaction = adapter.transaction;
      try {
        const fixture = await loadBomViewFixture(adapter.rxdb);
        const input = fixture.inputFor('performance');
        const reads: Map<string, number>[] = [];
        adapter.transaction = async <Fun extends TransactionFun>(
          fun: Fun,
          transactionLog?: boolean
        ): Promise<Awaited<ReturnType<Fun>>> => {
          const counts = new Map<string, number>();
          reads.push(counts);
          return transaction.call(
            adapter,
            async executor => {
              const query = executor.query;
              executor.query = (sql, params) => {
                const key = JSON.stringify([sql, params ?? []]);
                counts.set(key, (counts.get(key) ?? 0) + 1);
                return query.call(executor, sql, params);
              };
              try {
                return await fun(executor);
              } finally {
                executor.query = query;
              }
            },
            transactionLog
          ) as Promise<Awaited<ReturnType<Fun>>>;
        };
        const first = await readBomViewSnapshot(adapter.rxdb, input);
        const firstReadCounts = reads.flatMap(counts => [...counts.values()]);
        adapter.transaction = transaction;
        const item = await firstValueFrom(
          adapter.rxdb.entityManager.getRepository(BomItem).get(fixture.ids.items.resistor)
        );
        expect(item).toBeDefined();
        item!.description = '新快照中的电阻';
        await item!.save();
        const second = await readBomViewSnapshot(adapter.rxdb, {
          ...input,
          plannedQty: { value: '2', uom: 'pcs' }
        });
        expect(first.expansion.nodes).toHaveLength(100);
        expect(first.explosion?.requirementLines).toHaveLength(99);
        expect(first.explosion?.requirementLines.every(line => line.qty === '1')).toBe(true);
        expect(first.quantityError).toBeNull();
        expect(second.explosion?.requirementLines).toHaveLength(99);
        expect(second.explosion?.requirementLines.every(line => line.qty === '2')).toBe(true);
        expect(second.items.find(value => value.id === item!.id)?.description).toBe('新快照中的电阻');
        expect(first.items.find(value => value.id === item!.id)?.description).not.toBe('新快照中的电阻');
        expect(second.quantityError).toBeNull();
        expect(firstReadCounts.length).toBeGreaterThan(0);
        expect(Math.max(...firstReadCounts)).toBe(1);
      } finally {
        adapter.transaction = transaction;
        await disposeBomTestAdapter(adapter);
      }
    });

    it('成本卷算同一事务内每条相同查询只执行一次，下一次计算重新读取', async () => {
      const adapter = await createBomTestAdapter(backend);
      const transaction = adapter.transaction;
      try {
        const fixture = await loadBomViewFixture(adapter.rxdb);
        const input = fixture.inputFor('performance');
        const reads: Map<string, number>[] = [];
        adapter.transaction = async <Fun extends TransactionFun>(
          fun: Fun,
          transactionLog?: boolean
        ): Promise<Awaited<ReturnType<Fun>>> => {
          const counts = new Map<string, number>();
          reads.push(counts);
          return transaction.call(
            adapter,
            async executor => {
              const query = executor.query;
              executor.query = (sql, params) => {
                const key = JSON.stringify([sql, params ?? []]);
                counts.set(key, (counts.get(key) ?? 0) + 1);
                return query.call(executor, sql, params);
              };
              try {
                return await fun(executor);
              } finally {
                executor.query = query;
              }
            },
            transactionLog
          ) as Promise<Awaited<ReturnType<Fun>>>;
        };
        const context = { ...input.context, currency: 'CNY', rateDate: input.context.asOfDate };
        const first = await rollupCost(adapter, context, input.target);
        expect(first.root.material).toHaveLength(99);
        expect(first.root.batchCost).toBe('99');
        const second = await rollupCost(adapter, context, input.target, { value: '2', uom: 'pcs' });
        expect(second.root.batchCost).toBe('198');
        expect(reads).toHaveLength(2);
        for (const counts of reads) {
          expect(counts.size).toBeGreaterThan(0);
          expect(Math.max(...counts.values())).toBe(1);
        }
      } finally {
        adapter.transaction = transaction;
        await disposeBomTestAdapter(adapter);
      }
    });

    it('99条真实边仅读取一次相同修订的子头，下一次事务重新读取且数量不合并', async () => {
      const adapter = await createBomTestAdapter(backend);
      const transaction = adapter.transaction;
      try {
        const fixture = await loadBomViewFixture(adapter.rxdb);
        const input = fixture.inputFor('performance');
        const expected = buildAlternativeHeadersSql(bomSqlDialectFor(backend), {
          parentRevisionId: fixture.ids.revisions.resistor,
          bomType: input.context.bomType,
          orgId: input.context.orgId
        });
        let childHeaderReads = 0;
        adapter.transaction = async <Fun extends TransactionFun>(
          fun: Fun,
          transactionLog?: boolean
        ): Promise<Awaited<ReturnType<Fun>>> =>
          transaction.call(
            adapter,
            async executor => {
              const query = executor.query;
              executor.query = (sql, params) => {
                if (
                  ['routing_operation', 'routing', 'bom_line_operation_split'].some(table =>
                    sql.includes(`FROM ${bomSqlDialectFor(backend).table(table)}`)
                  )
                )
                  expect(sql).toContain('WHERE');
                if (sql === expected.sql && params?.[0] === fixture.ids.revisions.resistor) childHeaderReads += 1;
                return query.call(executor, sql, params);
              };
              try {
                return await fun(executor);
              } finally {
                executor.query = query;
              }
            },
            transactionLog
          ) as Promise<Awaited<ReturnType<Fun>>>;
        const first = await adapter.rxdb.bom.explodeBom(input.context, input.target, { plannedQty: input.plannedQty });
        expect(first.requirementLines).toHaveLength(99);
        expect(new Set(first.requirementLines.map(line => JSON.stringify(line.path))).size).toBe(99);
        expect(childHeaderReads).toBe(1);
        const second = await adapter.rxdb.bom.explodeBom(input.context, input.target, {
          plannedQty: { value: '2', uom: 'pcs' }
        });
        expect(childHeaderReads).toBe(2);
        expect(second.requirementLines.map(line => line.qty)).toEqual(
          first.requirementLines.map(line => String(Number(line.qty) * 2))
        );
      } finally {
        adapter.transaction = transaction;
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}

interface RevisionLookupPlan {
  'Node Type': string;
  'Subplan Name'?: string;
  'Actual Loops': number;
  Plans?: RevisionLookupPlan[];
}

const revisionLookupCount = (plan: RevisionLookupPlan): number =>
  (plan['Node Type'] === 'Limit' && plan['Subplan Name'] !== undefined ? plan['Actual Loops'] : 0) +
  (plan.Plans ?? []).reduce((total, child) => total + revisionLookupCount(child), 0);

describe('数量展开的实际子修订读取', () => {
  it('99条未固定修订发生项保留独立结果，每条最多查找一次最新子修订', async () => {
    const adapter = await createBomTestAdapter('pglite');
    try {
      const fixture = await loadBomViewFixture(adapter.rxdb);
      const input = fixture.inputFor('performance');
      const built = buildHeaderOccurrencesSql(bomSqlDialectFor('pglite'), {
        ...input.context,
        headerIds: [fixture.ids.headers.performance]
      });
      await adapter.transaction(async executor => {
        const result = await executor.query(built.sql, built.params);
        const revisionIndex = result.columns.indexOf('resolvedChildRevisionId');
        const occurrenceIndex = result.columns.indexOf('occurrenceId');
        expect(result.rows).toHaveLength(99);
        expect(new Set(result.rows.map(row => row[occurrenceIndex])).size).toBe(99);
        expect(result.rows.map(row => row[revisionIndex])).toEqual(Array(99).fill(fixture.ids.revisions.resistor));
        const explained = await executor.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${built.sql}`, built.params);
        const plans = explained.rows[0][0] as { Plan: RevisionLookupPlan }[];
        const lookups = revisionLookupCount(plans[0].Plan);
        expect(lookups).toBeGreaterThan(0);
        expect(lookups).toBeLessThanOrEqual(result.rows.length);
      }, false);
    } finally {
      await disposeBomTestAdapter(adapter);
    }
  });
});
