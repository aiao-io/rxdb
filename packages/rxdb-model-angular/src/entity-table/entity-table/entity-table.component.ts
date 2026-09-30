import type { BatchChangeItem, CellChangeEvent, EntityTableRecord, PendingWrite } from '@aiao/rxdb-model';
import {
  CellTooltipManager,
  ROW_SERIES_COL_OFFSET,
  TableClipboardManager,
  collectDeleteWrites,
  collectReorderedIds,
  completeTableEdit,
  createListTable,
  createTheme,
  getCSSVariables,
  handleTableKeydown,
  isDocumentDarkMode,
  patchDragIconForReadonlyRows,
  setCellSwitchState,
  updateTableRecords,
  changeCellValue as vtChangeCellValue
} from '@aiao/rxdb-model';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import type { ListTableConstructorOptions } from '@visactor/vtable';
import * as VTable from '@visactor/vtable';
import { ENTITY_TABLE_CONFIG } from '../config';

/**
 * 通用实体数据表格组件
 *
 * 基于 VTable 提供高性能表格渲染，支持：
 * - 单元格编辑（文本、开关、复选框、下拉）
 * - 剪贴板操作（Ctrl+C/V，TSV 格式）
 * - 拖拽排序
 * - 键盘导航（Enter 切换开关，Delete 清空单元格）
 * - 主题系统（daisyUI CSS 变量）
 * - 校验错误 tooltip
 */
@Component({
  selector: 'rxdb-entity-table',
  imports: [],
  templateUrl: './entity-table.component.html',
  styleUrl: './entity-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
/**
 * VTable 表格宿主组件：负责表格实例生命周期、事件桥接、暗色主题探测与销毁释放；
 * 全部表格基础设施（列构建、编辑器、剪贴板、键盘、主题）来自 @aiao/rxdb-model。
 */
export class EntityTableComponent implements OnDestroy {
  readonly #document = inject(DOCUMENT);
  readonly #platformId = inject(PLATFORM_ID);
  readonly #config = inject(ENTITY_TABLE_CONFIG, { optional: true });
  #tableInstance: VTable.ListTable | null = null;
  #destroyed = false;
  #tableReady = signal(false);
  #prevColumns: ListTableConstructorOptions['columns'] | null = null;
  #prevRecords: EntityTableRecord[] | null = null;
  #selectedCell: { col: number; row: number } | null = null;
  #containerKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  #resizeObserver: ResizeObserver | null = null;
  readonly #cellTooltip = signal<{ x: number; y: number; content: string } | null>(null);
  readonly #headerHeight = signal(40);
  readonly #clipboard = new TableClipboardManager();
  readonly #tooltip = new CellTooltipManager();
  readonly #detectedDarkMode = signal(false);
  #themeObserver: MutationObserver | null = null;
  #prefersDarkQuery: MediaQueryList | null = null;
  #prefersDarkListener: (() => void) | null = null;
  #container: HTMLElement | null = null;

  readonly tableContainer = viewChild<ElementRef<HTMLDivElement>>('tableContainer');

  // ── 输入 ──────────────────────────────────────────────────────────
  readonly records = input.required<EntityTableRecord[]>();
  readonly columns = input.required<ListTableConstructorOptions['columns']>();
  readonly isDarkMode = input<boolean | undefined>(undefined);
  readonly idField = input('id');
  readonly nonClearableFields = input<ReadonlySet<string>>(new Set());
  readonly tableOptions = input<Partial<ListTableConstructorOptions>>();
  readonly cellErrorDetector = input<(record: EntityTableRecord, field: string) => string | null>();
  readonly loading = input(false);
  /** 业务层回调判断单元格是否可清空（返回 false 跳过），替代领域特定的硬编码逻辑 */
  readonly cellClearable = input<(record: Record<string, unknown>, field: string) => boolean>();
  /** 触底时加载更多数据的回调，由表格内部在滚动到底部时调用 */
  readonly loadMore = input<() => void>();
  /** 加载更多中状态（已有数据，底部小 spinner，不拦截滚动） */
  readonly loadingMore = input(false);

  // ── 输出 ──────────────────────────────────────────────────────────
  readonly cellChanged = output<CellChangeEvent>();
  readonly rowDeleted = output<EntityTableRecord>();
  readonly iconClicked = output<{ name: string; record: EntityTableRecord }>();
  readonly batchUpdated = output<BatchChangeItem[]>();
  readonly rowReordered = output<string[]>();
  readonly scrollNearBottom = output<void>();
  /** 列头排序点击；业务层接管查询排序，表格不执行客户端排序 */
  readonly sortClicked = output<{ field: unknown; order: unknown }>();

  readonly cellTooltip = this.#cellTooltip;
  readonly headerHeight = this.#headerHeight;

  get tableInstance(): VTable.ListTable | null {
    return this.#tableInstance;
  }

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#syncDetectedDarkMode();
      this.#observeThemeChanges();

      afterNextRender(() => {
        if (this.#destroyed) return;
        const el = this.tableContainer()?.nativeElement;
        if (el && !this.#tableInstance && this.columns()?.length) {
          this.#initTable(el);
          this.#prevColumns = this.columns();
          this.#tableReady.set(true);
        }
      });

      effect(() => {
        const records = this.records();
        const columns = this.columns();
        const ready = untracked(() => this.#tableReady());
        if (!this.#tableInstance) {
          if (!ready && columns?.length) {
            const el = this.tableContainer()?.nativeElement;
            if (el) {
              this.#initTable(el);
              this.#prevColumns = columns;
              this.#tableReady.set(true);
            }
          }
          return;
        }
        const columnsChanged = columns !== this.#prevColumns;
        if (columnsChanged) {
          updateTableRecords(this.#tableInstance, records, this.#prevColumns ?? columns, columns);
          this.#prevColumns = columns;
          this.#prevRecords = records;
        } else if (records !== this.#prevRecords) {
          this.#tableInstance.setRecords(records);
          this.#prevRecords = records;
        }
      });

      effect(() => {
        this.isDarkMode();
        this.#detectedDarkMode();
        this.redrawTheme();
      });
    }
  }
  /**
   * 从业务层回滚单元格值（校验失败时恢复原值）。
   * 避免外部直接访问 tableInstance。
   */
  changeCellValue(col: number, row: number, value: unknown): void {
    if (this.#tableInstance) vtChangeCellValue(this.#tableInstance, col, row, value);
  }

  redrawTheme(): void {
    if (this.#tableInstance) {
      this.#tableInstance.updateTheme(createTheme(this.#resolvedDarkMode(), getCSSVariables()));
    }
  }

  ngOnDestroy(): void {
    this.#destroyed = true;
    this.#tooltip.cleanup();
    this.#themeObserver?.disconnect();
    this.#themeObserver = null;
    if (this.#prefersDarkQuery && this.#prefersDarkListener) {
      this.#prefersDarkQuery.removeEventListener('change', this.#prefersDarkListener);
    }
    this.#prefersDarkQuery = null;
    this.#prefersDarkListener = null;
    if (this.#containerKeydownHandler) {
      this.#container?.removeEventListener('keydown', this.#containerKeydownHandler);
      this.#containerKeydownHandler = null;
    }
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    if (this.#tableInstance) {
      completeTableEdit(this.#tableInstance);
      this.#tableInstance.release();
    }
    this.#tableInstance = null;
    this.#container = null;
    this.#tableReady.set(false);
  }

  #initTable(container: HTMLElement): void {
    const records = this.records();
    const table = createListTable(container, records, this.columns(), this.#resolvedDarkMode(), this.tableOptions());
    this.#tableInstance = table;
    this.#prevRecords = records;
    this.#container = container;
    const h = table.getRowHeight(0);
    if (h > 0) this.#headerHeight.set(h);

    this.#resizeObserver = new ResizeObserver(() => table.resize());
    this.#resizeObserver.observe(container);
    table.updateTheme(createTheme(this.#resolvedDarkMode(), getCSSVariables()));
    patchDragIconForReadonlyRows(table);
    this.#bindTableEvents(table, container);
  }

  #resolvedDarkMode(): boolean {
    return this.isDarkMode() ?? this.#detectedDarkMode();
  }

  #syncDetectedDarkMode(): void {
    this.#detectedDarkMode.set(isDocumentDarkMode());
  }

  #observeThemeChanges(): void {
    if (typeof MutationObserver !== 'undefined') {
      this.#themeObserver = new MutationObserver(() => this.#syncDetectedDarkMode());
      this.#themeObserver.observe(this.#document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    this.#prefersDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.#prefersDarkListener = () => {
      if (!this.#document.documentElement.hasAttribute('data-theme')) {
        this.#syncDetectedDarkMode();
      }
    };
    this.#prefersDarkQuery.addEventListener('change', this.#prefersDarkListener);
  }

  #bindTableEvents(table: VTable.ListTable, container: HTMLElement): void {
    table.on('change_cell_value', (args: { col: number; row: number; changedValue: string | number }) => {
      this.#handleCellChange(args.col, args.row, args.changedValue);
    });
    table.on('switch_state_change', (args: { col: number; row: number; checked: boolean }) => {
      this.#handleCellChange(args.col, args.row, args.checked);
    });
    table.on('checkbox_state_change', (args: { col: number; row: number; checked: boolean }) => {
      this.#handleCellChange(args.col, args.row, args.checked);
    });
    table.on('icon_click', (args: { name: string; col: number; row: number }) => {
      completeTableEdit(table);
      const record = table.getRecordByCell(args.col, args.row) as EntityTableRecord | undefined;
      if (!record) return;
      if (args.name === 'delete-action') this.rowDeleted.emit(record);
      else this.iconClicked.emit({ name: args.name, record });
    });
    table.on('mouseenter_cell', (args: { col: number; row: number }) => this.#showCellError(args.col, args.row));
    table.on('mouseleave_cell', () => this.#tooltip.hide(v => this.#cellTooltip.set(v)));
    table.on('selected_cell', (args: { col: number; row: number }) => {
      this.#selectedCell = { col: args.col, row: args.row };
    });
    table.on('change_header_position', () => {
      const ids = collectReorderedIds(table, this.idField());
      if (ids.length > 0) this.rowReordered.emit(ids);
    });
    // 返回 false 阻止 VTable executeSort，由业务层 cursor orderBy 重查
    table.on('sort_click', (args: { field: unknown; order: unknown }) => {
      this.sortClicked.emit({ field: args.field, order: args.order });
      return false;
    });
    table.on('scroll', (args: { scrollDirection: string; scrollRatioY?: number; dy?: number }) => {
      if (
        args.scrollDirection === 'vertical' &&
        (args.dy ?? 0) > 0 &&
        (args.scrollRatioY ?? 0) > 0.9 &&
        !this.loadingMore()
      ) {
        const fn = this.loadMore();
        if (fn) {
          fn();
        } else {
          this.scrollNearBottom.emit();
        }
      }
    });

    this.#containerKeydownHandler = (e: KeyboardEvent) =>
      handleTableKeydown(
        {
          getTable: () => this.#tableInstance,
          getSelectedCell: () => this.#selectedCell,
          getColDef: col => this.#getColDef(col) as { cellType?: string; field?: string },
          onCopy: () => void this.#clipboard.copy(table, this.columns() as Record<string, unknown>[]),
          onPaste: () => void this.#pasteFromClipboard(),
          onDelete: () => this.#deleteSelectedCells(),
          onCellChange: (col, row, val) => this.#handleCellChange(col, row, val)
        },
        e
      );
    container.addEventListener('keydown', this.#containerKeydownHandler);
  }

  #getColDef(col: number): Record<string, unknown> | undefined {
    return (this.columns() as Record<string, unknown>[])?.[col - ROW_SERIES_COL_OFFSET];
  }

  #handleCellChange(col: number, row: number, changedValue: unknown): void {
    const record = this.#tableInstance?.getRecordByCell(col, row) as EntityTableRecord | undefined;
    const fieldName = (this.#getColDef(col) as { field?: string })?.field;
    if (!record || !fieldName) return;
    this.cellChanged.emit({ col, row, field: fieldName, value: changedValue, record });
  }

  #showCellError(col: number, row: number): void {
    const table = this.#tableInstance;
    if (!table) return;
    const detector = this.cellErrorDetector();
    if (!detector) return;
    const record = table.getRecordByCell(col, row) as EntityTableRecord | undefined;
    if (!record) return;
    const field = (this.#getColDef(col) as { field?: string })?.field;
    if (!field) return;
    const content = detector(record, field);
    if (!content) return;
    this.#tooltip.showError(table, col, row, content, v => this.#cellTooltip.set(v), this.#config?.tooltipDelay);
  }

  /** 将 PendingWrite[] 按 idField 归并为 BatchChangeItem[] */
  #groupWrites(writes: PendingWrite[]): BatchChangeItem[] {
    const map = new Map<string, Record<string, unknown>>();
    for (const w of writes) {
      const id = String((w.record as Record<string, unknown>)[this.idField()]);
      if (!map.has(id)) map.set(id, {});
      map.get(id)![w.field] = w.value;
    }
    return [...map.entries()].map(([recordId, changes]) => ({ recordId, changes }));
  }

  async #pasteFromClipboard(): Promise<void> {
    if (!this.#tableInstance) return;
    const writes = await this.#clipboard.paste(this.#tableInstance, this.columns() as Record<string, unknown>[]);
    if (writes.length > 0) {
      for (const w of writes) {
        if (typeof w.value === 'boolean') {
          setCellSwitchState(this.#tableInstance, w.col, w.row, w.value);
        }
      }
      this.batchUpdated.emit(this.#groupWrites(writes));
    }
  }

  #deleteSelectedCells(): void {
    const table = this.#tableInstance;
    if (!table) return;
    const columns = this.columns() as { field?: string; cellType?: string | ((...a: unknown[]) => string) }[];
    const { writes, boolCells } = collectDeleteWrites(table, columns, this.nonClearableFields(), this.cellClearable());
    for (const bc of boolCells) setCellSwitchState(table, bc.col, bc.row, false);
    if (writes.length > 0) this.batchUpdated.emit(this.#groupWrites(writes));
  }
}
