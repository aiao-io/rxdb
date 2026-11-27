import { computed, signal } from '@angular/core';
import type { Graph as GraphType } from '@antv/x6';

/** Persisted X6 viewport state. */
export interface CanvasViewport {
  /** Absolute graph zoom factor. */
  zoom: number;
  /** Horizontal graph translation. */
  panX: number;
  /** Vertical graph translation. */
  panY: number;
}

interface CanvasViewportOptions {
  graph: GraphType;
  container: HTMLElement;
  entitiesCount: () => number;
  storedViewport: () => CanvasViewport | undefined;
  viewportChanged: (viewport: CanvasViewport) => void;
  initialAligned?: () => void;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

/** Owns wheel zoom, viewport persistence, and initial canvas alignment. */
export class CanvasViewportController {
  readonly #graph: GraphType;
  readonly #entitiesCount: () => number;
  readonly #storedViewport: () => CanvasViewport | undefined;
  readonly #viewportChanged: (viewport: CanvasViewport) => void;
  readonly #initialAlignedCallback: () => void;
  readonly #wheelAbort = new AbortController();
  readonly #currentZoom = signal(1);
  #emitRaf = 0;
  #initialRaf = 0;
  #initialTimeout = 0;
  #destroyed = false;
  #applying = false;
  #initialAligned = false;
  /** Current graph zoom as an integer percentage. */
  readonly zoomPercent = computed(() => Math.round(this.#currentZoom() * 100));

  constructor(options: CanvasViewportOptions) {
    this.#graph = options.graph;
    this.#entitiesCount = options.entitiesCount;
    this.#storedViewport = options.storedViewport;
    this.#viewportChanged = options.viewportChanged;
    this.#initialAlignedCallback = options.initialAligned ?? (() => undefined);
    options.container.addEventListener('wheel', event => this.#onWheel(event), {
      passive: false,
      signal: this.#wheelAbort.signal
    });
    this.#graph.on('scale', this.#scheduleEmit);
    this.#graph.on('translate', this.#scheduleEmit);
  }

  /** Increases the graph zoom by one mouse-wheel step. */
  zoomIn(): void {
    this.#setZoom(Math.min(MAX_SCALE, this.#graph.zoom() * 1.2));
  }

  /** Decreases the graph zoom by one mouse-wheel step. */
  zoomOut(): void {
    this.#setZoom(Math.max(MIN_SCALE, this.#graph.zoom() / 1.2));
  }

  /** Applies an absolute percentage from the zoom range control. */
  setZoomPercent(percent: number): void {
    this.#setZoom(Math.max(MIN_SCALE, Math.min(MAX_SCALE, percent / 100)));
  }

  /** Restores a persisted viewport or centers the first non-empty graph. */
  alignInitial(): void {
    if (this.#initialAligned || this.#destroyed) return;
    const storedViewport = this.#storedViewport();
    if (storedViewport) {
      this.#apply(storedViewport);
      this.#initialAligned = true;
      this.#initialAlignedCallback();
      return;
    }
    cancelAnimationFrame(this.#initialRaf);
    clearTimeout(this.#initialTimeout);
    this.#initialRaf = requestAnimationFrame(() => {
      if (this.#destroyed || this.#initialAligned) return;
      this.#initialTimeout = window.setTimeout(() => this.#centerContent(), 17);
      this.#initialAligned = true;
    });
  }

  /** Cancels pending viewport work and DOM listeners. */
  destroy(): void {
    this.#destroyed = true;
    cancelAnimationFrame(this.#emitRaf);
    cancelAnimationFrame(this.#initialRaf);
    clearTimeout(this.#initialTimeout);
    this.#wheelAbort.abort();
    this.#graph.off('scale', this.#scheduleEmit);
    this.#graph.off('translate', this.#scheduleEmit);
  }

  readonly #scheduleEmit = (): void => {
    if (this.#applying || this.#emitRaf !== 0) return;
    this.#emitRaf = requestAnimationFrame(() => {
      this.#emitRaf = 0;
      if (this.#destroyed || this.#applying) return;
      const zoom = this.#graph.zoom();
      const { tx, ty } = this.#graph.translate();
      this.#currentZoom.set(zoom);
      this.#viewportChanged({ zoom, panX: tx, panY: ty });
    });
  };

  #onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.#destroyed) return;
    const current = this.#graph.zoom();
    const factor =
      event.ctrlKey || Math.abs(event.deltaY) < 40 ? Math.exp(-event.deltaY * 0.003)
      : event.deltaY > 0 ? 1 / 1.2
      : 1.2;
    this.#setZoom(Math.max(MIN_SCALE, Math.min(MAX_SCALE, current * factor)));
  }

  #setZoom(zoom: number): void {
    this.#graph.zoom(zoom, { absolute: true });
  }

  #apply(viewport: CanvasViewport): void {
    this.#applying = true;
    this.#graph.zoom(viewport.zoom, { absolute: true });
    this.#graph.translate(viewport.panX, viewport.panY);
    this.#applying = false;
    this.#currentZoom.set(viewport.zoom);
  }

  #centerContent(): void {
    this.#initialTimeout = 0;
    if (this.#destroyed) return;
    if (this.#entitiesCount() > 0) this.#graph.centerContent();
    this.#initialAlignedCallback();
  }
}
