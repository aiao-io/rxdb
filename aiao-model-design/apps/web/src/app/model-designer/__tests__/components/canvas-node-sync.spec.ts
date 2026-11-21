import type { Graph as GraphType, Selection as SelectionType } from '@antv/x6';
import { describe, expect, it, vi } from 'vitest';
import { NS_PREFIX } from '../../components/canvas/canvas-constants';
import {
  fitGroupToChildren,
  syncFieldPorts,
  syncGraphSelection,
  syncGraphNodes,
  updateGraphTheme,
  updateNamespaceFontSize
} from '../../components/canvas/canvas-node-sync';

function createConnectedPortState() {
  const ports = [
    { id: 'rl:relation-1', group: 'field-left', args: { x: 0, y: 100 } },
    { id: 'rr:relation-1', group: 'field-right', args: { x: 240, y: 100 } },
    { id: 'entity:left', group: 'entity-left', args: { x: 0, y: 80 } },
    { id: 'entity:right', group: 'entity-right', args: { x: 240, y: 80 } }
  ];
  const edges = [{ sourcePort: 'rr:relation-1' }];
  const source = {
    id: 'test-node',
    getPorts: () => [...ports],
    removePort: (id: string) => {
      const index = ports.findIndex(port => port.id === id);
      if (index >= 0) ports.splice(index, 1);
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].sourcePort === id) edges.splice(i, 1);
      }
    },
    addPort: (port: (typeof ports)[number]) => ports.push(port),
    setPortProp: (id: string, path: string, value: unknown) => {
      const port = ports.find(item => item.id === id);
      if (port && path === 'args') port.args = value as { x: number; y: number };
    }
  };
  return { edges, source };
}

describe('syncFieldPorts', () => {
  it('keeps connected edges when relation port IDs are unchanged', () => {
    const { edges, source } = createConnectedPortState();

    syncFieldPorts(
      source,
      [{ id: 'relation-1', name: 'owner', type: 'relation', category: 'relation' }],
      240,
      160,
      false
    );

    expect(edges).toHaveLength(1);
    expect(source.getPorts().find(port => port.id === 'rr:relation-1')?.args).toEqual({ x: 240, y: 72 });
  });

  it('removes connected edges when their relation ports are deleted', () => {
    const { edges, source } = createConnectedPortState();

    syncFieldPorts(source, [], 240, 160, false);

    expect(edges).toHaveLength(0);
  });
});

describe('syncGraphSelection', () => {
  it('cleans selection when there is no external selection', () => {
    const cleanSelection = vi.fn();
    const graph = {
      cleanSelection,
      getSelectedCells: () => [],
      getCellById: () => undefined,
      select: vi.fn(),
      unselect: vi.fn()
    } as unknown as GraphType;

    syncGraphSelection(graph, { enable: vi.fn(), disable: vi.fn() } as unknown as SelectionType, new Set(), 'select');

    expect(cleanSelection).toHaveBeenCalledOnce();
  });

  it('synchronizes selected cells and temporarily enables move selection', () => {
    const enable = vi.fn();
    const disable = vi.fn();
    const select = vi.fn();
    const unselect = vi.fn();
    const cells = new Map([
      ['old', { id: 'old' }],
      ['new', { id: 'new' }]
    ]);
    const graph = {
      getSelectedCells: () => [{ id: 'old' }],
      getCellById: (id: string) => cells.get(id),
      select,
      unselect,
      cleanSelection: vi.fn()
    } as unknown as GraphType;

    syncGraphSelection(graph, { enable, disable } as unknown as SelectionType, new Set(['new', 'missing']), 'move');

    expect(enable).toHaveBeenCalledOnce();
    expect(disable).toHaveBeenCalledOnce();
    expect(unselect).toHaveBeenCalledWith({ id: 'old' });
    expect(select).toHaveBeenCalledWith({ id: 'new' });
  });
});

describe('namespace graph helpers', () => {
  it('fits a group around positioned child nodes', () => {
    const setPosition = vi.fn();
    const setSize = vi.fn();
    const group = {
      id: `${NS_PREFIX}crm`,
      isNode: () => true,
      getChildren: () => [
        {
          id: 'customer',
          isNode: () => true,
          getPosition: () => ({ x: 100, y: 200 }),
          getSize: () => ({ width: 240, height: 120 })
        },
        {
          id: 'order',
          isNode: () => true,
          getPosition: () => ({ x: 420, y: 260 }),
          getSize: () => ({ width: 180, height: 100 })
        }
      ],
      setPosition,
      setSize
    };

    fitGroupToChildren({ getCellById: () => group } as unknown as GraphType, `${NS_PREFIX}crm`);

    expect(setPosition).toHaveBeenCalledWith(76, 140, { deep: false });
    expect(setSize).toHaveBeenCalledWith(548, 244);
  });

  it('does nothing for groups without usable children', () => {
    const setPosition = vi.fn();
    const setSize = vi.fn();
    const group = {
      id: `${NS_PREFIX}empty`,
      isNode: () => true,
      getChildren: () => [{ id: 'missing-position', isNode: () => true }],
      setPosition,
      setSize
    };

    fitGroupToChildren({ getCellById: () => group } as unknown as GraphType, `${NS_PREFIX}empty`);

    expect(setPosition).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
  });

  it('updates theme and namespace font attributes', () => {
    const drawGrid = vi.fn();
    const groupSetAttr = vi.fn();
    const entitySetAttr = vi.fn();
    const graph = {
      drawGrid,
      getNodes: () => [
        { id: `${NS_PREFIX}crm`, setAttrByPath: groupSetAttr },
        { id: 'customer', setAttrByPath: entitySetAttr }
      ]
    } as unknown as GraphType;

    updateGraphTheme(graph, true);
    updateNamespaceFontSize(graph, 0.25);

    expect(drawGrid).toHaveBeenCalledWith({ type: 'dot', args: { color: 'rgba(128, 128, 128, 0.3)', thickness: 1 } });
    expect(groupSetAttr).toHaveBeenCalledWith('body/fill', 'rgba(95, 149, 255, 0.08)');
    expect(groupSetAttr).toHaveBeenCalledWith('body/stroke', '#4080c0');
    expect(groupSetAttr).toHaveBeenCalledWith('label/fill', '#4080c0');
    expect(groupSetAttr).toHaveBeenCalledWith('label/fontSize', 48);
    expect(entitySetAttr).not.toHaveBeenCalled();
  });
});

interface MockCanvasNode {
  id: string;
  parent: MockCanvasNode | null;
  children: MockCanvasNode[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  ports: Array<{ id: string; group: string; args: { x: number; y: number } }>;
  props: Map<string, unknown>;
  attrs: Map<string, unknown>;
  isNode: () => boolean;
  getChildren: () => MockCanvasNode[];
  getParent: () => MockCanvasNode | null;
  addChild: (child: MockCanvasNode) => void;
  getPosition: () => { x: number; y: number };
  getSize: () => { width: number; height: number };
  setPosition: (x: number, y: number) => void;
  setSize: (width: number, height: number) => void;
  getPorts: () => Array<{ id: string; group: string; args: { x: number; y: number } }>;
  addPort: (port: { id: string; group: string; args: { x: number; y: number } }) => void;
  removePort: (id: string) => void;
  setPortProp: (id: string, path: string, value: unknown) => void;
  replaceData: (data: unknown, options: unknown) => void;
  setZIndex: (value: number) => void;
  getProp: (path: string) => unknown;
  setAttrByPath: (path: string, value: unknown) => void;
}

function mockCanvasNode(
  id: string,
  options: { position?: { x: number; y: number }; size?: { width: number; height: number }; parent?: MockCanvasNode | null } = {}
): MockCanvasNode {
  const position = options.position ?? { x: 0, y: 0 };
  const size = options.size ?? { width: 240, height: 80 };
  const node: MockCanvasNode = {
    id,
    parent: options.parent ?? null,
    children: [],
    position: { ...position },
    size: { ...size },
    ports: [],
    props: new Map([
      ['position', { ...position }],
      ['size', { ...size }]
    ]),
    attrs: new Map(),
    isNode: () => true,
    getChildren: () => node.children,
    getParent: () => node.parent,
    addChild: child => {
      if (!node.children.includes(child)) node.children.push(child);
      child.parent = node;
    },
    getPosition: () => ({ ...node.position }),
    getSize: () => ({ ...node.size }),
    setPosition: (x, y) => {
      node.position = { x, y };
      node.props.set('position', { x, y });
    },
    setSize: (width, height) => {
      node.size = { width, height };
      node.props.set('size', { width, height });
    },
    getPorts: () => [...node.ports],
    addPort: port => node.ports.push({ ...port, args: { ...port.args } }),
    removePort: idToRemove => {
      node.ports = node.ports.filter(port => port.id !== idToRemove);
    },
    setPortProp: (portId, path, value) => {
      const port = node.ports.find(item => item.id === portId);
      if (port && path === 'args') port.args = { ...(value as { x: number; y: number }) };
    },
    replaceData: (data, options) => {
      node.props.set('data', { data, options });
    },
    setZIndex: value => node.props.set('zIndex', value),
    getProp: path => node.props.get(path),
    setAttrByPath: (path, value) => node.attrs.set(path, value)
  };
  if (node.parent) node.parent.children.push(node);
  return node;
}

function mockCanvasGraph(initialNodes: MockCanvasNode[]) {
  const nodes = [...initialNodes];
  const cells = new Map(nodes.map(node => [node.id, node]));
  const removed: string[] = [];
  const added: Array<Record<string, unknown>> = [];
  const graph = {
    getNodes: () => [...nodes],
    getCellById: (id: string) => cells.get(id),
    removeNode: (id: string) => {
      removed.push(id);
      cells.delete(id);
      const index = nodes.findIndex(node => node.id === id);
      if (index >= 0) nodes.splice(index, 1);
    },
    addNode: (config: Record<string, unknown>) => {
      const node = mockCanvasNode(String(config.id), {
        position: { x: Number(config.x ?? 0), y: Number(config.y ?? 0) },
        size: { width: Number(config.width ?? 240), height: Number(config.height ?? 80) }
      });
      nodes.push(node);
      cells.set(node.id, node);
      added.push(config);
      return node;
    }
  };
  return { graph: graph as unknown as GraphType, nodes, cells, removed, added };
}

describe('syncGraphNodes', () => {
  it('creates namespace and entity nodes while removing stale cells', async () => {
    const existingGroup = mockCanvasNode(`${NS_PREFIX}default`, { size: { width: 100, height: 60 } });
    const staleEntity = mockCanvasNode('stale');
    const staleGroup = mockCanvasNode(`${NS_PREFIX}stale`, { size: { width: 100, height: 60 } });
    const state = mockCanvasGraph([existingGroup, staleEntity, staleGroup]);
    const entity = {
      id: 'order',
      name: 'Order',
      entityNamespace: null,
      extendsBase: 'EntityBase',
      nodeX: 40,
      nodeY: 60,
      nodeWidth: 260
    };
    const relation = {
      id: 'relation-1',
      name: 'customer',
      designEntityId: 'order',
      mappedEntityId: 'customer',
      relationKind: 'MANY_TO_ONE'
    };

    syncGraphNodes(
      state.graph,
      [entity as never],
      new Map([['order', [{ id: 'property-1', name: 'status', propertyType: 'string' } as never]]]),
      new Map([['order', [relation as never]]]),
      new Set(['order']),
      new Set(['relation-1']),
      'default',
      new Map([['customer', 'Customer']]),
      new Set(['property-1'])
    );
    await Promise.resolve();

    expect(state.removed).toEqual(['stale', 'ns:stale']);
    expect(state.added.map(item => item.id)).toEqual(['order']);
    expect(state.cells.get('ns:default')?.attrs.get('label/text')).toBe('default');
    expect(state.cells.get('order')?.getPorts().map(port => port.id)).toEqual([
      'rl:relation-1',
      'rr:relation-1',
      'entity:left',
      'entity:right'
    ]);
    expect(state.added.find(item => item.id === 'order')?.data).toBeDefined();
  });

  it('updates existing nodes, reparents them, and honors skipped positions', async () => {
    const oldGroup = mockCanvasNode(`${NS_PREFIX}old`, { size: { width: 100, height: 60 } });
    const newGroup = mockCanvasNode(`${NS_PREFIX}new`, { size: { width: 100, height: 60 } });
    const moved = mockCanvasNode('moved', {
      position: { x: 0, y: 0 },
      size: { width: 240, height: 80 },
      parent: oldGroup
    });
    const skipped = mockCanvasNode('skipped', {
      position: { x: 0, y: 0 },
      size: { width: 240, height: 80 },
      parent: oldGroup
    });
    const state = mockCanvasGraph([oldGroup, newGroup, moved, skipped]);
    const entities = [
      {
        id: 'moved',
        name: 'Moved',
        entityNamespace: 'new',
        extendsBase: 'EntityBase',
        nodeX: 100,
        nodeY: 120,
        nodeWidth: 280
      },
      {
        id: 'skipped',
        name: 'Skipped',
        entityNamespace: 'new',
        extendsBase: 'EntityBase',
        nodeX: 100,
        nodeY: 120,
        nodeWidth: 280
      }
    ];

    syncGraphNodes(
      state.graph,
      entities as never,
      new Map([
        ['moved', [{ id: 'property-1', name: 'status', propertyType: 'string' } as never]],
        ['skipped', []]
      ]),
      new Map(),
      new Set(),
      new Set(),
      'old',
      new Map(),
      new Set(),
      new Set(['skipped'])
    );
    await Promise.resolve();

    expect(moved.parent).toBe(newGroup);
    expect(moved.position).toEqual({ x: 100, y: 120 });
    expect(moved.size.width).toBe(240);
    expect(skipped.parent).toBe(newGroup);
    expect(skipped.position).toEqual({ x: 0, y: 0 });
    expect(moved.ports.map(port => port.id)).toContain('entity:left');
  });
});

describe('syncGraphSelection edge cases', () => {
  it('returns when the selection plugin is absent and cleans move-mode singleton selection', () => {
    const cleanSelection = vi.fn();
    const graph = {
      cleanSelection,
      getSelectedCells: () => [],
      getCellById: () => undefined,
      select: vi.fn(),
      unselect: vi.fn()
    } as unknown as GraphType;

    syncGraphSelection(graph, undefined, new Set(['entity']), 'select');
    syncGraphSelection(graph, { enable: vi.fn(), disable: vi.fn() } as unknown as SelectionType, new Set(['entity']), 'move');

    expect(cleanSelection).toHaveBeenCalledOnce();
  });
});

describe('syncFieldPorts edge cases', () => {
  it('adds missing relation and entity ports and leaves already aligned ports untouched', () => {
    const setPortProp = vi.fn();
    const addPort = vi.fn();
    const node = {
      getPorts: () => [
        { id: 'rl:relation-1', group: 'field-left', args: { x: 0, y: 10 } },
        { id: 'entity:left', group: 'entity-left', args: { x: 0, y: 50 } },
        { id: 'entity:right', group: 'entity-right', args: { x: 240, y: 50 } }
      ],
      addPort,
      removePort: vi.fn(),
      setPortProp
    };

    syncFieldPorts(
      node,
      [{ id: 'relation-1', name: 'owner', type: 'relation', category: 'relation' }],
      240,
      100,
      true
    );

    expect(addPort).toHaveBeenCalledTimes(1);
    expect(setPortProp).toHaveBeenCalledTimes(1);
    expect(addPort).toHaveBeenCalledWith(expect.objectContaining({ id: 'rr:relation-1' }));
  });
});

describe('theme and group guards', () => {
  it('handles light theme, zoom minimum, and non-node groups', () => {
    const setAttrByPath = vi.fn();
    const graph = {
      drawGrid: vi.fn(),
      getNodes: () => [
        { id: `${NS_PREFIX}crm`, setAttrByPath },
        { id: 'entity', setAttrByPath }
      ]
    } as unknown as GraphType;
    updateGraphTheme(graph, false);
    updateNamespaceFontSize(graph, 2);

    expect(graph.drawGrid).toHaveBeenCalledWith({ type: 'dot', args: { color: 'rgba(128, 128, 128, 0.4)', thickness: 1 } });
    expect(setAttrByPath).toHaveBeenCalledWith('label/fontSize', 16);

    const setPosition = vi.fn();
    const setSize = vi.fn();
    fitGroupToChildren({ getCellById: () => ({ id: `${NS_PREFIX}invalid`, isNode: () => false }) } as unknown as GraphType, 'ns:invalid');
    fitGroupToChildren({ getCellById: () => ({ id: `${NS_PREFIX}empty`, isNode: () => true, getChildren: () => [] }) } as unknown as GraphType, 'ns:empty');
    expect(setPosition).not.toHaveBeenCalled();
    expect(setSize).not.toHaveBeenCalled();
  });
});
