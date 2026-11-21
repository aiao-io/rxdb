import type { Graph as GraphType } from '@antv/x6';
import { describe, expect, it, vi } from 'vitest';
import { syncGraphEdges } from '../../components/canvas/canvas-edge-sync';
import {
  asNodeLike,
  chooseNearestRelationPorts,
  nodeChildren,
  orientRelationPair,
  pairLabel,
  parentGroupId,
  portAbsPoint,
  relationPortId,
  shouldFlipOneToManyDirection,
  toValidRelationPair,
  type X6NodeLike
} from '../../components/canvas/canvas-edge-utils';
import { RELATION_KINDS } from '../../constants';
import type { DesignEntity, DesignRelation } from '../../models/index.js';

interface EdgeConfig {
  id: string;
  source: { cell: string; port: string };
  target: { cell: string; port: string };
  data?: unknown;
  labels?: unknown;
}

interface EdgeLike {
  id: string;
  getSource: () => { cell: string; port: string };
  getTarget: () => { cell: string; port: string };
  setSource: (value: { cell: string; port: string }) => void;
  setTarget: (value: { cell: string; port: string }) => void;
  getData: () => unknown;
  setData: (value: unknown) => void;
  getLabelAt: (index: number) => { attrs?: { text?: { text?: string } } } | undefined;
  setLabelAt: (index: number, value: unknown) => void;
  setRouter: (value: unknown) => void;
  setConnector: (value: unknown) => void;
  attr: (...args: unknown[]) => undefined;
  remove: () => void;
}

function relation(id: string): DesignRelation {
  return { id } as DesignRelation;
}

function node(id: string, x: number, y: number, width = 240): X6NodeLike {
  return {
    id,
    getPosition: () => ({ x, y }),
    getSize: () => ({ width, height: 180 }),
    getPort: portId => ({
      id: portId,
      args: { x: portId.startsWith('rr:') ? width : 0, y: 90 }
    })
  };
}

function relationPair(): DesignRelation[] {
  return [
    {
      id: 'one-to-many',
      designEntityId: 'one',
      mappedEntityId: 'many',
      mappedPropertyId: 'many-to-one',
      relationKind: RELATION_KINDS.ONE_TO_MANY
    } as unknown as DesignRelation,
    {
      id: 'many-to-one',
      designEntityId: 'many',
      mappedEntityId: 'one',
      mappedPropertyId: 'one-to-many',
      relationKind: RELATION_KINDS.MANY_TO_ONE
    } as unknown as DesignRelation
  ];
}

function graphWithNodes(nodes: X6NodeLike[]) {
  const cells = new Map<string, unknown>(nodes.map(item => [item.id, item]));
  const edges: EdgeLike[] = [];
  const graph = {
    getCellById: (id: string) => cells.get(id),
    getEdges: () => edges,
    addEdge: (config: EdgeConfig) => {
      let source = config.source;
      let target = config.target;
      let data = config.data;
      let labels = config.labels;
      const edge: EdgeLike = {
        id: config.id,
        getSource: () => source,
        getTarget: () => target,
        setSource: (value: typeof source) => {
          source = value;
        },
        setTarget: (value: typeof target) => {
          target = value;
        },
        getData: () => data,
        setData: (value: unknown) => {
          data = value;
        },
        getLabelAt: () => (labels as Array<{ attrs?: Record<string, unknown> }> | undefined)?.[0],
        setLabelAt: (_index: number, value: unknown) => {
          labels = [value];
        },
        setRouter: vi.fn(),
        setConnector: vi.fn(),
        attr: () => undefined,
        remove: () => {
          const index = edges.indexOf(edge);
          if (index >= 0) edges.splice(index, 1);
        }
      };
      edges.push(edge);
      cells.set(String(config.id), edge);
      return edge;
    }
  };
  return { graph: graph as unknown as GraphType, edges };
}

describe('chooseNearestRelationPorts', () => {
  it('uses facing ports when entities are separated horizontally', () => {
    const ports = chooseNearestRelationPorts(relation('r1'), relation('r2'), node('e1', 0, 0), node('e2', 400, 0));

    expect(ports).toEqual({ sourcePort: 'rr:r1', targetPort: 'rl:r2' });
  });

  it('reverses the facing ports after moving the target to the left', () => {
    const ports = chooseNearestRelationPorts(relation('r1'), relation('r2'), node('e1', 400, 0), node('e2', 0, 0));

    expect(ports).toEqual({ sourcePort: 'rl:r1', targetPort: 'rr:r2' });
  });

  it('keeps a second relationship on a different channel', () => {
    const ports = chooseNearestRelationPorts(relation('r1'), relation('r2'), node('e1', 0, 0), node('e2', 400, 0), 1);

    expect(ports).toEqual({ sourcePort: 'rl:r1', targetPort: 'rr:r2' });
  });
});

describe('shouldFlipOneToManyDirection', () => {
  it('flips when the one-side entity is to the right', () => {
    expect(shouldFlipOneToManyDirection(node('one', 400, 0), node('many', 0, 0))).toBe(true);
    expect(shouldFlipOneToManyDirection(node('one', 0, 0), node('many', 400, 0))).toBe(false);
  });
});

describe('syncGraphEdges', () => {
  it('deduplicates inverse relations and changes the displayed direction after moving', () => {
    const one = node('one', 0, 0);
    const many = node('many', 400, 0);
    const { graph, edges } = graphWithNodes([one, many]);
    const entities = [{ id: 'one' }, { id: 'many' }] as unknown as DesignEntity[];

    syncGraphEdges(graph, relationPair(), entities);

    expect(edges).toHaveLength(1);
    expect(edges[0].getLabelAt?.(0)?.attrs?.text?.text).toBe(' 1:N ');
    expect(edges[0].getData?.()).toEqual({ relationKind: RELATION_KINDS.ONE_TO_MANY });

    (one.getPosition as () => { x: number; y: number }) = () => ({ x: 500, y: 0 });
    syncGraphEdges(graph, relationPair(), entities);

    expect(edges).toHaveLength(1);
    expect(edges[0].getLabelAt?.(0)?.attrs?.text?.text).toBe(' N:1 ');
    expect(edges[0].getData?.()).toEqual({ relationKind: RELATION_KINDS.MANY_TO_ONE });
  });

  it('removes stale edges and skips malformed pairs or incomplete nodes', () => {
    const { graph, edges } = graphWithNodes([node('one', 0, 0)]);
    graph.addEdge({
      id: 'stale',
      source: { cell: 'one', port: 'rr:stale' },
      target: { cell: 'missing', port: 'rl:stale' }
    });

    syncGraphEdges(
      graph,
      [
        ...relationPair(),
        {
          id: 'malformed',
          designEntityId: 'one',
          mappedEntityId: 'many',
          mappedPropertyId: 'missing',
          relationKind: RELATION_KINDS.ONE_TO_MANY
        } as unknown as DesignRelation
      ],
      [{ id: 'one' }, { id: 'many' }] as unknown as DesignEntity[]
    );
    expect(edges).toHaveLength(0);

    const noPorts = {
      id: 'many',
      getPosition: () => ({ x: 400, y: 0 }),
      getSize: () => ({ width: 240, height: 180 })
    };
    const graphWithoutPorts = graphWithNodes([node('one', 0, 0), noPorts]).graph;
    syncGraphEdges(graphWithoutPorts, relationPair(), [{ id: 'one' }, { id: 'many' }] as unknown as DesignEntity[]);
    expect(graphWithoutPorts.getEdges()).toHaveLength(0);
  });

  it('creates, updates, and removes TreeEntityBase self-loop edges', () => {
    const tree = node('tree', 0, 0);
    const { graph, edges } = graphWithNodes([tree]);
    const entities = [{ id: 'tree', extendsBase: 'TreeEntityBase' }] as unknown as DesignEntity[];

    syncGraphEdges(graph, [], entities);
    expect(edges).toHaveLength(1);
    expect(edges[0].getSource()).toEqual(expect.objectContaining({ cell: 'tree' }));
    expect(edges[0].getTarget()).toEqual(expect.objectContaining({ cell: 'tree' }));

    syncGraphEdges(graph, [], entities);
    expect(edges).toHaveLength(1);

    syncGraphEdges(graph, [], []);
    expect(edges).toHaveLength(0);
  });

  it('repairs existing edge topology and refreshes relation markers and labels', () => {
    const { graph, edges } = graphWithNodes([node('one', 0, 0), node('many', 400, 0)]);
    const entities = [{ id: 'one' }, { id: 'many' }] as unknown as DesignEntity[];
    const initial = relationPair();
    syncGraphEdges(graph, initial, entities);

    const edge = edges[0];
    edge.setSource({ cell: 'wrong', port: 'wrong' });
    edge.setTarget({ cell: 'wrong', port: 'wrong' });
    edge.setData({ relationKind: RELATION_KINDS.ONE_TO_ONE });
    edge.setLabelAt(0, { attrs: { text: { text: 'old' } } });

    const manyToMany = initial.map(relation => ({ ...relation, relationKind: RELATION_KINDS.MANY_TO_MANY }));
    syncGraphEdges(graph, manyToMany, entities);

    expect(edge.getSource().cell).toBe('many');
    expect(edge.getTarget().cell).toBe('one');
    expect(edge.getData()).toEqual({ relationKind: RELATION_KINDS.MANY_TO_MANY });
    expect(edge.getLabelAt(0)?.attrs?.text?.text).toBe(' N:N ');
  });
});


describe('canvas edge utility guards', () => {
  it('narrows nodes, filters invalid children, and resolves namespace parents', () => {
    const child = { id: 'child' };
    const parent = { id: 'ns:crm' };
    const nodeLike = {
      id: 'entity',
      getChildren: () => [child, null, { value: true }],
      getParent: () => parent
    } as unknown as X6NodeLike;

    expect(asNodeLike(null)).toBeNull();
    expect(asNodeLike({ value: true })).toBeNull();
    expect(asNodeLike({ id: 'entity' })).toEqual({ id: 'entity' });
    expect(nodeChildren(nodeLike)).toEqual([child]);
    expect(parentGroupId(nodeLike, 'ns:')).toBe('ns:crm');
    expect(parentGroupId(nodeLike, 'group:')).toBeNull();
    expect(parentGroupId({ id: 'entity' }, 'ns:')).toBeNull();
  });

  it('validates relation pairs and normalizes orientation and labels', () => {
    const pair = relationPair();
    const relationById = new Map(pair.map(item => [item.id, item]));

    expect(toValidRelationPair(pair[0], relationById)).toEqual(pair);
    expect(toValidRelationPair({ id: 'missing' } as unknown as DesignRelation, relationById)).toBeNull();
    expect(
      toValidRelationPair(
        { ...pair[0], mappedPropertyId: 'missing' } as unknown as DesignRelation,
        relationById
      )
    ).toBeNull();
    expect(
      toValidRelationPair(
        { ...pair[0], mappedEntityId: 'other' } as unknown as DesignRelation,
        relationById
      )
    ).toBeNull();
    expect(
      toValidRelationPair(
        { ...pair[0], relationKind: 'ONE_TO_ONE' } as unknown as DesignRelation,
        relationById
      )
    ).toBeNull();

    expect(orientRelationPair(pair[1], pair[0])).toEqual({ source: pair[0], target: pair[1] });
    expect(orientRelationPair({ id: 'a', relationKind: 'ONE_TO_ONE' } as unknown as DesignRelation, { id: 'b', relationKind: 'ONE_TO_ONE' } as unknown as DesignRelation).source.id).toBe('a');
    expect(pairLabel({ relationKind: 'MANY_TO_MANY' } as unknown as DesignRelation, { relationKind: 'MANY_TO_MANY' } as unknown as DesignRelation)).toBe('N:N');
    expect(pairLabel({ relationKind: 'ONE_TO_ONE' } as unknown as DesignRelation, { relationKind: 'ONE_TO_ONE' } as unknown as DesignRelation)).toBe('1:1');
    expect(relationPortId('relation-1', 'left')).toBe('rl:relation-1');
    expect(relationPortId('relation-1', 'right')).toBe('rr:relation-1');
  });

  it('computes absolute port points and handles incomplete geometry', () => {
    const complete = {
      id: 'entity',
      getPosition: () => ({ x: 10, y: 20 }),
      getPort: (id: string) => (id === 'complete' ? { id, args: { x: 4, y: 6 } } : undefined)
    } as X6NodeLike;
    const missingArgs = {
      id: 'entity',
      getPosition: () => ({ x: 10, y: 20 }),
      getPort: () => ({ id: 'missing', args: {} })
    } as X6NodeLike;
    const missingPosition = {
      id: 'entity',
      getPort: () => ({ id: 'complete', args: { x: 4, y: 6 } })
    } as X6NodeLike;

    expect(portAbsPoint(complete, 'complete')).toEqual({ x: 14, y: 26 });
    expect(portAbsPoint(complete, 'missing')).toBeNull();
    expect(portAbsPoint(missingArgs, 'missing')).toBeNull();
    expect(portAbsPoint(missingPosition, 'complete')).toBeNull();
    expect(shouldFlipOneToManyDirection(missingPosition, complete)).toBe(false);
  });

  it('uses fallback distance sorting when node geometry is unavailable', () => {
    const source = {
      id: 'source',
      getPosition: () => ({ x: 0, y: 0 }),
      getPort: (id: string) => ({ id, args: { x: id.startsWith('rr:') ? 100 : 0, y: 0 } })
    } as X6NodeLike;
    const target = {
      id: 'target',
      getPosition: () => ({ x: 100, y: 0 }),
      getPort: (id: string) => ({ id, args: { x: id.startsWith('rr:') ? 200 : 100, y: 0 } })
    } as X6NodeLike;

    expect(chooseNearestRelationPorts(relation('r1'), relation('r2'), source, target)).toEqual({
      sourcePort: 'rr:r1',
      targetPort: 'rl:r2'
    });
    expect(chooseNearestRelationPorts(relation('r1'), relation('r2'), { id: 'source' }, { id: 'target' })).toBeNull();
  });

  it('handles overlapping nodes and incomplete candidate ports', () => {
    const source = {
      id: 'source',
      getPosition: () => ({ x: 100, y: 0 }),
      getSize: () => ({ width: 200, height: 100 }),
      getPort: (id: string) => id === 'rl:r1' || id === 'rr:r1' ? { id, args: { x: id.startsWith('rr:') ? 200 : 0, y: 40 } } : undefined
    } as X6NodeLike;
    const target = {
      id: 'target',
      getPosition: () => ({ x: 120, y: 80 }),
      getSize: () => ({ width: 200, height: 100 }),
      getPort: () => undefined
    } as X6NodeLike;

    expect(chooseNearestRelationPorts(relation('r1'), relation('r2'), source, target)).toBeNull();
  });
});
