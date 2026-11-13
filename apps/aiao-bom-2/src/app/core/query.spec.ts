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
    expect(scoped.rows.every(row => index.ancestors(row.key).some(n => n.key === scope) || row.key === scope)).toBe(true);
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
