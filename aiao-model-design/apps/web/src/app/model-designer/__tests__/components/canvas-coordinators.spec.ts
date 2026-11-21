import { computed, effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Graph as GraphType } from '@antv/x6';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeTopologyKey, relationTopologyKey } from '../../components/canvas/canvas-edge-sync';
import { CanvasMoveCoordinator } from '../../components/canvas/canvas-move-coordinator';
import { CanvasViewportController } from '../../components/canvas/canvas-viewport-controller';
import type { DesignEntity, DesignRelation } from '../../models/index.js';

type Handler = (...args: unknown[]) => void;

function createGraphMock() {
  const handlers = new Map<string, Set<Handler>>();
  let zoom = 1;
  let translation = { tx: 0, ty: 0 };
  const cells = new Map<string, { getProp: (key: string) => unknown }>();
  const nodes: unknown[] = [];
  const emit = (event: string, payload?: unknown) => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  const graph = {
    on: vi.fn((event: string, handler: Handler) => {
      const eventHandlers = handlers.get(event) ?? new Set<Handler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
    }),
    off: vi.fn((event: string, handler: Handler) => handlers.get(event)?.delete(handler)),
    zoom: vi.fn((value?: number) => {
      if (value !== undefined) {
        zoom = value;
        emit('scale');
      }
      return zoom;
    }),
    translate: vi.fn((x?: number, y?: number) => {
      if (x !== undefined && y !== undefined) {
        translation = { tx: x, ty: y };
        emit('translate');
      }
      return translation;
    }),
    centerContent: vi.fn(),
    trigger: vi.fn(),
    getNodes: vi.fn(() => nodes),
    getCellById: vi.fn((id: string) => cells.get(id))
  };
  return {
    cells,
    emit,
    graph: graph as unknown as GraphType,
    graphMock: graph,
    nodes
  };
}

describe('canvas coordinators', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('includes entity coordinates when detecting edge route changes', () => {
    const entity = {
      id: 'entity-0001-0001-0001-000000000001',
      extendsBase: 'EntityBase',
      nodeX: 10,
      nodeY: 20
    } as unknown as DesignEntity;
    const movedEntity = { ...entity, nodeX: 80, nodeY: 90 };

    expect(edgeTopologyKey([movedEntity])).not.toBe(edgeTopologyKey([entity]));
    expect(edgeTopologyKey([{ ...entity, extendsBase: 'TreeEntityBase' }])).not.toBe(edgeTopologyKey([entity]));
    expect(edgeTopologyKey([entity, { ...entity, id: 'entity-0002-0002-0002-000000000002' }])).not.toBe(
      edgeTopologyKey([entity])
    );

    const relation = {
      id: 'relation-1',
      designEntityId: 'entity-1',
      mappedEntityId: 'entity-2',
      mappedPropertyId: 'relation-2',
      relationKind: 'ONE_TO_MANY'
    } as unknown as DesignRelation;
    expect(relationTopologyKey([{ ...relation }])).toBe(relationTopologyKey([relation]));
    expect(relationTopologyKey([{ ...relation, relationKind: 'MANY_TO_MANY' }])).not.toBe(
      relationTopologyKey([relation])
    );
  });

  it('reruns the edge effect when entity coordinates change', () => {
    const entity = { id: 'entity-1', extendsBase: 'EntityBase', nodeX: 10, nodeY: 20 } as unknown as DesignEntity;
    const entities = signal([entity]);
    const relation = {
      id: 'relation-1',
      designEntityId: 'entity-1',
      mappedEntityId: 'entity-2',
      mappedPropertyId: 'relation-2',
      relationKind: 'ONE_TO_MANY'
    } as unknown as DesignRelation;
    const relations = signal([relation]);
    const edgeSync = vi.fn();
    TestBed.runInInjectionContext(() => {
      const topology = computed(() => edgeTopologyKey(entities()));
      const relationTopology = computed(() => relationTopologyKey(relations()));
      effect(() => {
        topology();
        relationTopology();
        edgeSync();
      });
    });
    TestBed.flushEffects();

    entities.set([{ ...entity, nodeX: 80, nodeY: 90 }]);
    relations.set([{ ...relation }]);
    TestBed.flushEffects();
    expect(edgeSync).toHaveBeenCalledTimes(2);

    entities.set([entity, { ...entity, id: 'entity-0002-0002-0002-000000000002' }]);
    TestBed.flushEffects();
    expect(edgeSync).toHaveBeenCalledTimes(3);

    relations.set([{ ...relation, relationKind: 'MANY_TO_MANY' }]);
    TestBed.flushEffects();
    expect(edgeSync).toHaveBeenCalledTimes(4);
  });

  it('coalesces viewport events and removes listeners on destroy', () => {
    const { emit, graph, graphMock } = createGraphMock();
    const viewportChanged = vi.fn();
    const controller = new CanvasViewportController({
      graph,
      container: document.createElement('div'),
      entitiesCount: () => 0,
      storedViewport: () => undefined,
      viewportChanged
    });

    emit('scale');
    emit('translate');
    controller.zoomIn();
    controller.zoomIn();
    vi.advanceTimersByTime(20);

    expect(viewportChanged).toHaveBeenCalledOnce();
    expect(graphMock.zoom).toHaveBeenCalledWith(1.44, { absolute: true });
    controller.destroy();
    expect(graphMock.off).toHaveBeenCalledTimes(2);
  });

  it('restores a stored viewport without emitting a feedback event', () => {
    const { graph, graphMock } = createGraphMock();
    const viewportChanged = vi.fn();
    const initialAligned = vi.fn();
    const controller = new CanvasViewportController({
      graph,
      container: document.createElement('div'),
      entitiesCount: () => 1,
      storedViewport: () => ({ zoom: 1.5, panX: 20, panY: 30 }),
      viewportChanged,
      initialAligned
    });

    controller.alignInitial();
    controller.alignInitial();
    vi.advanceTimersByTime(20);

    expect(graphMock.zoom).toHaveBeenCalledWith(1.5, { absolute: true });
    expect(graphMock.translate).toHaveBeenCalledWith(20, 30);
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(initialAligned).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('flushes the final absolute position and clears it after persistence confirms', () => {
    const { cells, emit, graph, nodes } = createGraphMock();
    const wrapper = document.createElement('div');
    const entitiesMoved = vi.fn();
    const entity = { id: 'entity-1', nodeX: 10, nodeY: 20 } as unknown as DesignEntity;
    const node = {
      id: 'entity-1',
      getBBox: () => ({ x: 80, y: 90 }),
      getParent: () => null
    };
    nodes.push(node);
    const coordinator = new CanvasMoveCoordinator(graph, wrapper, {
      entities: () => [entity],
      isSyncing: () => false,
      entitiesMoved,
      entityResized: vi.fn()
    });

    emit('node:moved', { node });
    wrapper.dispatchEvent(new PointerEvent('pointerup'));
    vi.runOnlyPendingTimers();

    expect(entitiesMoved).toHaveBeenCalledWith([{ id: 'entity-1', x: 80, y: 90 }]);
    expect(coordinator.inFlightIds?.has('entity-1')).toBe(true);
    cells.set('entity-1', { getProp: () => ({ x: 80, y: 90 }) });
    coordinator.clearConfirmed([{ ...entity, nodeX: 80, nodeY: 90 }]);
    expect(coordinator.inFlightIds).toBeUndefined();
    coordinator.destroy();
  });
});
