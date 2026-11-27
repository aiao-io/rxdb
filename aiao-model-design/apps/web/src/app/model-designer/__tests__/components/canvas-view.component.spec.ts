import { TestBed } from '@angular/core/testing';
import type { Graph as GraphType, Selection as SelectionType } from '@antv/x6';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NS_PREFIX } from '../../components/canvas/canvas-constants';
import { initCanvasGraph } from '../../components/canvas/canvas-graph-init';
import {
  syncGraphNodes,
  syncGraphSelection,
  updateGraphTheme,
  updateNamespaceFontSize
} from '../../components/canvas/canvas-node-sync';
import { CanvasViewComponent } from '../../components/canvas/canvas-view.component';
import type { DesignEntity, DesignProperty, DesignRelation } from '../../models/index.js';

type Handler = (payload?: unknown) => void;

type GraphMock = {
  graph: GraphType;
  handlers: Map<string, Handler>;
  graphApi: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    zoom: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    enablePanning: ReturnType<typeof vi.fn>;
    disablePanning: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
  selection: SelectionType;
  selectionApi: {
    enable: ReturnType<typeof vi.fn>;
    disable: ReturnType<typeof vi.fn>;
    enableRubberband: ReturnType<typeof vi.fn>;
    disableRubberband: ReturnType<typeof vi.fn>;
  };
};

function id(value: string): DesignEntity['id'] {
  return value as DesignEntity['id'];
}

function createGraphMock(): GraphMock {
  const handlers = new Map<string, Handler>();
  const graphApi = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    off: vi.fn(),
    zoom: vi.fn(() => 1),
    translate: vi.fn(() => ({ tx: 0, ty: 0 })),
    resize: vi.fn(),
    enablePanning: vi.fn(),
    disablePanning: vi.fn(),
    dispose: vi.fn()
  };
  const selectionApi = {
    enable: vi.fn(),
    disable: vi.fn(),
    enableRubberband: vi.fn(),
    disableRubberband: vi.fn()
  };
  return {
    graph: graphApi as unknown as GraphType,
    handlers,
    graphApi,
    selection: selectionApi as unknown as SelectionType,
    selectionApi
  };
}

const fakeControllers = vi.hoisted(() => ({
  viewport: {
    zoomPercent: vi.fn(() => 100),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setZoomPercent: vi.fn(),
    alignInitial: vi.fn(),
    destroy: vi.fn()
  },
  move: {
    inFlightIds: undefined,
    clearConfirmed: vi.fn(),
    destroy: vi.fn()
  },
  viewportConstructor: vi.fn(),
  moveConstructor: vi.fn()
}));

vi.mock('../../components/canvas/canvas-graph-init', () => ({
  initCanvasGraph: vi.fn()
}));
vi.mock('../../components/canvas/canvas-edge-sync', () => ({
  edgeTopologyKey: vi.fn((entities: readonly { id: string; nodeX?: number; nodeY?: number }[]) =>
    entities.map(entity => `${entity.id}:${entity.nodeX ?? 0}:${entity.nodeY ?? 0}`).join('|')
  ),
  relationTopologyKey: vi.fn((relations: readonly { id: string }[]) =>
    relations.map(relation => relation.id).join('|')
  ),
  syncGraphEdges: vi.fn()
}));
vi.mock('../../components/canvas/canvas-node-sync', () => ({
  syncGraphNodes: vi.fn(),
  syncGraphSelection: vi.fn(),
  updateGraphTheme: vi.fn(),
  updateNamespaceFontSize: vi.fn()
}));
vi.mock('../../components/canvas/canvas-move-coordinator', () => ({
  CanvasMoveCoordinator: class {
    constructor(...args: unknown[]) {
      fakeControllers.moveConstructor(...args);
      return fakeControllers.move;
    }
  }
}));
vi.mock('../../components/canvas/canvas-viewport-controller', () => ({
  CanvasViewportController: class {
    constructor(...args: unknown[]) {
      fakeControllers.viewportConstructor(...args);
      return fakeControllers.viewport;
    }
  }
}));

vi.mock('../../components/canvas/canvas-view.component.scss', () => ({}));

describe('CanvasViewComponent', () => {
  let graphMock: GraphMock;
  let resizeCallback: ResizeObserverCallback | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    graphMock = createGraphMock();
    resizeCallback = undefined;
    class TestResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.mocked(initCanvasGraph).mockResolvedValue({ graph: graphMock.graph, selection: graphMock.selection });
  });

  function setup() {
    TestBed.configureTestingModule({ imports: [CanvasViewComponent] }).overrideComponent(CanvasViewComponent, {
      set: {
        template: `
          <div #wrapper>
            <div #container></div>
            <div #minimap></div>
            <button data-testid="zoom-in" (click)="zoomIn()"></button>
            <button data-testid="zoom-out" (click)="zoomOut()"></button>
            <input data-testid="zoom-range" (input)="onZoomRange($event)" />
          </div>
        `
      }
    });
    const fixture = TestBed.createComponent(CanvasViewComponent);
    const entity = { id: id('e1'), name: 'Order', nodeX: 10, nodeY: 20 } as DesignEntity;
    fixture.componentRef.setInput('schema', { namespace: 'crm' });
    fixture.componentRef.setInput('entities', [entity]);
    fixture.componentRef.setInput('propertiesMap', new Map<string, DesignProperty[]>());
    fixture.componentRef.setInput('relations', [] as DesignRelation[]);
    fixture.componentRef.setInput('relationsMap', new Map());
    fixture.detectChanges();
    return fixture;
  }

  it('initializes the graph, synchronizes data, and handles resize and theme updates', async () => {
    const fixture = setup();
    await fixture.whenStable();
    TestBed.flushEffects();

    expect(initCanvasGraph).toHaveBeenCalledOnce();
    expect(fakeControllers.viewportConstructor).toHaveBeenCalledOnce();
    expect(fakeControllers.moveConstructor).toHaveBeenCalledOnce();
    expect(syncGraphNodes).toHaveBeenCalled();
    expect(syncGraphSelection).toHaveBeenCalled();
    expect(updateGraphTheme).toHaveBeenCalledWith(graphMock.graph, false);

    resizeCallback?.([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(graphMock.graphApi.resize).toHaveBeenCalledWith(800, 600);

    fixture.componentRef.setInput('isDarkMode', true);
    fixture.componentRef.setInput('viewport', { zoom: 0.5, panX: 10, panY: 20 });
    fixture.detectChanges();
    TestBed.flushEffects();
    expect(updateGraphTheme).toHaveBeenCalledWith(graphMock.graph, true);
    expect(updateNamespaceFontSize).toHaveBeenCalledWith(graphMock.graph, 0.5);

    fixture.componentInstance.redrawTheme();
    expect(updateGraphTheme).toHaveBeenCalledWith(graphMock.graph, true);
  });

  it('emits selection and relation events while respecting interaction mode guards', async () => {
    const fixture = setup();
    await fixture.whenStable();
    TestBed.flushEffects();
    const view = fixture.componentInstance;
    const selected = vi.fn();
    const selectionChanged = vi.fn();
    const cleared = vi.fn();
    const relationCreated = vi.fn();
    view.entitySelected.subscribe(selected);
    view.entitySelectionChanged.subscribe(selectionChanged);
    view.selectionCleared.subscribe(cleared);
    view.relationCreated.subscribe(relationCreated);

    graphMock.handlers.get('node:click')?.({ node: { id: 'e1' } });
    graphMock.handlers.get('blank:click')?.();
    graphMock.handlers.get('selection:changed')?.({ selected: [{ id: 'e1' }, { id: `${NS_PREFIX}crm` }] });
    expect(selected).toHaveBeenCalledWith('e1');
    expect(cleared).toHaveBeenCalledOnce();
    expect(selectionChanged).toHaveBeenCalledWith(['e1']);

    const edge = {
      remove: vi.fn(),
      getSourceCell: () => ({ id: 'e1' }),
      getTargetCell: () => ({ id: 'e2' })
    };
    graphMock.handlers.get('edge:connected')?.({ edge });
    expect(edge.remove).toHaveBeenCalledOnce();
    expect(relationCreated).toHaveBeenCalledWith({ sourceEntityId: 'e1', targetEntityId: 'e2' });

    fixture.componentRef.setInput('interactionMode', 'select');
    fixture.detectChanges();
    TestBed.flushEffects();
    expect(graphMock.selectionApi.enable).toHaveBeenCalled();
    expect(graphMock.selectionApi.enableRubberband).toHaveBeenCalled();
    expect(graphMock.graphApi.disablePanning).toHaveBeenCalled();
    graphMock.handlers.get('node:click')?.({ node: { id: 'e1' } });
    expect(selected).toHaveBeenCalledTimes(1);

    graphMock.handlers.get('edge:connected')?.({
      edge: {
        remove: vi.fn(),
        getSourceCell: () => ({ id: 'e1' }),
        getTargetCell: () => ({ id: 'e1' })
      }
    });
    expect(relationCreated).toHaveBeenCalledTimes(1);
  });

  it('routes zoom controls and disposes graph resources', async () => {
    const fixture = setup();
    await fixture.whenStable();
    TestBed.flushEffects();

    (fixture.nativeElement.querySelector('[data-testid="zoom-in"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="zoom-out"]') as HTMLButtonElement).click();
    const range = fixture.nativeElement.querySelector('[data-testid="zoom-range"]') as HTMLInputElement;
    range.value = '125';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(fakeControllers.viewport.zoomIn).toHaveBeenCalledOnce();
    expect(fakeControllers.viewport.zoomOut).toHaveBeenCalledOnce();
    expect(fakeControllers.viewport.setZoomPercent).toHaveBeenCalledWith(125);
    fixture.destroy();
    expect(fakeControllers.viewport.destroy).toHaveBeenCalledOnce();
    expect(fakeControllers.move.destroy).toHaveBeenCalledOnce();
    expect(graphMock.graphApi.dispose).toHaveBeenCalledOnce();
  });

  it('ignores namespace node clicks and invalid relation endpoints', async () => {
    const fixture = setup();
    await fixture.whenStable();
    TestBed.flushEffects();
    const selected = vi.fn();
    const relationCreated = vi.fn();
    fixture.componentInstance.entitySelected.subscribe(selected);
    fixture.componentInstance.relationCreated.subscribe(relationCreated);

    graphMock.handlers.get('node:click')?.({ node: { id: `${NS_PREFIX}crm` } });
    graphMock.handlers.get('edge:connected')?.({
      edge: {
        remove: vi.fn(),
        getSourceCell: () => ({ id: `${NS_PREFIX}crm` }),
        getTargetCell: () => ({ id: 'e1' })
      }
    });
    graphMock.handlers.get('edge:connected')?.({
      edge: {
        remove: vi.fn(),
        getSourceCell: () => undefined,
        getTargetCell: () => ({ id: 'e1' })
      }
    });

    expect(selected).not.toHaveBeenCalled();
    expect(relationCreated).not.toHaveBeenCalled();
  });
});
