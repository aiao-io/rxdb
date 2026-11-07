import type { DesignEntity } from '../../models/index.js';
import type { Graph as GraphType, Node as NodeType } from '@antv/x6';
import { NS_PREFIX } from './canvas-constants';
import { asNodeLike, nodeChildren, parentGroupId } from './canvas-edge-utils';
import { fitGroupToChildren } from './canvas-node-sync';

interface CanvasMoveCallbacks {
  entities: () => DesignEntity[];
  isSyncing: () => boolean;
  entitiesMoved: (items: { id: string; x: number; y: number }[]) => void;
  entityResized: (item: { id: string; width: number }) => void;
}

/** Coordinates X6 move events and persists final absolute node positions. */
export class CanvasMoveCoordinator {
  readonly #graph: GraphType;
  readonly #callbacks: CanvasMoveCallbacks;
  readonly #dirtyIds = new Set<string>();
  readonly #inFlightIds = new Set<string>();
  readonly #eventsAbort = new AbortController();
  #moveFlushTimeout = 0;
  #minimapRefreshRaf = 0;
  #destroyed = false;

  /** Node IDs whose local graph positions are awaiting persistence confirmation. */
  get inFlightIds(): ReadonlySet<string> | undefined {
    return this.#inFlightIds.size > 0 ? this.#inFlightIds : undefined;
  }

  constructor(graph: GraphType, wrapper: HTMLElement, callbacks: CanvasMoveCallbacks) {
    this.#graph = graph;
    this.#callbacks = callbacks;
    this.#bindGraphEvents();
    wrapper.addEventListener('pointerup', () => this.#scheduleMoveFlush(), {
      signal: this.#eventsAbort.signal
    });
  }

  /** Removes node IDs whose persisted positions now match the graph. */
  clearConfirmed(entities: DesignEntity[]): void {
    if (this.#inFlightIds.size === 0) return;
    const entityMap = new Map<string, DesignEntity>(entities.map(entity => [entity.id, entity]));
    for (const id of this.#inFlightIds) {
      const entity = entityMap.get(id);
      if (!entity) {
        this.#inFlightIds.delete(id);
        continue;
      }
      const position = this.#graph.getCellById(id)?.getProp('position');
      if (position?.x === entity.nodeX && position?.y === entity.nodeY) this.#inFlightIds.delete(id);
    }
  }

  /** Cancels pending DOM and animation work. */
  destroy(): void {
    this.#destroyed = true;
    clearTimeout(this.#moveFlushTimeout);
    cancelAnimationFrame(this.#minimapRefreshRaf);
    this.#dirtyIds.clear();
    this.#eventsAbort.abort();
  }

  #bindGraphEvents(): void {
    this.#graph.on('node:moved', ({ node }) => {
      if (this.#callbacks.isSyncing()) return;
      if (node.id.startsWith(NS_PREFIX)) {
        this.#markGroupChildren(node);
        return;
      }
      this.#markNode(node);
      this.#scheduleMinimapRefresh();
    });

    this.#graph.on('node:resized', ({ node }) => {
      if (this.#callbacks.isSyncing() || node.id.startsWith(NS_PREFIX)) return;
      this.#callbacks.entityResized({ id: node.id, width: node.size().width });
      this.#fitParent(node);
    });

    this.#graph.on('node:change:position', ({ node }) => {
      if (this.#callbacks.isSyncing() || node.id.startsWith(NS_PREFIX)) return;
      this.#markNode(node);
    });
  }

  #markGroupChildren(node: NodeType): void {
    const group = asNodeLike(node);
    if (!group) return;
    for (const child of nodeChildren(group)) {
      if (child.isNode?.() && !child.id.startsWith(NS_PREFIX)) this.#dirtyIds.add(child.id);
    }
    this.#scheduleMinimapRefresh();
  }

  #markNode(node: NodeType): void {
    this.#dirtyIds.add(node.id);
    this.#fitParent(node);
  }

  #fitParent(node: NodeType): void {
    const groupId = parentGroupId(node, NS_PREFIX);
    if (groupId) fitGroupToChildren(this.#graph, groupId);
  }

  #scheduleMoveFlush(): void {
    if (this.#dirtyIds.size === 0) return;
    clearTimeout(this.#moveFlushTimeout);
    this.#moveFlushTimeout = window.setTimeout(() => this.#flushMoves(), 0);
  }

  #flushMoves(): void {
    this.#moveFlushTimeout = 0;
    if (this.#destroyed) return;
    const dirtyIds = new Set(this.#dirtyIds);
    this.#dirtyIds.clear();
    const entityMap = new Map<string, DesignEntity>(this.#callbacks.entities().map(entity => [entity.id, entity]));
    const items: { id: string; x: number; y: number }[] = [];
    for (const node of this.#graph.getNodes()) {
      if (!dirtyIds.has(node.id)) continue;
      const entity = entityMap.get(node.id);
      if (!entity) continue;
      const { x, y } = node.getBBox();
      if (x !== entity.nodeX || y !== entity.nodeY) items.push({ id: node.id, x, y });
    }
    if (items.length === 0) return;
    for (const item of items) this.#inFlightIds.add(item.id);
    this.#callbacks.entitiesMoved(items);
  }

  #scheduleMinimapRefresh(): void {
    cancelAnimationFrame(this.#minimapRefreshRaf);
    this.#minimapRefreshRaf = requestAnimationFrame(() => {
      if (!this.#destroyed) this.#graph.trigger('model:updated');
    });
  }
}
