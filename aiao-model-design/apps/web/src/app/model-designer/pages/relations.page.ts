import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TableViewComponent } from '../components/table/table-view.component';
import { MODEL_DESIGNER_CONFIG } from '../interfaces/designer.interface';
import { DesignerStateService } from '../services/designer-state.service';

/**
 * 关系标签页
 *
 * 路由：model-designer/table/:entityId/relations
 */
@Component({
  selector: 'lib-relations-page',
  imports: [TableViewComponent],
  template: `
    <lib-table-view
      class="flex-1"
      [activeEntityId]="state.selectedEntityId()"
      [childPropertiesMap]="state.childPropertiesMap()"
      [entities]="state.entities()"
      [indexesMap]="state.indexesMap()"
      [invalidRelationIds]="state.invalidRelationIds()"
      [isDarkMode]="isDarkMode()"
      [missingInverseRelationIds]="state.missingInverseRelationIds()"
      [propertiesMap]="state.propertiesMap()"
      [relationFieldErrors]="state.relationFieldErrors()"
      [relationsMap]="state.relationsMap()"
      (relationAdded)="state.onRelationAdded($event)"
      (relationDeleted)="state.onRelationDeleted($event)"
      (relationsBatchUpdated)="state.onRelationsBatchUpdated($event)"
      (relationUpdated)="state.onRelationUpdated($event)"
      detailTab="relations"
    />
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
export default class RelationsPage {
  readonly #config = inject(MODEL_DESIGNER_CONFIG, { optional: true });
  protected readonly state = inject(DesignerStateService);
  readonly isDarkMode = computed(() => this.#config?.isDarkMode() ?? false);
}
