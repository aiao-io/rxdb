import type { Graph as GraphType, Selection as SelectionType } from '@antv/x6';
import { describe, expect, it, vi } from 'vitest';
import { NS_PREFIX } from '../../components/canvas/canvas-constants';
import {
  fitGroupToChildren,
  syncFieldPorts,
  syncGraphSelection,
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
