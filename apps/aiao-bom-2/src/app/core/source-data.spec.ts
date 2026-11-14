import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BomIndex } from './query';
import { compareSnapshots, createSnapshot } from './snapshot';
import { DEFAULT_QUERY, type BomDataset } from './types';
const data = JSON.parse(readFileSync('public/data/windrose.json', 'utf8')) as BomDataset;
describe('固定来源快照的语义', () => {
  it('完整系统分类、采购和 CAD 来源均可保存为版本快照，不要求缺量已确认', () => {
    for (const structure of ['catalog', 'purchase', 'cad'] as const) {
      const snapshot = createSnapshot({
        id: structure,
        datasetId: data.id,
        name: structure,
        source: 'dataset',
        structure,
        version: data.version,
        evaluationDate: data.observedOn,
        observedOn: data.observedOn,
        savedAt: '2026-11-14T00:00:00.000Z',
        nodes: data.structures[structure]
      });
      expect(snapshot.nodes).toHaveLength(data.structures[structure].length);
      expect(compareSnapshots(snapshot, snapshot).changes).toHaveLength(0);
    }
  });
  it('完整主清单与独立采购 / CAD 身份不相互冒充', () => {
    const index = new BomIndex(data, 'catalog');
    const result = index.query(DEFAULT_QUERY);
    expect(result.rows.filter(row => row.kind !== 'system')).toHaveLength(1424);
    expect(data.parts.filter(p => p.inBom && (p.assets.length || p.sceneNodes.length))).toHaveLength(1170);
    expect(data.structures.purchase).toHaveLength(813);
    expect(data.structures.cad).toHaveLength(8791);
    expect(new Set(data.structures.purchase.map(row => row.partId)).size).toBe(607);
    expect(data.structures.purchase.every(row => row.quantity === null)).toBe(true);
    expect(data.structures.catalog.some(row => row.partId.startsWith('Q'))).toBe(true);
  });
  it('歧义数量保留原文，筛选不会产生默认数量', () => {
    const index = new BomIndex(data, 'catalog');
    for (const id of ['1319317', '3602561']) {
      const p = data.parts.find(row => row.id === id)!;
      expect(p.quantity).toBeNull();
      expect(p.quantityState).toBe('ambiguous');
      expect(p.rawQuantity).toContain(',');
    }
    const result = index.query({ ...DEFAULT_QUERY, mode: 'flat', issue: 'quantity' });
    expect(result.rows).toHaveLength(505);
    expect(result.rows.every(row => row.quantity === null)).toBe(true);
  });
  it('市场、模型、冲突、补充目录和排序分别作用于来源记录', () => {
    const index = new BomIndex(data, 'catalog');
    const models = index.query({ ...DEFAULT_QUERY, only3d: true, mode: 'flat' });
    expect(models.rows).toHaveLength(1170);
    const conflicts = index.query({ ...DEFAULT_QUERY, issue: 'conflict', mode: 'flat' });
    expect(conflicts.rows).toHaveLength(99);
    const catalog = index.query({
      ...DEFAULT_QUERY,
      mode: 'flat',
      includeCatalog: true,
      market: 'CN',
      sort: 'name',
      descending: true
    });
    expect(catalog.rows.length).toBeGreaterThan(1424);
    expect(catalog.rows.every(row => row.markets.includes('CN') || !row.markets)).toBe(true);
    const unmodeled = index.query({ ...DEFAULT_QUERY, mode: 'flat', issue: 'unmapped', sort: 'partId' });
    expect(unmodeled.rows).toHaveLength(254);
    expect(new BomIndex(data, 'cad').query({ ...DEFAULT_QUERY, structure: 'cad', market: 'US' }).rows).toHaveLength(0);
  });
});
