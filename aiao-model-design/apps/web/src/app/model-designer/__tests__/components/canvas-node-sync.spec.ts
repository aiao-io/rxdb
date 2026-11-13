import { describe, expect, it } from 'vitest';
import { syncFieldPorts } from '../../components/canvas/canvas-node-sync';

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
