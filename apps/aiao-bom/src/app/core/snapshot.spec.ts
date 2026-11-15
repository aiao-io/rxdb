import { describe, expect, it } from 'vitest';
import { compareSnapshots, createSnapshot, parseSnapshot, snapshotListItem } from './snapshot';
import { makeStressDataset } from './stress-data';
import type { Occurrence } from './types';

const node = (key: string, overrides: Partial<Occurrence> = {}): Occurrence => ({
  key,
  parentKey: null,
  partId: key,
  compId: `${key}-A`,
  kind: 'part',
  source: 'catalog',
  markets: ['CN'],
  quantity: '1',
  quantityState: 'confirmed',
  uom: '件',
  sourceRef: `source:${key}`,
  ...overrides
});
const snapshot = (id: string, date: string, nodes: Occurrence[]) =>
  createSnapshot({
    id,
    datasetId: 'vehicle',
    name: id,
    source: 'dataset',
    structure: 'catalog',
    version: id,
    evaluationDate: date,
    observedOn: '2026-11-13',
    savedAt: '2026-11-14T00:00:00.000Z',
    nodes
  });

describe('BOM 版本快照差异', () => {
  it('按位置身份识别新增、删除、改量、换件和移动，同一物料的其他位置不合并', () => {
    const before = snapshot('before', '2026-01-01', [
      node('root'),
      node('keep'),
      node('removed'),
      node('moved', { parentKey: 'root' })
    ]);
    const after = snapshot('after', '2026-02-01', [
      node('root'),
      node('keep', { quantity: '2.5' }),
      node('added', { partId: 'keep' }),
      node('moved', { partId: 'replacement' })
    ]);
    const diff = compareSnapshots(before, after);
    expect(diff.dateOrder).toBe('before');
    expect(diff.summary).toEqual({
      added: 1,
      removed: 1,
      changed: 2,
      quantityChanges: 1,
      replacements: 1,
      moved: 1,
      otherChanges: 0
    });
    expect(diff.changes.find(change => change.key === 'keep')).toMatchObject({
      fields: ['quantity'],
      quantityDelta: '1.5'
    });
    expect(diff.changes.find(change => change.key === 'moved')?.fields).toEqual(['replacement', 'parent']);
  });

  it('识别确认状态、成本、市场、名称与来源信息变化，成本保留 Decimal 字符串', () => {
    const before = snapshot('before', '2026-01-01', [
      node('a', { quantityState: 'reference', unitCost: '999999999999999999.1' })
    ]);
    const after = snapshot('after', '2026-01-01', [
      node('a', { label: '新标签', markets: ['EU'], unitCost: '999999999999999999.2', sourceRef: 'updated' })
    ]);
    const diff = compareSnapshots(before, after);
    expect(diff.dateOrder).toBe('same');
    expect(diff.changes[0].fields).toEqual(['quantityState', 'unitCost', 'label', 'markets', 'identity']);
    expect(diff.changes[0].quantityDelta).toBeNull();
    expect(diff.unconfirmedQuantities).toEqual({ before: 1, after: 0 });
    expect(diff.changes[0].after?.unitCost).toBe('999999999999999999.2');
    expect(diff.summary.otherChanges).toBe(1);
  });

  it('缺量、歧义量与单位变化不虚构数量差，日期倒序仍保留明确比较方向', () => {
    const before = snapshot('before', '2026-02-01', [
      node('a', { quantity: null, quantityState: 'missing' }),
      node('b')
    ]);
    const after = snapshot('after', '2026-01-01', [
      node('a', { quantity: null, quantityState: 'ambiguous' }),
      node('b', { quantity: '2', uom: '箱' })
    ]);
    const diff = compareSnapshots(before, after);
    expect(diff.dateOrder).toBe('after');
    expect(diff.changes.map(change => change.quantityDelta)).toEqual([null, null]);
    expect(diff.changes[0].fields).toEqual(['quantityState']);
    expect(diff.unconfirmedQuantities).toEqual({ before: 1, after: 1 });
  });

  it.each(['', '   '])('两边均未声明单位 %j 时保留改量记录但不计算数量差', uom => {
    const before = snapshot('before', '2026-01-01', [node('a', { uom })]);
    const after = snapshot('after', '2026-02-01', [node('a', { uom, quantity: '2' })]);
    const diff = compareSnapshots(before, after);
    expect(diff.changes[0].fields).toEqual(['quantity']);
    expect(diff.changes[0].quantityDelta).toBeNull();
    expect(diff.unconfirmedQuantities).toEqual({ before: 1, after: 1 });
  });

  it('市场顺序和未填写可选值不会制造差异，比较结果与快照保持引用隔离', () => {
    const before = snapshot('before', '2026-01-01', [node('a', { markets: ['EU', 'CN'] })]);
    const after = snapshot('after', '2026-02-01', [node('a', { markets: ['CN', 'EU'], unitCost: null, label: '' })]);
    expect(compareSnapshots(before, after).changes).toHaveLength(0);
    after.nodes[0].quantity = '2';
    const diff = compareSnapshots(before, after);
    after.nodes[0].quantity = '3';
    expect(diff.changes[0].after?.quantity).toBe('2');
  });

  it('拒绝跨数据集和跨结构比较，但允许空版本表达全部删除', () => {
    const before = snapshot('before', '2026-01-01', [node('a')]);
    const after = snapshot('after', '2026-02-01', []);
    expect(() => compareSnapshots(before, { ...after, datasetId: 'other' })).toThrow('同一产品数据集');
    expect(() => compareSnapshots(before, { ...after, structure: 'cad' })).toThrow('同一结构来源');
    expect(compareSnapshots(before, after).summary.removed).toBe(1);
    expect(compareSnapshots(before, before).changes).toHaveLength(0);
  });

  it('拒绝重复身份、丢失父项及深链循环，保存时不依赖输入行序', () => {
    expect(() => snapshot('a', '2026-01-01', [node('a'), node('a')])).toThrow('重复');
    expect(() => snapshot('a', '2026-01-01', [node('a', { parentKey: 'missing' })])).toThrow('父位置');
    expect(() => snapshot('a', '2026-01-01', [node('a', { parentKey: 'b' }), node('b', { parentKey: 'a' })])).toThrow(
      '循环'
    );
    expect(snapshot('a', '2026-01-01', [node('a', { parentKey: 'b' }), node('b')]).nodes).toHaveLength(2);
  });

  it('严格校验规范十进制、日期、市场及可选字段，不默默丢弃损坏值', () => {
    const original = snapshot('before', '2026-01-01', [node('a')]);
    const invalid = (patch: Record<string, unknown>) => ({ ...original, nodes: [{ ...original.nodes[0], ...patch }] });
    for (const quantity of [1, '1.00', '-1', '1e3', '0'.repeat(81)])
      expect(() => parseSnapshot(invalid({ quantity }))).toThrow();
    for (const patch of [
      { unitCost: '0.10' },
      { markets: ['XX'] },
      { markets: ['CN', 'CN'] },
      { label: 2 },
      { nodeIndex: -1 },
      { nodeIndex: 1.2 },
      { source: 'unknown' },
      { parentKey: 1 }
    ])
      expect(() => parseSnapshot(invalid(patch))).toThrow();
    for (const evaluationDate of ['2026-02-30', '2026-13-01', '26-01-01'])
      expect(() => parseSnapshot({ ...original, evaluationDate })).toThrow('日期');
    expect(() => parseSnapshot({ ...original, observedOn: 'bad' })).toThrow('日期');
    expect(() => parseSnapshot({ ...original, savedAt: 'bad' })).toThrow('时间');
    expect(() => parseSnapshot({ ...original, name: ' ' })).toThrow('name');
    expect(() => parseSnapshot({ ...original, nodes: [null] })).toThrow('位置');
    expect(() => parseSnapshot(null)).toThrow('格式');
  });

  it('快照往返保留位置身份和空的来源字段，元数据不携带节点', () => {
    const nodes = [
      node('a', { kind: 'system', compId: '', uom: '', sourceRef: '', quantity: null, quantityState: 'missing' })
    ];
    const original = snapshot('before', '2026-01-01', nodes);
    nodes[0].markets.push('EU');
    const restored = parseSnapshot(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
    expect(restored.nodes[0].markets).toEqual(['CN']);
    expect(snapshotListItem(restored)).toMatchObject({ id: 'before', nodeCount: 1, evaluationDate: '2026-01-01' });
    expect(snapshotListItem(restored)).not.toHaveProperty('nodes');
    expect(compareSnapshots(restored, restored).unconfirmedQuantities).toEqual({ before: 0, after: 0 });
  });

  it('十万节点深链校验与比较不递归、不逐行扫描全部节点', () => {
    const data = makeStressDataset(100000, 'deep');
    const before = snapshot('before', '2026-01-01', data.structures.catalog);
    const after = snapshot('after', '2026-02-01', before.nodes);
    after.nodes[99999].quantity = '2';
    expect(compareSnapshots(before, after).changes.map(change => change.key)).toEqual([after.nodes[99999].key]);
  }, 15000);
});
