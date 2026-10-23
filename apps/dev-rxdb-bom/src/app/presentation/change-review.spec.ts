import type { RequirementLine } from '@aiao/rxdb-plugin-bom';
import { describe, expect, it } from 'vitest';
import { materialChanges } from './change-review';

const line = (itemId: string, qty: string, revisionId = 'A', uom = 'pcs', path = [itemId]): RequirementLine => ({
  itemId,
  qty,
  revisionId,
  uom,
  path,
  steps: {
    planned: { value: qty, uom },
    assemblyScrapped: { value: qty, uom },
    gross: { value: qty, uom },
    componentScrapped: { value: qty, uom },
    operationScrapped: null,
    converted: { value: qty, uom },
    phantom: { value: false, source: 'revision', revisionId }
  }
});

describe('改版备料对比', () => {
  it('按物料和库存单位归集重复路径，保留每条来源并精确计算大数差额', () => {
    const before = [line('bolt', '9007199254740993', 'A', 'pcs', ['left']), line('bolt', '0.1', 'A', 'pcs', ['right'])];
    const after = [line('bolt', '9007199254740993.3', 'A', 'pcs', ['left'])];
    const changes = materialChanges(before, after);

    expect(changes).toEqual([
      expect.objectContaining({
        itemId: 'bolt',
        uom: 'pcs',
        beforeQty: '9007199254740993.1',
        afterQty: '9007199254740993.3',
        delta: '0.2',
        kind: 'changed',
        beforeLines: before,
        afterLines: after
      })
    ]);
  });

  it('数量没变但修订集合变化，仍标记为改版', () => {
    expect(materialChanges([line('battery', '10', 'A')], [line('battery', '10', 'B')])).toEqual([
      expect.objectContaining({ kind: 'changed', delta: '0', beforeQty: '10', afterQty: '10' })
    ]);
    expect(
      materialChanges([line('battery', '5', 'A'), line('battery', '5', 'B')], [line('battery', '10', 'B')])
    ).toHaveLength(1);
  });

  it('库存单位不同不能混加，新增和移除分别给出正负差额', () => {
    expect(materialChanges([line('wire', '10', 'A', 'm')], [line('wire', '2', 'A', 'box')])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'wire', uom: 'm', kind: 'removed', delta: '-10', afterLines: [] }),
        expect.objectContaining({ itemId: 'wire', uom: 'box', kind: 'added', delta: '2', beforeLines: [] })
      ])
    );
  });

  it('只有路径换位但数量与修订集合相同，不制造备料差异', () => {
    expect(
      materialChanges([line('bolt', '10', 'A', 'pcs', ['one'])], [line('bolt', '10', 'A', 'pcs', ['two'])])
    ).toEqual([]);
  });
});
