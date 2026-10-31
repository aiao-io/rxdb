import type { ExplosionResult, RequirementLine } from '@aiao/rxdb-plugin-bom';
import { describe, expect, it } from 'vitest';
import { buildRequirementTree, flattenRequirementTree } from './requirement-tree';

const requirement = (itemId: string, path: string[]): RequirementLine => ({
  itemId,
  path,
  revisionId: `${itemId}-a`,
  qty: '2',
  uom: 'pcs',
  steps: {
    planned: { value: '1', uom: 'pcs' },
    assemblyScrapped: { value: '1', uom: 'pcs' },
    gross: { value: '2', uom: 'pcs' },
    componentScrapped: { value: '2', uom: 'pcs' },
    operationScrapped: null,
    converted: { value: '2', uom: 'pcs' },
    phantom: { value: false, source: 'revision', revisionId: `${itemId}-a` }
  }
});

const explosion = (lines: RequirementLine[]): ExplosionResult => ({
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-09-22') },
    parentItemId: 'scooter',
    parentRevisionId: 'scooter-a',
    headerIds: [],
    occurrenceIds: [],
    conversions: [],
    formulaGrammarVersion: 'fixture',
    algorithmVersion: 'fixture',
    unresolved: []
  },
  requirementLines: lines,
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
});

describe('需求发生项的完整路径树', () => {
  it('乱序需求先建索引，再按路径挂接，同一物料在两条路径上保持独立', () => {
    const first = requirement('screw', ['board-a', 'screw-a']);
    const second = requirement('screw', ['board-b', 'screw-b']);
    const result = explosion([first, requirement('board', ['board-a']), second, requirement('board', ['board-b'])]);
    result.manifest.occurrenceIds = ['board-a', 'board-b', 'screw-a', 'screw-b'];

    const tree = buildRequirementTree(result);

    expect(tree.kind).toBe('root');
    expect(tree.itemId).toBe('scooter');
    expect(tree.children.map(node => node.path)).toEqual([['board-a'], ['board-b']]);
    expect(tree.children[0].children[0].line).toBe(first);
    expect(tree.children[1].children[0].line).toBe(second);
    expect(tree.children[0].children[0].key).not.toBe(tree.children[1].children[0].key);
  });

  it('虚拟件补回真实发生项层级，穿透记录不伪装成需求数量', () => {
    const child = requirement('screw', ['wire', 'screw']);
    const result = explosion([child]);
    result.penetrations = [
      {
        path: ['wire'],
        occurrenceId: 'wire',
        childItemId: 'wire-item',
        revisionId: 'wire-a',
        source: 'override',
        converted: { value: '2', uom: 'pcs' },
        childPlanned: { value: '2', uom: 'set' }
      }
    ];

    const tree = buildRequirementTree(result);

    expect(tree.children[0].kind).toBe('phantom');
    expect(tree.children[0].line).toBeNull();
    expect(tree.children[0].penetration).toBe(result.penetrations[0]);
    expect(tree.children[0].children[0].line).toBe(child);
  });

  it('产出挂在自己的父路径，保持联产品和投入分开', () => {
    const result = explosion([requirement('board', ['board'])]);
    result.outputs = [{ path: ['board', 'scrap'], itemId: 'scrap', direction: 'scrap_out', qty: '0.125', uom: 'kg' }];
    const node = buildRequirementTree(result).children[0].children[0];
    expect(node.kind).toBe('output');
    expect(node.output).toBe(result.outputs[0]);
    expect(node.line).toBeNull();
  });

  it('收起分支后不输出后代，但保留根和其他同级分支', () => {
    const tree = buildRequirementTree(
      explosion([
        requirement('board', ['board']),
        requirement('screw', ['board', 'screw']),
        requirement('battery', ['battery'])
      ])
    );
    expect(flattenRequirementTree(tree, new Set([tree.key])).map(node => node.path)).toEqual([
      [],
      ['board'],
      ['battery']
    ]);
    expect(flattenRequirementTree(tree, new Set([tree.key, tree.children[0].key])).map(node => node.path)).toEqual([
      [],
      ['board'],
      ['board', 'screw'],
      ['battery']
    ]);
  });

  it('缺少中间发生项明确失败，不把深层需求提升到根', () => {
    expect(() => buildRequirementTree(explosion([requirement('screw', ['missing', 'screw'])]))).toThrow(
      '需求路径缺少父节点'
    );
  });

  it('空路径或重复完整路径明确拒绝', () => {
    expect(() => buildRequirementTree(explosion([requirement('board', [])]))).toThrow('需求发生项路径不能为空');
    expect(() =>
      buildRequirementTree(explosion([requirement('board', ['same']), requirement('battery', ['same'])]))
    ).toThrow('需求路径重复');
  });
});
