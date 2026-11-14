import { describe, expect, it } from 'vitest';
import { BomIndex } from './query';
import { makeStressDataset } from './stress-data';
import { DEFAULT_QUERY } from './types';

describe('BOM 按发生位置查询', () => {
  it('同物料重复使用保留独立行，搜索保留祖先', () => {
    const data = makeStressDataset(100, 'balanced');
    const target = data.structures.catalog[99];
    const index = new BomIndex(data, 'catalog');
    const result = index.query({ ...DEFAULT_QUERY, search: target.key });
    expect(result.rows.some(row => row.key === target.key)).toBe(true);
    expect(result.roots.length).toBe(1);
    expect(result.rows.length).toBeLessThan(15);
    expect(new Set(data.structures.catalog.map(n => n.key)).size).toBe(100);
  });
  it('进入分支后限制平铺范围，返回根恢复全集', () => {
    const data = makeStressDataset(200, 'balanced');
    const index = new BomIndex(data, 'catalog');
    const scope = data.structures.catalog[1].key;
    const scoped = index.query({ ...DEFAULT_QUERY, scope, mode: 'flat' });
    expect(scoped.rows.length).toBeLessThan(200);
    expect(scoped.rows.every(row => index.ancestors(row.key).some(n => n.key === scope) || row.key === scope)).toBe(
      true
    );
    expect(index.query({ ...DEFAULT_QUERY, mode: 'flat' }).rows).toHaveLength(200);
  });
  it('树排序保持父子关系，按用量比较十进制数值', () => {
    const data = makeStressDataset(10, 'wide');
    data.structures.catalog[1].quantity = '10';
    data.structures.catalog[2].quantity = '2';
    const index = new BomIndex(data, 'catalog');
    const result = index.query({ ...DEFAULT_QUERY, sort: 'quantity' });
    const children = result.byParent.get(data.structures.catalog[0].key)!;
    expect(children.findIndex(r => r.quantity === '2')).toBeLessThan(children.findIndex(r => r.quantity === '10'));
    expect(children.every(r => r.parentKey === data.structures.catalog[0].key)).toBe(true);
  });
  it('未知范围明确报错，不返回全车结果', () => {
    const index = new BomIndex(makeStressDataset(20), 'catalog');
    expect(() => index.query({ ...DEFAULT_QUERY, scope: 'missing' })).toThrow('范围');
  });
  it('50,000 个发生项查询与末项定位保持完整', () => {
    const data = makeStressDataset(50000);
    const index = new BomIndex(data, 'catalog');
    const result = index.query({ ...DEFAULT_QUERY, mode: 'flat' });
    expect(result.rows).toHaveLength(50000);
    expect(result.truncated).toBe(false);
    expect(index.ancestors(result.rows[49999].key).length).toBeGreaterThan(0);
  });
  it('汇总保留成员及数量未知状态，不合并不同单位', () => {
    const data = makeStressDataset(20, 'wide');
    data.structures.catalog[2].partId = data.structures.catalog[1].partId;
    data.structures.catalog[2].compId = data.structures.catalog[1].compId;
    data.structures.catalog[2].quantity = null;
    data.structures.catalog[2].quantityState = 'missing';
    const result = new BomIndex(data, 'catalog').query({ ...DEFAULT_QUERY, mode: 'summary' });
    const row = result.rows.find(r => r.partId === data.structures.catalog[1].partId)!;
    expect(row.count).toBe(2);
    expect(row.quantity).toBeNull();
    expect(row.members).toHaveLength(2);
  });
});

describe('查询预算与范围边界', () => {
  it('在所选范围搜索时不会把上层父项重新混入结果', () => {
    const index = new BomIndex(makeStressDataset(100), 'catalog');
    const result = index.query({ ...DEFAULT_QUERY, scope: 'stress:1', search: 'ST-000001' });
    expect(result.roots.map(r => r.key)).toEqual(['stress:1']);
    expect(result.rows.map(r => r.key)).not.toContain('stress:0');
  });
  it('深链树视图明确截断，进入边界后可以继续浏览', () => {
    const index = new BomIndex(makeStressDataset(1000, 'deep'), 'catalog');
    const result = index.query(DEFAULT_QUERY);
    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBeLessThanOrEqual(128);
    const next = index.query({ ...DEFAULT_QUERY, scope: result.rows.at(-1)!.key });
    expect(next.rows.at(-1)!.depth).toBeGreaterThan(result.rows.at(-1)!.depth);
    expect(index.query({ ...DEFAULT_QUERY, mode: 'flat' }).rows).toHaveLength(1000);
    expect(index.rows.get('stress:999')!.path.length).toBeLessThan(1500);
  });
});

describe('Worker 索引恢复', () => {
  it('恢复投影后的关键词与完整查询结果一致', () => {
    const data = makeStressDataset(100);
    const original = new BomIndex(data, 'catalog');
    const restored = new BomIndex(data, 'catalog', [...original.rows.values()]);
    const query = { ...DEFAULT_QUERY, mode: 'flat' as const, search: 'ST-000099' };
    expect(restored.query(query)).toEqual(original.query(query));
  });
});

it('规范数量排序保留未知，汇总相同物料时做精确直接数量加法', () => {
  const data = makeStressDataset(4, 'wide');
  data.structures.catalog[2].partId = data.structures.catalog[1].partId;
  data.structures.catalog[2].compId = data.structures.catalog[1].compId;
  data.structures.catalog[1].quantity = '0.1';
  data.structures.catalog[2].quantity = '0.2';
  data.structures.catalog[3].quantity = null;
  const index = new BomIndex(data, 'catalog');
  const result = index.query({ ...DEFAULT_QUERY, mode: 'summary', sort: 'quantity', descending: true });
  expect(result.rows.find(r => r.count === 2)?.quantity).toBe('0.3');
  expect(result.rows.at(-1)?.quantity).toBeNull();
  expect(index.query({ ...DEFAULT_QUERY, scope: 'stress:1' }).roots[0].key).toBe('stress:1');
});
