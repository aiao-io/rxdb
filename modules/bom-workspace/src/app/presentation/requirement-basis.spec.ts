import type { RequirementLine } from '@aiao/rxdb-plugin-bom';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { loadRequirementBasis, type RequirementBasisAdapter } from './requirement-basis';

const demand: RequirementLine = {
  path: ['parent', "occ'42"],
  itemId: 'board',
  revisionId: 'board-a',
  qty: '99',
  uom: 'pcs',
  steps: {
    planned: { value: '10', uom: 'set' },
    assemblyScrapped: { value: '10.1', uom: 'set' },
    gross: { value: '15.15', uom: 'box' },
    componentScrapped: { value: '17.25', uom: 'box' },
    operationScrapped: null,
    converted: { value: '99', uom: 'pcs' },
    phantom: { value: false, source: 'revision', revisionId: 'board-a' }
  }
};

const source = {
  headerId: 'header-17',
  occurrenceId: "occ'42",
  childItemId: 'board',
  revisionId: 'board-a',
  baseQty: '2',
  baseUom: 'set',
  assemblyScrap: '0.01',
  assemblyScrapConvention: 'additive',
  qty: '3',
  qtyFormula: null,
  isFixedQty: 0,
  componentScrap: '0.02',
  componentScrapConvention: 'yield',
  componentScrapFixed: '0.5',
  occurrenceUom: 'box',
  occurrenceUomConversion: '12',
  itemUomConversion: null,
  stockUom: 'pcs',
  uomDecimals: 3,
  routingId: null,
  operationSeq: null
};

const rowsOf = (record: Record<string, unknown>) => ({ columns: Object.keys(record), rows: [Object.values(record)] });

type BasisQuery = (sql: string, params?: readonly unknown[]) => Promise<{ columns: string[]; rows: unknown[][] }>;

const adapterFor = (query: Mock<BasisQuery>): RequirementBasisAdapter => ({
  transaction: async read => read({ query })
});

describe('需求计算依据的只读快照', () => {
  it('一个不记事务日志的读事务读取真实原系数，标识只通过参数传入', async () => {
    const query = vi.fn<BasisQuery>().mockResolvedValue(rowsOf(source));
    const adapter = adapterFor(query);
    const transaction = vi.spyOn(adapter, 'transaction');

    const basis = await loadRequirementBasis(adapter, demand);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toBe(false);
    expect(basis).toMatchObject({
      headerId: 'header-17',
      occurrenceId: "occ'42",
      baseQty: '2',
      qty: '3',
      occurrenceUomConversion: '12',
      uomDecimals: 3
    });
    expect(basis.isFixedQty).toBe(false);
    expect(basis.operations).toEqual([]);
    expect(query.mock.calls[0][0]).not.toContain("occ'42");
    expect(query.mock.calls[0][1]).toContain("occ'42");
    expect(query.mock.calls[0][1]).toContain('board');
  });

  it('需要工序时同一事务读取实际工序损耗，不从中间量反推系数', async () => {
    const query = vi
      .fn<BasisQuery>()
      .mockResolvedValueOnce(rowsOf({ ...source, routingId: 'route-7', operationSeq: 10 }))
      .mockResolvedValueOnce({
        columns: ['operationSeq', 'scrap', 'scrapConvention', 'ratio'],
        rows: [
          [10, '0.03', 'yield', null],
          [20, '0.01', 'additive', null]
        ]
      });
    const adapter = adapterFor(query);
    const transaction = vi.spyOn(adapter, 'transaction');
    const basis = await loadRequirementBasis(adapter, {
      ...demand,
      steps: { ...demand.steps, operationScrapped: { value: '18.5', uom: 'box' } }
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(basis.operations).toEqual([
      { operationSeq: 10, scrap: '0.03', scrapConvention: 'yield' },
      { operationSeq: 20, scrap: '0.01', scrapConvention: 'additive' }
    ]);
    expect(query.mock.calls[1][1]).toContain('route-7');
  });

  it('发生项已消失或物料不匹配时拒绝显示另一条记录的依据', async () => {
    const missing = vi.fn<BasisQuery>().mockResolvedValue({ columns: [], rows: [] });
    await expect(loadRequirementBasis(adapterFor(missing), demand)).rejects.toThrow('计算依据不存在');
    const wrongItem = vi.fn<BasisQuery>().mockResolvedValue(rowsOf({ ...source, childItemId: 'battery' }));
    await expect(loadRequirementBasis(adapterFor(wrongItem), demand)).rejects.toThrow('计算依据与所选需求不一致');
  });

  it('同一次发生项读取保留实际命中的阶梯组与左闭右开批量区间', async () => {
    const query = vi.fn<BasisQuery>().mockResolvedValue(
      rowsOf({
        ...source,
        tierGroupNo: 'batch-A',
        lotsizeFrom: '10',
        lotsizeTo: '15'
      })
    );

    const basis = await loadRequirementBasis(adapterFor(query), demand);

    expect(basis).toMatchObject({ tierGroupNo: 'batch-A', lotsizeFrom: '10', lotsizeTo: '15' });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
