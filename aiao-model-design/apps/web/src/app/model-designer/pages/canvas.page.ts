import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  untracked,
  viewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { Lasso, LucideAngularModule, MousePointer } from 'lucide-angular';
import { CanvasViewComponent } from '../components/canvas/canvas-view.component';
import { EntityPanelComponent } from '../components/panels/entity-panel.component';
import { SelectionSummaryComponent } from '../components/panels/selection-summary.component';
import { MODEL_DESIGNER_TRANSLATIONS } from '../i18n';
import { MODEL_DESIGNER_CONFIG } from '../interfaces/designer.interface';
import { DesignerStateService } from '../services/designer-state.service';

/**
 * 画布路由页面组件
 *
 * 路由：model-designer/canvas 或 model-designer/canvas/:entityId
 */
@Component({
  selector: 'lib-canvas-page',
  imports: [LucideAngularModule, CanvasViewComponent, EntityPanelComponent, SelectionSummaryComponent],
  template: `
    @if (isBrowser) {
      <!-- 交互模式切换 -->
      <div class="absolute top-4 left-4 z-1 flex flex-col gap-2">
        <div class="join join-vertical shadow-lg">
          <button
            class="join-item btn btn-sm"
            [class.btn-primary]="state.interactionMode() === 'move'"
            [title]="t().toolbar.singleSelectMode"
            (click)="state.toggleInteractionMode('move')"
          >
            <lucide-icon class="h-4 w-4" [img]="MousePointer" />
          </button>
          <button
            class="join-item btn btn-sm"
            [class.btn-primary]="state.interactionMode() === 'select'"
            [title]="t().toolbar.rubberSelectMode"
            (click)="state.toggleInteractionMode('select')"
          >
            <lucide-icon class="h-4 w-4" [img]="Lasso" />
          </button>
        </div>
      </div>
      <lib-canvas-view
        class="flex-1"
        [entities]="state.entities()"
        [interactionMode]="state.interactionMode()"
        [invalidPropertyIds]="state.invalidPropertyIds()"
        [invalidRelationIds]="state.invalidRelationIds()"
        [isDarkMode]="isDarkMode()"
        [panelWidth]="state.selectedEntityIds().size > 0 ? 320 : 0"
        [propertiesMap]="state.propertiesMap()"
        [relations]="state.allRelations()"
        [relationsMap]="state.relationsMap()"
        [schema]="state.modelDesign.activeDesign()"
        [selectedEntityIds]="state.selectedEntityIds()"
        [viewport]="state.viewport()"
        (entitiesMovedBatch)="state.onEntitiesMovedBatch($event)"
        (entityMoved)="state.onEntityMoved($event)"
        (entityResized)="state.onEntityResized($event)"
        (entitySelected)="onCanvasEntitySelected($event)"
        (entitySelectionChanged)="onCanvasSelectionChanged($event)"
        (entitySelectionToggled)="onCanvasSelectionToggled($event)"
        (relationCreated)="state.onRelationCreated($event)"
        (selectionCleared)="onCanvasSelectionCleared()"
        (viewportChanged)="state.onViewportChanged($event)"
      />
      @if (state.selectedEntities().length === 1) {
        <lib-entity-panel
          class="absolute top-0 right-0 h-full shadow-lg"
          [allRelations]="state.allRelations()"
          [childPropertiesMap]="state.childPropertiesMap()"
          [entities]="state.entityPairs()"
          [entity]="state.selectedEntity()"
          [indexes]="state.selectedEntityIndexes()"
          [invalidRelationIds]="state.invalidRelationIds()"
          [properties]="state.selectedEntityProperties()"
          [relationErrors]="state.modelValidation().relationErrors"
          [relations]="state.selectedEntityRelations()"
          (childPropertyAdded)="state.onChildPropertyAdded($event)"
          (childPropertyDeleted)="state.onChildPropertyDeleted($event)"
          (childPropertyUpdated)="state.onChildPropertyUpdated($event)"
          (closed)="onCanvasSelectionCleared()"
          (entityDeleted)="state.onEntityDeleted($event)"
          (entityUpdated)="state.onEntityUpdated($event)"
          (indexAdded)="state.onIndexAdded($event)"
          (indexDeleted)="state.onIndexDeleted($event)"
          (indexesDeleteBatch)="state.onIndexesDeleteBatch($event)"
          (indexUpdated)="state.onIndexUpdated($event)"
          (propertyAdded)="state.onPropertyAdded($event)"
          (propertyDeleted)="state.onPropertyDeleted($event)"
          (propertyUpdated)="state.onPropertyUpdated($event)"
          (relationAdded)="state.onRelationAdded($event)"
          (relationDeleted)="state.onRelationDeleted($event)"
          (relationUpdated)="state.onRelationUpdated($event)"
        />
      } @else if (state.selectedEntities().length > 1) {
        <lib-selection-summary
          class="absolute top-0 right-0 h-full shadow-lg"
          [count]="state.selectedEntities().length"
          (clearSelection)="onCanvasSelectionCleared()"
          (deleteSelected)="state.onDeleteSelectedEntities()"
        />
      }
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class CanvasPage {
  readonly #router = inject(Router);
  readonly #config = inject(MODEL_DESIGNER_CONFIG, { optional: true });
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly state = inject(DesignerStateService);
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly MousePointer = MousePointer;
  readonly Lasso = Lasso;

  readonly entityId = input<string>();

  readonly isDarkMode = computed(() => this.#config?.isDarkMode() ?? false);
  readonly theme = computed(() => this.#config?.theme());

  canvasViewComponent = viewChild(CanvasViewComponent);
  entityPanelComponent = viewChild(EntityPanelComponent);

  constructor() {
    effect(() => {
      const id = this.entityId();
      if (id) {
        // 用 untracked 避免对 selectedEntityIds 产生依赖追踪
        const current = untracked(() => this.state.selectedEntityIds());
        if (!current.has(id)) {
          this.state.onEntitySelected(id);
        }
      } else {
        this.state.onSelectionCleared();
      }
    });
  }

  onCanvasEntitySelected(id: string) {
    this.state.onEntitySelected(id);
    this.#router.navigate(['model-designer', 'canvas', id]);
  }

  onCanvasSelectionToggled(id: string) {
    this.state.onEntitySelectionToggled(id);
    this.#navigateToLastSelected();
  }

  onCanvasSelectionChanged(ids: string[]) {
    this.state.onEntitySelectionChanged(ids);
    this.#navigateToLastSelected();
  }

  onCanvasSelectionCleared() {
    this.state.onSelectionCleared();
    this.#router.navigate(['model-designer', 'canvas']);
  }

  #navigateToLastSelected() {
    const ids = this.state.selectedEntityIds();
    const lastId = [...ids].pop();
    if (lastId) {
      this.#router.navigate(['model-designer', 'canvas', lastId]);
    } else {
      this.#router.navigate(['model-designer', 'canvas']);
    }
  }
}
