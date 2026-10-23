import type { TransactionFun } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { bomSqlDialectFor, buildAlternativeHeadersSql } from '../resolve/bom-sql.js';
import { loadBomViewFixture } from '../testing/bom-view-fixture.js';
import { createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`重复物料的同快照子头读取 [${backend}]`, () => {
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
