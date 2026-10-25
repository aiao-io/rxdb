import { ListViewSettingsController, moveListViewItem, type ListViewField, type ListViewState } from '@aiao/rxdb-model';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild
} from '@angular/core';

let uidCounter = 0;

/** 实体列表的字段、排序与分组配置面板。 */
@Component({
  selector: 'rxdb-list-view-settings',
  templateUrl: './list-view-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListViewSettingsComponent {
  readonly #destroyRef = inject(DestroyRef);
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('settings');
  readonly uid = `rxdb-list-settings-${++uidCounter}`;
  readonly fields = input.required<ListViewField[]>();
  readonly value = input.required<ListViewState>();
  readonly valueChange = output<ListViewState>();
  readonly panel =
    'border-base-300 bg-base-100 m-0 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border p-3 shadow-xl';
  readonly visibleCount = computed(
    () => this.fields().filter(field => !this.value().hiddenFields.includes(field.field)).length
  );
  readonly available = computed(() =>
    this.fields().filter(field => field.sortable && !this.value().sorts.some(sort => sort.field === field.field))
  );
  readonly sortable = computed(() => this.fields().filter(field => field.sortable));

  constructor() {
    afterNextRender(() => {
      const controller = new ListViewSettingsController(this.root().nativeElement, {
        fields: () => this.fields().map(field => field.field),
        onReorder: fieldOrder => this.change({ fieldOrder })
      });
      this.#destroyRef.onDestroy(() => controller.dispose());
    });
  }

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
