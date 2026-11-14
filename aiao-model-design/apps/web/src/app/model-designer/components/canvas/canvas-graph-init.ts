import type { Injector } from '@angular/core';
import type { Graph as GraphType, Selection as SelectionType } from '@antv/x6';
import { Graph, MiniMap, Selection } from '@antv/x6';
import { AngularShapeView, register } from '@antv/x6-angular-shape';
import { clearAngularShapeContainer } from './canvas-angular-content';
import { EDGE_COLOR, NS_PREFIX, PORT_COLOR } from './canvas-constants';
import { ErEntityNodeComponent } from './er-entity-node.component';

class SafeAngularShapeView extends AngularShapeView {
  protected override unmountAngularContent(): HTMLDivElement {
    const container = this.getNodeContainer();
    clearAngularShapeContainer(container);
    return container ?? (this.container as HTMLDivElement);
  }
}

/** initCanvasGraph 的返回值 */
export interface CanvasGraphInit {
  graph: GraphType;
  selection: SelectionType;
}

/**
 * 创建并初始化 X6 画布：注册自定义形状、创建 Graph / MiniMap / Selection
 */
export async function initCanvasGraph(
  container: HTMLElement,
  minimapEl: HTMLElement,
  injector: Injector
): Promise<CanvasGraphInit> {
  Graph.registerView('angular-shape-view', SafeAngularShapeView, true);
  register({
    shape: 'er-entity',
    width: 240,
    height: 200,
    content: ErEntityNodeComponent,
    injector,
    ports: {
      groups: {
        'field-left': {
          position: { name: 'absolute' },
          attrs: { circle: { r: 4, magnet: true, stroke: PORT_COLOR, fill: '#fff', strokeWidth: 1 } }
        },
        'field-right': {
          position: { name: 'absolute' },
          attrs: { circle: { r: 4, magnet: true, stroke: PORT_COLOR, fill: '#fff', strokeWidth: 1 } }
        },
        'entity-left': {
          position: { name: 'absolute' },
          attrs: { circle: { r: 5, magnet: true, stroke: PORT_COLOR, fill: '#fff', strokeWidth: 1.5 } }
        },
        'entity-right': {
          position: { name: 'absolute' },
          attrs: { circle: { r: 5, magnet: true, stroke: PORT_COLOR, fill: '#fff', strokeWidth: 1.5 } }
        }
      }
    }
  });

  Graph.unregisterEdge('er-relationship');
  Graph.registerEdge('er-relationship', {
    inherit: 'edge',
    attrs: {
      line: { stroke: EDGE_COLOR, strokeWidth: 2, targetMarker: { name: 'classic', size: 8 } }
    },
    connector: { name: 'jumpover', args: { radius: 6, type: 'arc' } },
    router: {
      name: 'manhattan',
      args: {
        padding: 20,
        step: 10,
        maxDirectionChange: 90,
        startDirections: ['left', 'right'],
        endDirections: ['left', 'right'],
        excludeShapes: ['namespace-group']
      }
    },
    labels: [
      {
        attrs: {
          text: { text: '1:1', fill: EDGE_COLOR, fontSize: 12, fontWeight: 'bold' },
          rect: { fill: '#fff', stroke: EDGE_COLOR, rx: 3, ry: 3 }
        }
      }
    ]
  });

  Graph.unregisterNode('namespace-group');
  Graph.registerNode(
    'namespace-group',
    {
      inherit: 'rect',
      markup: [
        { tagName: 'rect', selector: 'body' },
        { tagName: 'text', selector: 'label' }
      ],
      attrs: {
        body: {
          fill: 'rgba(95, 149, 255, 0.05)',
          stroke: '#5F95FF',
          strokeWidth: 1,
          strokeDasharray: '5 5',
          rx: 8,
          ry: 8
        },
        label: {
          fontSize: 16,
          fontWeight: 'bold',
          fill: '#5F95FF',
          textAnchor: 'start',
          textVerticalAnchor: 'top',
          refX: 10,
          refY: 10
        }
      }
    },
    true
  );

  const graphBox: { ref?: GraphType } = {};
  const graph = new Graph({
    container,
    async: true,
    virtual: true,
    grid: { visible: true, type: 'dot', args: { color: 'rgba(128, 128, 128, 0.4)' } },
    mousewheel: { enabled: false },
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'rightMouseDown'] },
    connecting: {
      // 仅 port 圆点可起线（节点 body 无 magnet）；连接合法性见 validateConnection
      validateMagnet: ({ magnet }) => !!magnet,
      validateConnection: ({ sourceCell, targetCell, sourceMagnet, targetMagnet }) => {
        if (!sourceCell || !targetCell || sourceCell.id === targetCell.id) return false;
        if (sourceCell.id.startsWith(NS_PREFIX) || targetCell.id.startsWith(NS_PREFIX)) return false;
        if (!sourceMagnet || !targetMagnet) return false;
        return true;
      },
      allowLoop: false,
      allowMulti: false,
      highlight: true,
      router: {
        name: 'manhattan',
        args: {
          padding: 20,
          step: 10,
          maxDirectionChange: 90,
          startDirections: ['left', 'right'],
          endDirections: ['left', 'right'],
          excludeShapes: ['namespace-group']
        }
      },
      connector: { name: 'jumpover', args: { radius: 6, type: 'arc' } },
      createEdge: () => {
        const graph = graphBox.ref;
        if (!graph) throw new Error('Canvas graph is not initialized');
        return graph.createEdge({ shape: 'er-relationship' });
      }
    }
  });
  graphBox.ref = graph;

  const miniMap = new MiniMap({
    container: minimapEl,
    width: 200,
    height: 160,
    padding: 10,
    scalable: false,
    minScale: 0.3,
    maxScale: 3
  });
  graph.use(miniMap);

  const selection = new Selection({
    enabled: false,
    multiple: true,
    rubberband: false,
    movable: true,
    following: true,
    showNodeSelectionBox: true,
    filter: node => !('id' in node && typeof node.id === 'string' && node.id.startsWith(NS_PREFIX))
  });
  graph.use(selection);

  return { graph, selection };
}
