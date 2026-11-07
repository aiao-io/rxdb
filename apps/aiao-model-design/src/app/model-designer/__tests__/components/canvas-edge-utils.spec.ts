import type { DesignEntity, DesignRelation } from '../../models/index.js';
import type { Graph as GraphType } from '@antv/x6';
import { describe, expect, it } from 'vitest';
import { syncGraphEdges } from '../../components/canvas/canvas-edge-sync';
import {
  chooseNearestRelationPorts,
  shouldFlipOneToManyDirection,
  type X6NodeLike
} from '../../components/canvas/canvas-edge-utils';
import { RELATION_KINDS } from '../../constants';

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
  attr: () => undefined;
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
});
