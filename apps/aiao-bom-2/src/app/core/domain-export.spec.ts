import { describe, expect, it } from 'vitest';
import { prepareDomainDraft } from './domain-export';
import type { DraftState, Occurrence } from './types';
const node = (key: string, parentKey: string | null, partId = key): Occurrence => ({
  key,
  parentKey,
  partId,
  compId: partId,
  kind: 'part',
  source: 'draft',
  markets: ['EU'],
  quantity: '1',
  quantityState: 'confirmed',
  uom: 'pcs',
  sourceRef: `original:${key}`
});
const draft = (nodes = [node('root', null), node('a', 'root'), node('b', 'root', 'a')]): DraftState => ({
  schema: 'aiao-bom-2-draft/1',
  datasetId: 'windrose',
  name: '已核对装配',
  revision: 3,
  savedAt: '2026-11-14',
  nodes
});
const options = {
  rootKey: 'root',
  revisionNo: 'W3',
  orgId: 'org-windrose',
  effectiveFrom: '2026-11-14',
  confirmed: true
};
describe('工作草稿进入领域导入契约', () => {
  it('保留 Decimal 字符串与同父重复发生位置，生成独立行', () => {
    const input = draft();
    input.nodes[1].quantity = '0.123456789123456789';
    const result = prepareDomainDraft(input, options);
    const occurrences = result.records.filter(row => row['kind'] === 'occurrence');
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]?.['qty']).toBe('0.123456789123456789');
    expect(occurrences.map(row => row['lineNo'])).toEqual([10, 20]);
    expect(result.identities.map(row => row.key)).toEqual(['a', 'b']);
    expect(result.records.filter(row => row['kind'] === 'item')).toHaveLength(2);
  });
  it.each(['missing', 'ambiguous', 'reference'] as const)('阻断 %s 用量', state => {
    const input = draft();
    input.nodes[1].quantityState = state;
    expect(() => prepareDomainDraft(input, options)).toThrow('未确认');
  });
  it('未确认制造关系、分类节点、无子项和无效日期拒绝', () => {
    expect(() => prepareDomainDraft(draft(), { ...options, confirmed: false })).toThrow('确认');
    const input = draft();
    input.nodes[0].kind = 'system';
    expect(() => prepareDomainDraft(input, options)).toThrow('分类');
    expect(() => prepareDomainDraft(draft([node('root', null)]), options)).toThrow('子项');
    expect(() => prepareDomainDraft(draft(), { ...options, effectiveFrom: '2026-02-30' })).toThrow('日期');
  });
  it('同物料不同装配结构拒绝隐式合并', () => {
    const input = draft([
      node('root', null),
      node('s1', 'root', 'S'),
      node('s2', 'root', 'S'),
      node('a', 's1'),
      node('b', 's2')
    ]);
    expect(() => prepareDomainDraft(input, options)).toThrow('不同子结构');
  });
  it('同物料相同子结构复用定义，保留每条来源位置对应关系', () => {
    const input = draft([
      node('root', null),
      node('s1', 'root', 'S'),
      node('s2', 'root', 'S'),
      node('a', 's1', 'A'),
      node('b', 's2', 'A')
    ]);
    const result = prepareDomainDraft(input, options);
    expect(result.records.filter(row => row['kind'] === 'header')).toHaveLength(2);
    expect(result.identities).toHaveLength(4);
  });
  it('只转换明确选择的装配范围，其余缺量不混入', () => {
    const input = draft();
    input.nodes.push({ ...node('other', null), quantityState: 'missing', quantity: null });
    expect(prepareDomainDraft(input, options).rootItemNo).toBe('root');
  });
  it('循环物料依赖和同物料单位冲突拒绝', () => {
    expect(() => prepareDomainDraft(draft([node('root', null), node('a', 'root', 'root')]), options)).toThrow('环');
    const input = draft();
    input.nodes[2].uom = 'kg';
    expect(() => prepareDomainDraft(input, options)).toThrow('单位');
  });
});
