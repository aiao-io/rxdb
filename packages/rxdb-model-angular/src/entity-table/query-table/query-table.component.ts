import type { BatchChangeItem, CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import { ChangeDetectionStrategy, Component, computed, input, output, viewChild } from '@angular/core';
import type { ListTable, ListTableConstructorOptions } from '@visactor/vtable';
import { EntityTableComponent } from '../entity-table/entity-table.component';

/**
 * 集成查询构建器的实体表格组件
 *
 * 在实体表格上方提供筛选区域位置（通过内容投影），
 * 将 rxdb-query-builder 的查询结果传递给底层 EntityTableComponent。
 *
 * 使用方式：
 * ```html
 * <rxdb-query-table [records]="filteredRecords()" [columns]="columns">
 *   <div filterBar>
 *     <rxdb-query-builder [fields]="fields" (queryChange)="onQueryChange($event)" />
 *   </div>
 *   <div emptyState>暂无数据</div>
 * </rxdb-query-table>
 * ```
 */
@Component({
  selector: 'rxdb-query-table',
  imports: [EntityTableComponent],
  templateUrl: './query-table.component.html',
  styleUrl: './query-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
/**
 * 查询表格组件：EntityTableComponent + `filterBar` / `emptyState` 插槽与筛选状态栏
 * （filtered / total 计数）。
 */
export class QueryTableComponent {
  readonly records = input.required<EntityTableRecord[]>();
  readonly columns = input.required<ListTableConstructorOptions['columns']>();
  readonly idField = input('id');
  readonly nonClearableFields = input<ReadonlySet<string>>(new Set());
  readonly tableOptions = input<Partial<ListTableConstructorOptions>>();
  readonly cellErrorDetector = input<(record: EntityTableRecord, field: string) => string | null>();
  readonly isDarkMode = input<boolean | undefined>(undefined);
  /** 业务层回调判断单元格是否可清空 */
  readonly cellClearable = input<(record: Record<string, unknown>, field: string) => boolean>();

  /** 查询条件是否激活（显示筛选状态标签） */
  readonly queryActive = input(false);
  /** 结果总数（显示在筛选状态栏中） */
  readonly totalCount = input<number>();
  /** 筛选后结果数 */
  readonly filteredCount = input<number>();
  /** 是否显示加载状态 */
  readonly loading = input(false);
  /** 加载更多中（已有数据，底部小 spinner，不拦截滚动） */
  readonly loadingMore = input(false);
  /** 触底时加载更多数据的回调，透传给 EntityTableComponent */
  readonly loadMore = input<() => void>();

  readonly cellChanged = output<CellChangeEvent>();
  readonly rowDeleted = output<EntityTableRecord>();
  readonly iconClicked = output<{ name: string; record: EntityTableRecord }>();
  readonly batchUpdated = output<BatchChangeItem[]>();
  readonly rowReordered = output<string[]>();
  readonly scrollNearBottom = output<void>();
  readonly sortClicked = output<{ field: unknown; order: unknown }>();

  readonly entityTable = viewChild(EntityTableComponent);

  readonly statusText = computed(() => {
    const total = this.totalCount();
    const filtered = this.filteredCount();
    if (total == null) return '';
    if (filtered != null && filtered !== total) return `${filtered} / ${total}`;
    return `${total}`;
  });

  get tableInstance(): ListTable | null {
    return this.entityTable()?.tableInstance ?? null;
  }

  changeCellValue(col: number, row: number, value: unknown): void {
    this.entityTable()?.changeCellValue(col, row, value);
  }

  redrawTheme(): void {
    this.entityTable()?.redrawTheme();
  }
}
