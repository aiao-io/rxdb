import { uuid, type TransactionFun } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomHistoryBatch, BomItem, BomMapScope } from '../entities.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { BomMapError, confirmMapping, saveMapping } from '../resolve/bom-map.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory, type HistoryBatchInput } from '../resolve/history-loader.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const context: ResolutionContext = { bomType: 'ebom', orgId: 'org-x', asOfDate: day('2026-01-01') };

for (const backend of ['wa-sqlite', 'pglite'] as BomTestBackend[]) {
  describe(`历史补装与映射确认回归 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    const dialect = bomSqlDialectFor(backend);

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter);
    });

    const item = async (): Promise<BomItem> => {
      const entity = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: uuid() });
      await entity.save();
      return entity;
    };

    const query = async (sql: string, params: unknown[] = []): Promise<unknown[][]> =>
      (await adapter.rawQuery(sql, params)).rows;

    const mapping = async (relation: 'one_to_one' | 'removed' | 'added' = 'one_to_one') => {
      const root = await item();
      const leaf = await item();
      const ebom = uuid();
      const mbom = uuid();
      const sourceLineId = uuid();
      const targetLineId = uuid();
      const sourceOccurrenceId = uuid();
      const targetOccurrenceId = uuid();
      const expiredTargetId = uuid();
      const otherTargetId = uuid();
      await loadHistory(adapter, {
        batchNo: uuid(),
        revisions: [root, leaf].map(value => ({ itemId: value.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') })),
        headers: [
          {
            id: ebom,
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            lines: [
              {
                id: sourceLineId,
                lineNo: 10,
                occurrences: [
                  { id: sourceOccurrenceId, childItemId: leaf.id, qty: '1', effectiveFrom: day('2020-01-01') }
                ]
              }
            ]
          },
          {
            id: mbom,
            revisionIndex: 0,
            bomType: 'mbom',
            orgId: 'org-x',
            lines: [
              {
                id: targetLineId,
                lineNo: 10,
                occurrences: [
                  {
                    id: expiredTargetId,
                    childItemId: leaf.id,
                    qty: '1',
                    effectiveFrom: day('2020-01-01'),
                    effectiveTo: day('2025-01-01')
                  },
                  { id: targetOccurrenceId, childItemId: leaf.id, qty: '1', effectiveFrom: day('2025-01-01') }
                ]
              },
              {
                lineNo: 20,
                occurrences: [{ id: otherTargetId, childItemId: leaf.id, qty: '1', effectiveFrom: day('2020-01-01') }]
              }
            ]
          }
        ]
      });
      const scope = adapter.rxdb.entityManager.instantiate(BomMapScope, {
        orgId: 'org-x',
        ebomRootHeaderId: ebom,
        mbomRootHeaderId: mbom
      });
      await scope.save();
      const saved = await saveMapping(adapter, {
        scopeId: scope.id,
        relation,
        sourceLineId: relation === 'added' ? null : sourceLineId,
        targetLineId: relation === 'removed' ? null : targetLineId
      });
      return { ...saved, sourceOccurrenceId, targetOccurrenceId, expiredTargetId, otherTargetId };
    };

    const baseline = (mapId: string): Promise<unknown[][]> =>
      query(
        `SELECT "targetOccurrenceId", "baselineSteps" FROM ${dialect.table('bom_map')} WHERE "id" = ${dialect.placeholder(0)}`,
        [mapId]
      );

    it.each(['missing', 'source', 'wrong-line', 'expired'] as const)('拒绝 %s 目标且保持已确认基线', async kind => {
      const saved = await mapping();
      await confirmMapping(adapter, saved.mapId, saved.targetOccurrenceId, context);
      const before = await baseline(saved.mapId);
      const targets = {
        missing: uuid(),
        source: saved.sourceOccurrenceId,
        'wrong-line': saved.otherTargetId,
        expired: saved.expiredTargetId
      };
      await expect(confirmMapping(adapter, saved.mapId, targets[kind], context)).rejects.toThrow(BomMapError);
      expect(await baseline(saved.mapId)).toEqual(before);
    });

    it('有效目标确认在单个事务内完成全部读取与写入', async () => {
      const saved = await mapping();
      let transactions = 0;
      let externalQueries = 0;
      const scoped: BomLocalAdapter = {
        name: adapter.name,
        rxdb: adapter.rxdb,
        rawQuery: async (sql, params) => {
          externalQueries += 1;
          return adapter.rawQuery(sql, params);
        },
        transaction: <T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>> => {
          transactions += 1;
          return adapter.transaction(fun, transactionLog);
        }
      };
      await confirmMapping(scoped, saved.mapId, saved.targetOccurrenceId, context);
      expect(transactions).toBe(1);
      expect(externalQueries).toBe(0);
      const stored = (await baseline(saved.mapId))[0];
      expect(stored[0]).toBe(saved.targetOccurrenceId);
      expect(JSON.parse(String(stored[1]))).toEqual([
        expect.objectContaining({ occurrenceId: saved.sourceOccurrenceId })
      ]);
    });

    it('removed 接受空目标并拒绝任意发生项目标', async () => {
      const saved = await mapping('removed');
      await confirmMapping(adapter, saved.mapId, null, context);
      expect((await baseline(saved.mapId))[0][0]).toBeNull();
      await expect(confirmMapping(adapter, saved.mapId, saved.targetOccurrenceId, context)).rejects.toThrow(
        BomMapError
      );
    });

    it('added 的非空目标也必须为当前发生项，保留空目标接口行为', async () => {
      const saved = await mapping('added');
      await confirmMapping(adapter, saved.mapId, null, context);
      await expect(confirmMapping(adapter, saved.mapId, saved.expiredTargetId, context)).rejects.toThrow(BomMapError);
      await confirmMapping(adapter, saved.mapId, saved.targetOccurrenceId, context);
      expect((await baseline(saved.mapId))[0]).toEqual([saved.targetOccurrenceId, '[]']);
    });

    const overlay = async (
      mode: 'line' | 'occurrence'
    ): Promise<{ batch: HistoryBatchInput; occurrenceId: string; designatorIds: string[] }> => {
      const root = await item();
      const leaf = await item();
      const headerId = uuid();
      const lineId = uuid();
      await loadHistory(adapter, {
        batchNo: uuid(),
        revisions: [root, leaf].map(value => ({ itemId: value.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') })),
        headers: [
          {
            id: headerId,
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'org-x',
            lines: [{ id: lineId, lineNo: 10, occurrences: [] }]
          }
        ]
      });
      const ecnId = uuid();
      const occurrenceId = uuid();
      const designatorIds = [uuid(), uuid()];
      const occurrences = [
        {
          id: occurrenceId,
          childItemId: leaf.id,
          qty: '2',
          effectiveFrom: day('2021-01-01'),
          ecnInId: ecnId,
          createdAt: day('2021-01-02'),
          updatedAt: day('2021-01-03'),
          designatorManaged: true,
          designators: designatorIds.map((id, index) => ({ id, designator: `R${index + 1}` }))
        }
      ];
      return {
        occurrenceId,
        designatorIds,
        batch: {
          batchNo: uuid(),
          revisions: [],
          headers: [],
          ecns: [{ id: ecnId, ecnNo: uuid(), state: 'released', effectiveDate: day('2021-01-01') }],
          headerOverlays: [
            {
              headerId,
              ...(mode === 'line' ?
                { lines: [{ lineNo: 20, ecnInId: ecnId, occurrences }] }
              : { occurrenceAdds: [{ lineId, occurrences }] })
            }
          ]
        }
      };
    };

    it.each(['line', 'occurrence'] as const)('%s 补装完整保存位号及确定性 ID / 审计时间戳', async mode => {
      const input = await overlay(mode);
      await loadHistory(adapter, input.batch);
      const stored = await query(
        `SELECT "id", "designator", "createdAt", "updatedAt" FROM ${dialect.table('bom_line_designator')} WHERE "occurrenceId" = ${dialect.placeholder(0)} ORDER BY "designator"`,
        [input.occurrenceId]
      );
      expect(stored.map(row => row.slice(0, 2))).toEqual(input.designatorIds.map((id, index) => [id, `R${index + 1}`]));
      expect(stored.map(row => row.slice(2).map(value => new Date(String(value)).toISOString()))).toEqual([
        ['2021-01-02T00:00:00.000Z', '2021-01-03T00:00:00.000Z'],
        ['2021-01-02T00:00:00.000Z', '2021-01-03T00:00:00.000Z']
      ]);
    });

    it('位号子表写入失败时整批补装回滚', async () => {
      const input = await overlay('line');
      const occurrence = input.batch.headerOverlays?.[0].lines?.[0].occurrences[0];
      if (!occurrence?.designators) throw new Error('测试夹具缺少位号');
      occurrence.designators[1].designator = occurrence.designators[0].designator;
      await expect(loadHistory(adapter, input.batch)).rejects.toThrow();
      expect(
        await query(`SELECT "id" FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`, [
          input.occurrenceId
        ])
      ).toEqual([]);
      expect(
        await query(
          `SELECT "id" FROM ${dialect.table('bom_history_batch')} WHERE "batchNo" = ${dialect.placeholder(0)}`,
          [input.batch.batchNo]
        )
      ).toEqual([]);
    });

    it.each(['line', 'occurrence', 'occurrence-out'] as const)(
      '%s 补装不得借用另一开启历史批次的 ECN，拒绝后整批回滚',
      async mode => {
        const input = await overlay(mode === 'line' ? 'line' : 'occurrence');
        const foreignBatch = adapter.rxdb.entityManager.instantiate(BomHistoryBatch, { batchNo: uuid() });
        const foreignEcn = adapter.rxdb.entityManager.instantiate(BomEcn, {
          ecnNo: uuid(),
          effectiveDate: day('2022-01-01'),
          historyBatchNo: foreignBatch.batchNo
        });
        await adapter.transaction(async executor => {
          await executor.getRepository(BomHistoryBatch).create(foreignBatch);
          await executor.getRepository(BomEcn).create(foreignEcn);
          await executor.getRepository(BomEcn).update(foreignEcn, { state: 'released' });
        }, false);
        const patch = input.batch.headerOverlays?.[0];
        const line = patch?.lines?.[0];
        const occurrence = (line?.occurrences ?? patch?.occurrenceAdds?.[0].occurrences)?.[0];
        if (!occurrence) throw new Error('测试夹具缺少发生项');
        if (mode === 'occurrence-out') {
          occurrence.ecnOutId = foreignEcn.id;
          occurrence.effectiveTo = foreignEcn.effectiveDate;
        } else {
          occurrence.ecnInId = foreignEcn.id;
          occurrence.effectiveFrom = foreignEcn.effectiveDate;
        }
        if (line) line.ecnInId = foreignEcn.id;

        await expect(loadHistory(adapter, input.batch)).rejects.toThrow(/ECN 未在本批装载/);
        expect(
          await query(
            `SELECT "id" FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`,
            [input.occurrenceId]
          )
        ).toEqual([]);
        expect(
          await query(
            `SELECT "id" FROM ${dialect.table('bom_history_batch')} WHERE "batchNo" = ${dialect.placeholder(0)}`,
            [input.batch.batchNo]
          )
        ).toEqual([]);
        expect(
          await query(`SELECT "id" FROM ${dialect.table('ecn')} WHERE "historyBatchNo" = ${dialect.placeholder(0)}`, [
            input.batch.batchNo
          ])
        ).toEqual([]);
        expect(
          await query(
            `SELECT "state", "historyBatchNo" FROM ${dialect.table('ecn')} WHERE "id" = ${dialect.placeholder(0)}`,
            [foreignEcn.id]
          )
        ).toEqual([['released', foreignBatch.batchNo]]);
        await adapter.rxdb.entityManager.getRepository(BomHistoryBatch).update(foreignBatch, { state: 'closed' });
      }
    );

    it('草稿头的无 ECN 补装保持合法', async () => {
      const root = await item();
      const leaf = await item();
      const revisionId = uuid();
      await loadHistory(adapter, {
        batchNo: uuid(),
        revisions: [{ id: revisionId, itemId: root.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
        parentRevisionId: revisionId,
        bomType: 'ebom',
        orgId: 'org-x'
      });
      await header.save();
      const occurrenceId = uuid();
      await loadHistory(adapter, {
        batchNo: uuid(),
        revisions: [],
        headers: [],
        headerOverlays: [
          {
            headerId: header.id,
            lines: [
              {
                lineNo: 10,
                occurrences: [{ id: occurrenceId, childItemId: leaf.id, qty: '1', effectiveFrom: day('2020-01-01') }]
              }
            ]
          }
        ]
      });
      expect(
        await query(
          `SELECT "ecnInId" FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`,
          [occurrenceId]
        )
      ).toEqual([[null]]);
    });
  });
}
