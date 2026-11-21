import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TableViewComponent } from '../components/table/table-view.component';
import { MODEL_DESIGNER_CONFIG } from '../interfaces/designer.interface';
import { DesignerStateService } from '../services/designer-state.service';

/**
 * 属性标签页
 *
 * 路由：model-designer/table/:entityId/properties
 */
@Component({
  selector: 'lib-properties-page',
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
      (childPropertyAdded)="state.onChildPropertyAdded($event)"
      (propertiesBatchUpdated)="state.onPropertiesBatchUpdated($event)"
      (propertyAdded)="state.onPropertyAdded($event)"
      (propertyDeleted)="state.onPropertyDeleted($event)"
      (propertyUpdated)="state.onPropertyUpdated($event)"
      detailTab="properties"
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
export default class PropertiesPage {
  readonly #config = inject(MODEL_DESIGNER_CONFIG, { optional: true });
  protected readonly state = inject(DesignerStateService);
  readonly isDarkMode = computed(() => this.#config?.isDarkMode() ?? false);
}
