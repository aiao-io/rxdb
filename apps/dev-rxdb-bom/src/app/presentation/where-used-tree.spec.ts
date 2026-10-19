import type { ExpansionNode } from '@aiao/rxdb-plugin-bom';
import { describe, expect, it } from 'vitest';
import { buildWhereUsedTree } from './where-used-tree';

const node = (itemId: string, path: string[]): ExpansionNode => ({
  path,
  depth: path.length,
  itemId,
  revisionId: `${itemId}-revision`,
  occurrenceId: path[0] ?? null,
  qty: '1',
  lineNo: 10,
  effectiveFrom: new Date('2026-09-22'),
  effectiveTo: null
});

describe('反查路径的树结构', () => {
  it('同一整机的直接使用与经线束使用保留为两条路径', () => {
    const directScooter = node('SC-100', ['scooter-screw']);
    const wire = node('WH-01', ['wire-screw']);
    const indirectScooter = node('SC-100', ['scooter-wire', 'wire-screw']);

    const tree = buildWhereUsedTree([directScooter, wire, indirectScooter]);

    expect(tree).toHaveLength(2);
    expect(tree[0]).toEqual({ key: '["scooter-screw"]', node: directScooter, children: [] });
    expect(tree[1].node).toBe(wire);
    expect(tree[1].children).toEqual([{ key: '["scooter-wire","wire-screw"]', node: indirectScooter, children: [] }]);
  });

  it('同一父物料经不同发生项使用，不按物料标识合并', () => {
    const first = node('PCBA', ['resistor-position-1']);
    const second = node('PCBA', ['resistor-position-2']);

    const tree = buildWhereUsedTree([first, second]);

    expect(tree).toHaveLength(2);
    expect(tree.map(entry => entry.node)).toEqual([first, second]);
    expect(new Set(tree.map(entry => entry.key)).size).toBe(2);
  });

  it('完整建索引后挂接乱序节点，并保持根节点和兄弟节点的输入顺序', () => {
    const deep = node('FLEET', ['fleet-scooter', 'scooter-wire-a', 'wire-screw']);
    const direct = node('SC-100', ['direct-screw']);
    const secondScooter = node('SC-100', ['scooter-wire-b', 'wire-screw']);
    const wire = node('WH-01', ['wire-screw']);
    const firstScooter = node('SC-100', ['scooter-wire-a', 'wire-screw']);
    const input = [deep, direct, secondScooter, wire, firstScooter];

    const tree = buildWhereUsedTree(input);

    expect(tree.map(entry => entry.node)).toEqual([direct, wire]);
    expect(tree[1].children.map(entry => entry.node)).toEqual([secondScooter, firstScooter]);
    expect(tree[1].children[1].children[0].node).toBe(deep);
    expect(input).toEqual([deep, direct, secondScooter, wire, firstScooter]);
    expect(deep.path).toEqual(['fleet-scooter', 'scooter-wire-a', 'wire-screw']);
  });

  it('没有使用方时返回空树', () => {
    expect(buildWhereUsedTree([])).toEqual([]);
  });

  it('深层节点缺少中间路径时拒绝生成误导性的根节点', () => {
    const direct = node('WH-01', ['wire-screw']);
    const deep = node('FLEET', ['fleet-scooter', 'scooter-wire', 'wire-screw']);

    expect(() => buildWhereUsedTree([direct, deep])).toThrow('反查路径缺少父路径：["scooter-wire","wire-screw"]');
  });

  it('重复完整路径明确报错，即使物料标识不同也不覆盖原节点', () => {
    expect(() => buildWhereUsedTree([node('PCBA', ['same-occurrence']), node('BATT', ['same-occurrence'])])).toThrow(
      '反查路径重复：["same-occurrence"]'
    );
  });

  it('反查结果不包含被查物料的空路径根节点', () => {
    expect(() => buildWhereUsedTree([node('M3', [])])).toThrow('反查路径不能为空');
  });

  it('层级必须与发生项路径长度一致', () => {
    const wrongDepth = { ...node('SC-100', ['scooter-wire', 'wire-screw']), depth: 1 };

    expect(() => buildWhereUsedTree([wrongDepth])).toThrow(
      '反查节点层级与路径长度不一致：["scooter-wire","wire-screw"]'
    );
  });
});
