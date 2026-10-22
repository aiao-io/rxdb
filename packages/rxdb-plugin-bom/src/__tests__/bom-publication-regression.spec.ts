import { uuid } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BomEcn,
  BomHistoryBatch,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomSubstituteGroup
} from '../entities.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory, type HistoryBatchInput, type HistoryOccurrenceInput } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`发布与历史批次闭环回归 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });
    afterAll(async () => {
      await disposeBomTestAdapter(adapter);
    });

    const item = async (): Promise<BomItem> => {
      const value = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: uuid() });
      await value.save();
      return value;
    };

    for (const effectiveFrom of [null, day('2020-01-01')]) {
      it(`released INSERT 仍校验生效日：${effectiveFrom?.toISOString() ?? '空'}`, async () => {
        const parent = await item();
        const revision = adapter.rxdb.entityManager.instantiate(BomItemRevision, {
          itemId: parent.id,
          revisionNo: uuid(),
          state: 'released',
          effectiveFrom
        });
        await expect(revision.save()).rejects.toThrow(/发布|追溯/);
      });
    }

    it('released INSERT 接受合法未来生效日', async () => {
      const parent = await item();
      const revision = adapter.rxdb.entityManager.instantiate(BomItemRevision, {
        itemId: parent.id,
        revisionNo: uuid(),
        state: 'released',
        effectiveFrom: day('2099-01-01')
      });
      await revision.save();
      expect(revision.state).toBe('released');
    });

    for (const transition of ['publish', 'reschedule', 'cancel'] as const) {
      it(`ECN ${transition} 不得顺带改号`, async () => {
        const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, {
          ecnNo: uuid(),
          effectiveDate: day('2099-01-01')
        });
        await ecn.save();
        const repository = adapter.rxdb.entityManager.getRepository(BomEcn);
        if (transition !== 'publish') await repository.update(ecn, { state: 'released' });
        const patch: Partial<BomEcn> =
          transition === 'reschedule' ?
            { state: 'released', effectiveDate: day('2099-02-01') }
          : { state: transition === 'publish' ? 'released' : 'cancelled' };
        await expect(repository.update(ecn, { ...patch, ecnNo: uuid() })).rejects.toThrow(/ecnNo/);
      });
    }

    const base = async (routing = false): Promise<{ headerId: string; leaf: BomItem }> => {
      const parent = await item();
      const leaf = await item();
      const headerId = uuid();
      await loadHistory(adapter, {
        batchNo: uuid(),
        revisions: [parent, leaf].map(value => ({
          itemId: value.id,
          revisionNo: 'A',
          effectiveFrom: day('2020-01-01')
        })),
        headers: [
          {
            id: headerId,
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'publication-regression',
            lines: [],
            ...(routing ? { routing: { workCenterCode: uuid(), operations: [{ seq: 10 }], allocations: [] } } : {})
          }
        ]
      });
      return { headerId, leaf };
    };

    const overlay = async (input: Partial<HistoryOccurrenceInput> = {}): Promise<HistoryBatchInput> => {
      const { headerId, leaf } = await base();
      const ecnId = uuid();
      return {
        batchNo: uuid(),
        revisions: [],
        headers: [],
        ecns: [{ id: ecnId, ecnNo: uuid(), state: 'released', effectiveDate: day('2021-01-01') }],
        headerOverlays: [
          {
            headerId,
            lines: [
              {
                lineNo: 10,
                ecnInId: ecnId,
                occurrences: [
                  {
                    childItemId: leaf.id,
                    qty: '2',
                    effectiveFrom: day('2021-01-01'),
                    ecnInId: ecnId,
                    ...input
                  }
                ]
              }
            ]
          }
        ]
      };
    };

    it('头发布不能用 NULL qty 绕过公式位号校验', async () => {
      const parent = await item();
      const leaf = await item();
      await expect(
        loadHistory(adapter, {
          batchNo: uuid(),
          revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'publication-regression',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    {
                      childItemId: leaf.id,
                      qtyFormula: '1+1',
                      formulaGrammarVersion: '1',
                      designatorManaged: true,
                      effectiveFrom: day('2020-01-01')
                    }
                  ]
                }
              ]
            }
          ]
        })
      ).rejects.toThrow(/位号/);
    });

    it('ECN 发布不能用 NULL qty 绕过公式位号校验', async () => {
      const { headerId, leaf } = await base();
      const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, { ecnNo: uuid(), effectiveDate: day('2099-01-01') });
      await ecn.save();
      const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId, lineNo: 10, ecnInId: ecn.id });
      await line.save();
      const occurrence = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, {
        lineId: line.id,
        childItemId: leaf.id,
        qtyFormula: '1+1',
        formulaGrammarVersion: '1',
        designatorManaged: true,
        effectiveFrom: ecn.effectiveDate,
        ecnInId: ecn.id
      });
      await occurrence.save();
      await expect(adapter.rxdb.entityManager.getRepository(BomEcn).update(ecn, { state: 'released' })).rejects.toThrow(
        /位号/
      );
    });

    it('历史覆盖补装在关闭批次时拒绝位号违约并整批回滚', async () => {
      const batch = await overlay({ designatorManaged: true });
      await expect(loadHistory(adapter, batch)).rejects.toThrow(/位号/);
      const dialect = bomSqlDialectFor(backend);
      const result = await adapter.rawQuery(
        `SELECT COUNT(*) FROM ${dialect.table('bom_history_batch')} WHERE "batchNo" = ${dialect.placeholder(0)}`,
        [batch.batchNo]
      );
      expect(Number(result.rows[0][0])).toBe(0);
    });

    it('历史批次关闭校验全部日期切片的阶梯重叠', async () => {
      const batch = await overlay({ tierGroupNo: 'tier', lotsizeFrom: '0', lotsizeTo: '10' });
      const lines = batch.headerOverlays![0].lines!;
      const first = lines[0];
      lines.push({
        ...first,
        lineNo: 20,
        occurrences: [{ ...first.occurrences[0], lotsizeFrom: '5', lotsizeTo: '15' }]
      });
      await expect(loadHistory(adapter, batch)).rejects.toThrow(/阶梯/);
    });

    it('历史批次关闭校验副产不得指向头父件', async () => {
      const batch = await overlay({ flowDirection: 'by_product' });
      const dialect = bomSqlDialectFor(backend);
      const rows = await adapter.rawQuery(
        `SELECT r."itemId" FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId" WHERE h."id" = ${dialect.placeholder(0)}`,
        [batch.headerOverlays![0].headerId]
      );
      batch.headerOverlays![0].lines![0].occurrences[0].childItemId = String(rows.rows[0][0]);
      await expect(loadHistory(adapter, batch)).rejects.toThrow(/by_product/);
    });

    it('历史补装联产输出不能绕过主产物份额校验', async () => {
      const batch = await overlay({ flowDirection: 'produce', qty: '1', jointCostShare: '0.5' });
      const occurrence = batch.headerOverlays![0].lines![0].occurrences[0];
      const dialect = bomSqlDialectFor(backend);
      const revisions = await adapter.rawQuery(
        `SELECT "id" FROM ${dialect.table('item_revision')} WHERE "itemId" = ${dialect.placeholder(0)}`,
        [occurrence.childItemId]
      );
      occurrence.childRevisionId = String(revisions.rows[0][0]);
      await expect(loadHistory(adapter, batch)).rejects.toThrow(/联产/);
    });

    it('连续合法历史批次正常关闭，未发布 ECN 的不完整草稿不干扰', async () => {
      const first = await overlay();
      await loadHistory(adapter, first);
      const headerId = first.headerOverlays![0].headerId;
      const leafId = first.headerOverlays![0].lines![0].occurrences[0].childItemId;
      const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, { ecnNo: uuid(), effectiveDate: day('2099-01-01') });
      await ecn.save();
      await adapter.rxdb.entityManager
        .instantiate(BomSubstituteGroup, {
          headerId,
          code: uuid(),
          strategy: 'proportional',
          ecnInId: ecn.id
        })
        .save();
      const line = adapter.rxdb.entityManager.instantiate(BomLine, { headerId, lineNo: 30, ecnInId: ecn.id });
      await line.save();
      await adapter.rxdb.entityManager
        .instantiate(BomLineOccurrence, {
          lineId: line.id,
          childItemId: leafId,
          qty: '2',
          designatorManaged: true,
          effectiveFrom: ecn.effectiveDate,
          ecnInId: ecn.id
        })
        .save();
      await expect(loadHistory(adapter, await overlay())).resolves.toBeUndefined();
    });

    it('批次关闭不采信草稿 ECN 对替代组成员的截止', async () => {
      const parent = await item();
      const primary = await item();
      const substitute = await item();
      const primaryId = uuid();
      await loadHistory(adapter, {
        batchNo: uuid(),
        revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: [
          {
            revisionIndex: 0,
            bomType: 'ebom',
            orgId: 'publication-regression',
            lines: [
              {
                lineNo: 10,
                occurrences: [{ id: primaryId, childItemId: primary.id, qty: '1', effectiveFrom: day('2020-01-01') }]
              },
              { lineNo: 20, occurrences: [{ childItemId: substitute.id, qty: '1', effectiveFrom: day('2020-01-01') }] }
            ],
            substituteGroups: [
              {
                code: uuid(),
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
      const ecn = adapter.rxdb.entityManager.instantiate(BomEcn, { ecnNo: uuid(), effectiveDate: day('2099-01-01') });
      await ecn.save();
      const target = adapter.rxdb.entityManager.instantiate(BomLineOccurrence, { id: primaryId });
      await adapter.rxdb.entityManager.getRepository(BomLineOccurrence).update(target, {
        ecnOutId: ecn.id,
        effectiveTo: ecn.effectiveDate
      });
      await expect(loadHistory(adapter, { batchNo: uuid(), revisions: [], headers: [] })).resolves.toBeUndefined();
    });

    for (const kind of ['split', 'substitute', 'empty-group', 'routing'] as const) {
      it(`直连历史批次关闭仍校验 ${kind}`, async () => {
        const { headerId, leaf } = await base(true);
        const batchNo = uuid();
        const invalid = adapter.transaction(async executor => {
          const construct = adapter.rxdb.entityManager.instantiate.bind(adapter.rxdb.entityManager);
          const batch = construct(BomHistoryBatch, { batchNo });
          await executor.getRepository(BomHistoryBatch).create(batch);
          const ecn = construct(BomEcn, { ecnNo: uuid(), effectiveDate: day('2021-01-01'), historyBatchNo: batchNo });
          await executor.getRepository(BomEcn).create(ecn);
          await executor.getRepository(BomEcn).update(ecn, { state: 'released' });
          const group = construct(BomSubstituteGroup, {
            headerId,
            code: uuid(),
            strategy: 'proportional',
            ecnInId: ecn.id
          });
          if (kind === 'substitute' || kind === 'empty-group')
            await executor.getRepository(BomSubstituteGroup).create(group);
          const line = construct(BomLine, { headerId, lineNo: 10, ecnInId: ecn.id });
          await executor.getRepository(BomLine).create(line);
          const occurrence = construct(BomLineOccurrence, {
            lineId: line.id,
            childItemId: leaf.id,
            qty: '1',
            effectiveFrom: ecn.effectiveDate,
            ecnInId: ecn.id,
            ...(kind === 'substitute' ?
              { substituteGroupId: group.id, substituteRole: 'primary', usageProbability: '0.5' }
            : {})
          });
          await executor.getRepository(BomLineOccurrence).create(occurrence);
          if (kind === 'split' || kind === 'routing')
            await executor.getRepository(BomLineOperationSplit).create(
              construct(BomLineOperationSplit, {
                occurrenceId: occurrence.id,
                operationSeq: kind === 'routing' ? 20 : 10,
                ratio: kind === 'routing' ? '1' : '0.5'
              })
            );
          await executor.getRepository(BomHistoryBatch).update(batch, { state: 'closed' });
        }, false);
        await expect(invalid).rejects.toThrow(/投料分摊|概率合计|替代组|路由工序/);
      });
    }
  });
}
