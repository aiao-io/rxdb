import { moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** 实体列表的字段、排序与分组配置面板。 */
@Component({
  selector: 'rxdb-list-view-settings',
  templateUrl: './list-view-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListViewSettingsComponent {
  readonly fields = input.required<ListViewField[]>();
  readonly value = input.required<ListViewState>();
  readonly valueChange = output<ListViewState>();
  readonly panel =
    'dropdown-content border-base-300 bg-base-100 fixed inset-x-2 top-28 z-[1000] mt-2 max-h-[60dvh] w-auto sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:w-80 max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border p-3 shadow-xl';
  readonly visibleCount = computed(
    () => this.fields().filter(field => !this.value().hiddenFields.includes(field.field)).length
  );
  readonly available = computed(() =>
    this.fields().filter(field => field.sortable && !this.value().sorts.some(sort => sort.field === field.field))
  );
  readonly sortable = computed(() => this.fields().filter(field => field.sortable));

  change(patch: Partial<ListViewState>): void {
    this.valueChange.emit({ ...this.value(), ...patch });
  }
  titleOf(field: string): string {
    return this.fields().find(item => item.field === field)?.title ?? field;
  }
  toggleField(field: string, event: Event): void {
    this.change({
      hiddenFields:
        (event.target as HTMLInputElement).checked ?
          this.value().hiddenFields.filter(name => name !== field)
        : [...this.value().hiddenFields, field]
    });
  }
  moveField(index: number, direction: -1 | 1): void {
    this.change({
      fieldOrder: moveListViewItem(
        this.fields().map(field => field.field),
        index,
        direction
      )
    });
  }
  sortDirection(field: string, event: Event): void {
    this.change({
      sorts: this.value().sorts.map(sort =>
        sort.field === field ? { ...sort, sort: (event.target as HTMLSelectElement).value as 'asc' | 'desc' } : sort
      )
    });
  }
  moveSort(index: number, direction: -1 | 1): void {
    this.change({ sorts: moveListViewItem(this.value().sorts, index, direction) });
  }
  removeSort(field: string): void {
    this.change({ sorts: this.value().sorts.filter(sort => sort.field !== field) });
  }
  addSort(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value) this.change({ sorts: [...this.value().sorts, { field: select.value, sort: 'asc' }] });
    select.value = '';
  }
  group(event: Event): void {
    this.change({ groupBy: (event.target as HTMLSelectElement).value || null });
  }
}
