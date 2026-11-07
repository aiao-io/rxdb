import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TableViewComponent } from '../components/table/table-view.component';
import { MODEL_DESIGNER_CONFIG } from '../interfaces/designer.interface';
import { DesignerStateService } from '../services/designer-state.service';

/**
 * 索引标签页
 *
 * 路由：model-designer/table/:entityId/indexes
 */
@Component({
  selector: 'lib-indexes-page',
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
      (indexAdded)="state.onIndexAdded($event)"
      (indexDeleted)="state.onIndexDeleted($event)"
      (indexesBatchUpdated)="state.onIndexesBatchUpdated($event)"
      (indexUpdated)="state.onIndexUpdated($event)"
      detailTab="indexes"
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
export default class IndexesPage {
  readonly #config = inject(MODEL_DESIGNER_CONFIG, { optional: true });
  protected readonly state = inject(DesignerStateService);
  readonly isDarkMode = computed(() => this.#config?.isDarkMode() ?? false);
}
