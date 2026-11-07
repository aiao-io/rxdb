import type { DesignEntity, DesignProperty, DesignRelation, ModelDesign } from '../../models/index.js';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import type { Graph as GraphType, Selection as SelectionType } from '@antv/x6';
import type { InteractionMode } from '../../interfaces/designer.interface';
import { NS_PREFIX } from './canvas-constants';
import { edgeTopologyKey, relationTopologyKey, syncGraphEdges } from './canvas-edge-sync';
import { initCanvasGraph } from './canvas-graph-init';
import { CanvasMoveCoordinator } from './canvas-move-coordinator';
import { syncGraphNodes, syncGraphSelection, updateGraphTheme, updateNamespaceFontSize } from './canvas-node-sync';
import { CanvasViewportController } from './canvas-viewport-controller';

/**
 * 画布视图组件
 *
 * 使用 AntV X6 图引擎渲染 ER 图。
 * 支持实体的拖拽、缩放、选择、关系连线等功能。
 */
@Component({
  selector: 'lib-canvas-view',
  templateUrl: './canvas-view.component.html',
  styleUrl: './canvas-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasViewComponent implements AfterViewInit, OnDestroy {
  readonly #injector = inject(Injector);
  #graph?: GraphType;
  #selection?: SelectionType;
  #resizeObserver?: ResizeObserver;
  #moveCoordinator?: CanvasMoveCoordinator;
  readonly #viewportController = signal<CanvasViewportController | undefined>(undefined);
  #syncing = false;
  #edgeSyncRaf = 0;
  #selectionSyncing = false;
  #destroyed = false;

  readonly zoomPercent = computed(() => this.#viewportController()?.zoomPercent() ?? 100);

  readonly schema = input<ModelDesign | null>(null);
  readonly entities = input.required<DesignEntity[]>();
  readonly invalidRelationIds = input<ReadonlySet<string>>(new Set());
  readonly invalidPropertyIds = input<ReadonlySet<string>>(new Set());
  readonly propertiesMap = input.required<Map<string, DesignProperty[]>>();
  readonly relations = input.required<DesignRelation[]>();
  readonly relationsMap = input<Map<string, DesignRelation[]>>(new Map());
  readonly isDarkMode = input(false);
  readonly viewport = input<{ zoom: number; panX: number; panY: number }>();
  readonly selectedEntityIds = input<ReadonlySet<string>>(new Set());
  readonly interactionMode = input<InteractionMode>('move');
  readonly panelWidth = input(0);

  readonly entitySelected = output<string>();
  readonly entitySelectionToggled = output<string>();
  readonly entitySelectionChanged = output<string[]>();
  readonly selectionCleared = output<void>();
  readonly entityMoved = output<{ id: string; x: number; y: number }>();
  readonly entitiesMovedBatch = output<{ id: string; x: number; y: number }[]>();
  readonly entityResized = output<{ id: string; width: number }>();
  readonly relationCreated = output<{ sourceEntityId: string; targetEntityId: string }>();
  readonly viewportChanged = output<{ zoom: number; panX: number; panY: number }>();

  readonly wrapper = viewChild.required<ElementRef<HTMLElement>>('wrapper');
  readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  readonly minimap = viewChild.required<ElementRef<HTMLElement>>('minimap');

  constructor() {
    const edgeTopology = computed(() => edgeTopologyKey(this.entities()));
    const relationTopology = computed(() => relationTopologyKey(this.relations()));

    effect(() => {
      const mode = this.interactionMode();
      this.#applyInteractionMode(mode);
    });

    effect(() => {
      const isDark = this.isDarkMode();
      if (this.#graph) updateGraphTheme(this.#graph, isDark);
    });

    effect(() => {
      const vp = this.viewport();
      if (!this.#graph) return;
      updateNamespaceFontSize(this.#graph, vp?.zoom ?? this.#graph.zoom());
    });

    effect(() => {
      const entities = this.entities();
      const invalidRelationIds = this.invalidRelationIds();
      const invalidPropertyIds = this.invalidPropertyIds();
      const propsMap = this.propertiesMap();
      const relMap = this.relationsMap();
      const selectedIds = this.selectedEntityIds();
      if (this.#graph) {
        this.#syncGraph(entities, propsMap, relMap, selectedIds, invalidRelationIds, invalidPropertyIds);
      }
    });

    effect(() => {
      edgeTopology();
      relationTopology();
      if (this.#graph) this.#scheduleEdgeSync(untracked(this.relations), untracked(this.entities));
    });
  }

  async ngAfterViewInit() {
    const containerEl = this.container().nativeElement;
    const result = await initCanvasGraph(containerEl, this.minimap().nativeElement, this.#injector);
    this.#graph = result.graph;
    this.#selection = result.selection;
    if (this.#destroyed) {
      this.#graph.dispose();
      return;
    }
    this.#viewportController.set(
      new CanvasViewportController({
        graph: this.#graph,
        container: containerEl,
        entitiesCount: () => this.entities().length,
        storedViewport: () => this.viewport(),
        viewportChanged: viewport => this.viewportChanged.emit(viewport),
        initialAligned: () => this.#scheduleEdgeSync(this.relations(), this.entities())
      })
    );
    this.#moveCoordinator = new CanvasMoveCoordinator(this.#graph, this.wrapper().nativeElement, {
      entities: () => this.entities(),
      isSyncing: () => this.#syncing,
      entitiesMoved: items => this.entitiesMovedBatch.emit(items),
      entityResized: item => this.entityResized.emit(item)
    });
    this.#applyInteractionMode(this.interactionMode());
    this.#setupEvents();
    updateGraphTheme(this.#graph, this.isDarkMode());
    this.#resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        this.#graph?.resize(width, height);
        this.#viewportController()?.alignInitial();
      }
    });
    this.#resizeObserver.observe(this.wrapper().nativeElement);

    this.#syncGraph(
      this.entities(),
      this.propertiesMap(),
      this.relationsMap(),
      this.selectedEntityIds(),
      this.invalidRelationIds(),
      this.invalidPropertyIds()
    );
    this.#scheduleEdgeSync(this.relations(), this.entities());
    // 不在此处调用 #alignInitialViewport：ResizeObserver 的首次回调会在
    // graph.resize() 后触发，确保 centerContent/restoreViewport 在画布尺寸正确后执行。
  }

  redrawTheme() {
    if (this.#graph) {
      updateGraphTheme(this.#graph, this.isDarkMode());
    }
  }

  ngOnDestroy() {
    this.#destroyed = true;
    cancelAnimationFrame(this.#edgeSyncRaf);
    this.#moveCoordinator?.destroy();
    this.#viewportController()?.destroy();
    this.#resizeObserver?.disconnect();
    this.#graph?.dispose();
  }

  protected zoomIn() {
    this.#viewportController()?.zoomIn();
  }

  protected zoomOut() {
    this.#viewportController()?.zoomOut();
  }

  protected onZoomRange(e: Event) {
    this.#viewportController()?.setZoomPercent(Number((e.target as HTMLInputElement).value));
  }

  #setupEvents() {
    if (!this.#graph) return;

    this.#graph.on('node:click', ({ node }) => {
      if (node.id.startsWith(NS_PREFIX)) return;
      // select 模式由 X6 Selection 插件处理（含 metaKey toggle），统一走 selection:changed
      if (this.interactionMode() === 'select') return;
      this.entitySelected.emit(node.id);
    });

    this.#graph.on('blank:click', () => {
      this.selectionCleared.emit();
    });

    this.#graph.on('node:moved', () => this.#scheduleEdgeSync(this.relations(), this.entities()));
    this.#graph.on('node:resized', () => this.#scheduleEdgeSync(this.relations(), this.entities()));

    this.#graph.on('selection:changed', ({ selected }: { selected: { id: string }[] }) => {
      if (this.#selectionSyncing || this.#destroyed) return;
      const newIds = selected.filter(n => !n.id.startsWith(NS_PREFIX)).map(n => n.id);
      this.entitySelectionChanged.emit(newIds);
    });

    this.#graph.on('edge:connected', ({ edge }) => {
      const source = edge.getSourceCell();
      const target = edge.getTargetCell();
      // 临时拖拽边始终移除；有效 pair 由 relationCreated → RxDB → syncGraphEdges 重绘
      edge.remove();
      if (!source || !target || source.id === target.id) return;
      if (source.id.startsWith(NS_PREFIX) || target.id.startsWith(NS_PREFIX)) return;
      this.relationCreated.emit({ sourceEntityId: source.id, targetEntityId: target.id });
    });
  }

  /** 切换移动/选择交互模式 */
  #applyInteractionMode(mode: InteractionMode) {
    if (!this.#graph || !this.#selection) return;
    // 守卫：disable/enable 可能触发 selection:changed，需忽略
    this.#selectionSyncing = true;
    try {
      if (mode === 'select') {
        this.#selection.enable();
        this.#selection.enableRubberband();
        this.#graph.disablePanning();
      } else {
        this.#selection.disable();
        this.#selection.disableRubberband();
        this.#graph.enablePanning();
      }
    } finally {
      this.#selectionSyncing = false;
    }
  }

  #scheduleEdgeSync(relations: DesignRelation[], entities: DesignEntity[]) {
    cancelAnimationFrame(this.#edgeSyncRaf);
    this.#edgeSyncRaf = requestAnimationFrame(() => {
      this.#edgeSyncRaf = 0;
      if (this.#destroyed || !this.#graph) return;
      this.#syncing = true;
      try {
        syncGraphEdges(this.#graph, relations, entities);
      } finally {
        this.#syncing = false;
      }
    });
  }

  #syncGraph(
    entities: DesignEntity[],
    propsMap: Map<string, DesignProperty[]>,
    relMap: Map<string, DesignRelation[]>,
    selectedIds: ReadonlySet<string>,
    invalidRelationIds: ReadonlySet<string>,
    invalidPropertyIds: ReadonlySet<string>
  ) {
    const graph = this.#graph;
    if (!graph) return;
    this.#syncing = true;
    try {
      syncGraphNodes(
        graph,
        entities,
        propsMap,
        relMap,
        selectedIds,
        invalidRelationIds,
        this.schema()?.namespace ?? 'public',
        new Map(entities.map(e => [e.id, e.name])),
        invalidPropertyIds,
        this.#moveCoordinator?.inFlightIds
      );
      this.#moveCoordinator?.clearConfirmed(entities);
      this.#selectionSyncing = true;
      syncGraphSelection(graph, this.#selection, selectedIds, this.interactionMode());
    } finally {
      this.#selectionSyncing = false;
      this.#syncing = false;
    }
  }
}
