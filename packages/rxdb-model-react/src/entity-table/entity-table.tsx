/**
 * @fileoverview VTable 表格宿主组件（Angular `EntityTableComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：负责表格实例生命周期、事件桥接（VTable 事件 →
 * onCellChanged / onBatchUpdated / onRowDeleted / onIconClicked / onRowReordered /
 * onScrollNearBottom / onSortClicked）、暗色主题探测与销毁释放；
 * 全部表格基础设施（列构建、编辑器、剪贴板、键盘、主题）来自 `@aiao/rxdb-model`。
 *
 * 命令式能力（`tableInstance` / `changeCellValue` / `redrawTheme`）经 ref handle 暴露
 * （对应 Angular 组件上的公开 getter 与方法）。
 *
 * @module entity-table/entity-table
 */
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
import type { ListTable, ListTableConstructorOptions } from '@visactor/vtable';
import { forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { ENTITY_TABLE_CONFIG } from './config';
import './entity-table.css';

/** 单元格错误 tooltip 快照。 */
interface CellTooltipState {
  x: number;
  y: number;
  content: string;
}

/** 表格实例命令面（对应 Angular 组件的公开 getter / 方法）。 */
export interface EntityTableHandle {
  /** 当前 VTable 表格实例；未初始化时为 `null`。 */
  readonly tableInstance: ListTable | null;
  /** 从业务层回滚单元格值（校验失败时恢复原值）。 */
  changeCellValue(col: number, row: number, value: unknown): void;
  /** 用当前暗色模式与 CSS 变量重绘主题。 */
  redrawTheme(): void;
}

/** {@link EntityTable} 的 props。 */
export interface EntityTableProps {
  /** 表格记录。 */
  records: EntityTableRecord[];
  /** 列定义。 */
  columns: NonNullable<ListTableConstructorOptions['columns']>;
  /** 暗色模式；缺省时自动探测（data-theme / prefers-color-scheme）。 */
  isDarkMode?: boolean;
  /** 主键字段名，缺省 `'id'`。 */
  idField?: string;
  /** 不可清空的字段集合（Delete 清空时跳过）。 */
  nonClearableFields?: ReadonlySet<string>;
  /** 透传给 VTable 的额外表格选项。 */
  tableOptions?: Partial<ListTableConstructorOptions>;
  /** 单元格错误检测器（悬停时显示 tooltip）。 */
  cellErrorDetector?: (record: EntityTableRecord, field: string) => string | null;
  /** 是否显示加载态。 */
  loading?: boolean;
  /** 业务层回调判断单元格是否可清空（返回 false 跳过）。 */
  cellClearable?: (record: Record<string, unknown>, field: string) => boolean;
  /** 触底时加载更多数据的回调。 */
  loadMore?: () => void;
  /** 加载更多中状态（已有数据，底部小 spinner，不拦截滚动）。 */
  loadingMore?: boolean;
  /** 空态插槽（有内容时替代默认空态）。 */
  emptyState?: ReactNode;
  /** 单元格变更。 */
  onCellChanged?: (event: CellChangeEvent) => void;
  /** 行删除（delete-action 图标）。 */
  onRowDeleted?: (record: EntityTableRecord) => void;
  /** 非删除类图标点击。 */
  onIconClicked?: (event: { name: string; record: EntityTableRecord }) => void;
  /** 批量变更（剪贴板粘贴 / Delete 清空）。 */
  onBatchUpdated?: (mutations: BatchChangeItem[]) => void;
  /** 行重排（列头拖拽）。 */
  onRowReordered?: (orderedIds: string[]) => void;
  /** 触底且未提供 loadMore 时输出。 */
  onScrollNearBottom?: () => void;
  /** 列头排序点击；业务层接管查询排序，表格不执行客户端排序。 */
  onSortClicked?: (event: { field: unknown; order: unknown }) => void;
}

/**
 * VTable 表格宿主组件。
 */
export const EntityTable = forwardRef<EntityTableHandle, EntityTableProps>(function EntityTable(
  {
    records,
    columns,
    isDarkMode,
    idField = 'id',
    nonClearableFields = new Set<string>(),
    tableOptions,
    cellErrorDetector,
    loading = false,
    cellClearable,
    loadMore,
    loadingMore = false,
    emptyState,
    onCellChanged,
    onRowDeleted,
    onIconClicked,
    onBatchUpdated,
    onRowReordered,
    onScrollNearBottom,
    onSortClicked
  },
  ref
) {
  const config = useContext(ENTITY_TABLE_CONFIG);

  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<ListTable | null>(null);
  const prevColumnsRef = useRef<ListTableConstructorOptions['columns'] | null>(null);
  const prevRecordsRef = useRef<EntityTableRecord[] | null>(null);
  const selectedCellRef = useRef<{ col: number; row: number } | null>(null);
  const clipboardRef = useRef<TableClipboardManager | null>(null);
  const tooltipRef = useRef<CellTooltipManager | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const themeObserverRef = useRef<MutationObserver | null>(null);
  const containerKeydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const prefersDarkQueryRef = useRef<MediaQueryList | null>(null);
  const prefersDarkListenerRef = useRef<(() => void) | null>(null);
  const configRef = useRef(config);

  const [tableReady, setTableReady] = useState(false);
  const [cellTooltip, setCellTooltip] = useState<CellTooltipState | null>(null);
  const [headerHeight, setHeaderHeight] = useState(40);
  const [detectedDarkMode, setDetectedDarkMode] = useState(false);

  // 事件回调与可选项始终读最新值（VTable 事件在渲染周期外触发）
  const propsRef = useRef({
    records,
    columns,
    isDarkMode,
    idField,
    nonClearableFields,
    tableOptions,
    cellErrorDetector,
    loading,
    cellClearable,
    loadMore,
    loadingMore,
    onCellChanged,
    onRowDeleted,
    onIconClicked,
    onBatchUpdated,
    onRowReordered,
    onScrollNearBottom,
    onSortClicked
  });
  useEffect(() => {
    propsRef.current = {
      records,
      columns,
      isDarkMode,
      idField,
      nonClearableFields,
      tableOptions,
      cellErrorDetector,
      loading,
      cellClearable,
      loadMore,
      loadingMore,
      onCellChanged,
      onRowDeleted,
      onIconClicked,
      onBatchUpdated,
      onRowReordered,
      onScrollNearBottom,
      onSortClicked
    };
  });

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const resolvedDarkMode = isDarkMode ?? detectedDarkMode;
  const resolvedDarkModeRef = useRef(resolvedDarkMode);
  resolvedDarkModeRef.current = resolvedDarkMode;

  // ── 暗色模式探测（data-theme 属性 + prefers-color-scheme）──────────────
  useEffect(() => {
    setDetectedDarkMode(isDocumentDarkMode());
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => setDetectedDarkMode(isDocumentDarkMode()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      themeObserverRef.current = observer;
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {
        themeObserverRef.current?.disconnect();
        themeObserverRef.current = null;
      };
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (): void => {
      if (!document.documentElement.hasAttribute('data-theme')) {
        setDetectedDarkMode(isDocumentDarkMode());
      }
    };
    query.addEventListener('change', listener);
    prefersDarkQueryRef.current = query;
    prefersDarkListenerRef.current = listener;
    return () => {
      themeObserverRef.current?.disconnect();
      themeObserverRef.current = null;
      if (prefersDarkQueryRef.current && prefersDarkListenerRef.current) {
        prefersDarkQueryRef.current.removeEventListener('change', prefersDarkListenerRef.current);
      }
      prefersDarkQueryRef.current = null;
      prefersDarkListenerRef.current = null;
    };
  }, []);

  // ── 主题重绘 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const table = tableRef.current;
    if (table) table.updateTheme(createTheme(resolvedDarkMode, getCSSVariables()));
  }, [resolvedDarkMode, tableReady]);

  // ── 初始化 / records / columns 同步（对应 Angular 的 afterNextRender + effect）──
  useEffect(() => {
    const el = containerRef.current;
    if (!tableRef.current && !tableReady && columns.length > 0 && el) {
      initTable(el);
      prevColumnsRef.current = columns;
      prevRecordsRef.current = records;
      setTableReady(true);
    }
    const table = tableRef.current;
    if (!table) return;
    const columnsChanged = columns !== prevColumnsRef.current;
    if (columnsChanged) {
      updateTableRecords(table, records, prevColumnsRef.current ?? columns, columns);
      prevColumnsRef.current = columns;
      prevRecordsRef.current = records;
    } else if (records !== prevRecordsRef.current) {
      table.setRecords(records);
      prevRecordsRef.current = records;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, columns, tableReady]);

  /** 创建表格实例、注册基础事件与容器键盘监听（对应 Angular `#initTable`）。 */
  function initTable(container: HTMLElement): void {
    const current = propsRef.current;
    const columnDefs = current.columns ?? [];
    const table = createListTable(
      container,
      current.records,
      columnDefs,
      resolvedDarkModeRef.current,
      current.tableOptions
    );
    tableRef.current = table;
    prevRecordsRef.current = current.records;
    const h = table.getRowHeight(0);
    if (h > 0) setHeaderHeight(h);

    const resizeObserver = new ResizeObserver(() => table.resize());
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    table.updateTheme(createTheme(resolvedDarkModeRef.current, getCSSVariables()));
    patchDragIconForReadonlyRows(table);

    table.on('change_cell_value', (args: { col: number; row: number; changedValue: string | number }) => {
      handleCellChange(args.col, args.row, args.changedValue);
    });
    table.on('switch_state_change', (args: { col: number; row: number; checked: boolean }) => {
      handleCellChange(args.col, args.row, args.checked);
    });
    table.on('checkbox_state_change', (args: { col: number; row: number; checked: boolean }) => {
      handleCellChange(args.col, args.row, args.checked);
    });
    table.on('icon_click', (args: { name: string; col: number; row: number }) => {
      completeTableEdit(table);
      const record = table.getRecordByCell(args.col, args.row) as EntityTableRecord | undefined;
      if (!record) return;
      if (args.name === 'delete-action') propsRef.current.onRowDeleted?.(record);
      else propsRef.current.onIconClicked?.({ name: args.name, record });
    });
    table.on('mouseenter_cell', (args: { col: number; row: number }) => showCellError(args.col, args.row));
    table.on('mouseleave_cell', () => {
      const tooltip = tooltipRef.current ?? (tooltipRef.current = new CellTooltipManager());
      tooltip.hide(() => setCellTooltip(null));
    });
    table.on('selected_cell', (args: { col: number; row: number }) => {
      selectedCellRef.current = { col: args.col, row: args.row };
    });
    table.on('change_header_position', () => {
      const ids = collectReorderedIds(table, propsRef.current.idField);
      if (ids.length > 0) propsRef.current.onRowReordered?.(ids);
    });
    // 返回 false 阻止 VTable executeSort，由业务层 cursor orderBy 重查
    table.on('sort_click', (args: { field: unknown; order: unknown }) => {
      propsRef.current.onSortClicked?.({ field: args.field, order: args.order });
      return false;
    });
    table.on('scroll', (args: { scrollDirection: string; scrollRatioY?: number; dy?: number }) => {
      if (
        args.scrollDirection === 'vertical' &&
        (args.dy ?? 0) > 0 &&
        (args.scrollRatioY ?? 0) > 0.9 &&
        !propsRef.current.loadingMore
      ) {
        const fn = propsRef.current.loadMore;
        if (fn) fn();
        else propsRef.current.onScrollNearBottom?.();
      }
    });

    const keydownHandler = (e: KeyboardEvent): void =>
      handleTableKeydown(
        {
          getTable: () => tableRef.current,
          getSelectedCell: () => selectedCellRef.current,
          getColDef: col => getColDef(col),
          onCopy: () => void getClipboard().copy(table, propsRef.current.columns as Record<string, unknown>[]),
          onPaste: () => void pasteFromClipboard(),
          onDelete: () => deleteSelectedCells(),
          onCellChange: (col, row, val) => handleCellChange(col, row, val)
        },
        e
      );
    containerKeydownHandlerRef.current = keydownHandler;
    container.addEventListener('keydown', keydownHandler);
  }

  function getClipboard(): TableClipboardManager {
    return clipboardRef.current ?? (clipboardRef.current = new TableClipboardManager());
  }

  /** 按列索引取列定义（跳过行号列）。 */
  function getColDef(col: number): { cellType?: string; field?: string } | undefined {
    return (propsRef.current.columns as Record<string, unknown>[])?.[col - ROW_SERIES_COL_OFFSET] as
      { cellType?: string; field?: string } | undefined;
  }

  /** VTable 单元格变更 → onCellChanged（携带列字段名与行记录）。 */
  function handleCellChange(col: number, row: number, changedValue: unknown): void {
    const table = tableRef.current;
    const record = table?.getRecordByCell(col, row) as EntityTableRecord | undefined;
    const fieldName = getColDef(col)?.field;
    if (!record || !fieldName) return;
    propsRef.current.onCellChanged?.({ col, row, field: fieldName, value: changedValue, record });
  }

  /** 悬停单元格：cellErrorDetector 命中时经 CellTooltipManager 延迟显示错误 tooltip。 */
  function showCellError(col: number, row: number): void {
    const table = tableRef.current;
    if (!table) return;
    const detector = propsRef.current.cellErrorDetector;
    if (!detector) return;
    const record = table.getRecordByCell(col, row) as EntityTableRecord | undefined;
    if (!record) return;
    const field = getColDef(col)?.field;
    if (!field) return;
    const content = detector(record, field);
    if (!content) return;
    const tooltip = tooltipRef.current ?? (tooltipRef.current = new CellTooltipManager());
    tooltip.showError(table, col, row, content, value => setCellTooltip(value), configRef.current?.tooltipDelay);
  }

  /** 将 PendingWrite[] 按 idField 归并为 BatchChangeItem[]。 */
  function groupWrites(writes: PendingWrite[]): BatchChangeItem[] {
    const map = new Map<string, Record<string, unknown>>();
    for (const w of writes) {
      const id = String((w.record as Record<string, unknown>)[propsRef.current.idField]);
      if (!map.has(id)) map.set(id, {});
      map.get(id)![w.field] = w.value;
    }
    return [...map.entries()].map(([recordId, changes]) => ({ recordId, changes }));
  }

  /** Ctrl+V 粘贴：系统剪贴板 TSV → 批量写入 → onBatchUpdated。 */
  async function pasteFromClipboard(): Promise<void> {
    const table = tableRef.current;
    if (!table) return;
    const writes = await getClipboard().paste(table, propsRef.current.columns as Record<string, unknown>[]);
    if (writes.length > 0) {
      for (const w of writes) {
        if (typeof w.value === 'boolean') {
          setCellSwitchState(table, w.col, w.row, w.value);
        }
      }
      propsRef.current.onBatchUpdated?.(groupWrites(writes));
    }
  }

  /** Delete 清空选中单元格 → onBatchUpdated。 */
  function deleteSelectedCells(): void {
    const table = tableRef.current;
    if (!table) return;
    const current = propsRef.current;
    const writes = collectDeleteWrites(
      table,
      current.columns as { field?: string; cellType?: string | ((...a: unknown[]) => string) }[],
      current.nonClearableFields,
      current.cellClearable
    );
    for (const bc of writes.boolCells) setCellSwitchState(table, bc.col, bc.row, false);
    if (writes.writes.length > 0) current.onBatchUpdated?.(groupWrites(writes.writes));
  }

  useImperativeHandle(
    ref,
    () => ({
      get tableInstance(): ListTable | null {
        return tableRef.current;
      },
      changeCellValue(col: number, row: number, value: unknown): void {
        const table = tableRef.current;
        if (table) vtChangeCellValue(table, col, row, value);
      },
      redrawTheme(): void {
        const table = tableRef.current;
        if (table) table.updateTheme(createTheme(resolvedDarkModeRef.current, getCSSVariables()));
      }
    }),
    []
  );

  // ── 销毁释放（对应 Angular ngOnDestroy）───────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    return () => {
      tooltipRef.current?.cleanup();
      themeObserverRef.current?.disconnect();
      if (prefersDarkQueryRef.current && prefersDarkListenerRef.current) {
        prefersDarkQueryRef.current.removeEventListener('change', prefersDarkListenerRef.current);
      }
      if (containerKeydownHandlerRef.current) {
        container?.removeEventListener('keydown', containerKeydownHandlerRef.current);
      }
      resizeObserverRef.current?.disconnect();
      if (tableRef.current) {
        completeTableEdit(tableRef.current);
        tableRef.current.release();
      }
      tableRef.current = null;
    };
  }, []);

  return (
    <div className='rxdb-entity-table relative h-full w-full overflow-hidden'>
      <div className='absolute inset-0' ref={containerRef} />
      {records.length === 0 && !loading && (
        <div
          className='text-base-content/40 absolute inset-x-0 bottom-0 flex items-center justify-center text-sm'
          style={{ top: headerHeight }}
          aria-label='暂无数据'
          role='status'
        >
          <div className='empty-slot'>{emptyState}</div>
          <div className='empty-default flex flex-col items-center gap-3'>
            <svg
              aria-hidden='true'
              fill='none'
              height='40'
              stroke='currentColor'
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='1.2'
              viewBox='0 0 24 24'
              width='40'
            >
              <rect height='18' rx='2' width='18' x='3' y='3' />
              <path d='M3 9h18' />
              <path d='M9 9v12' />
              <path d='M3 15h18' />
            </svg>
            <span>暂无数据</span>
          </div>
        </div>
      )}
      {loading && (
        <div className='bg-base-100/60 absolute inset-0 z-10 flex items-center justify-center'>
          <span className='loading loading-spinner loading-md text-primary' />
        </div>
      )}
      {loadingMore && (
        <div className='pointer-events-none absolute right-0 bottom-0 left-0 z-10 flex justify-center py-1.5'>
          <span className='loading loading-dots loading-sm text-primary' />
        </div>
      )}
      {cellTooltip && (
        <div
          className='bg-base-300 text-base-content border-base-300 pointer-events-none fixed z-[100] max-w-xs rounded border px-2 py-1.5 text-xs shadow-lg'
          style={{ left: cellTooltip.x, top: cellTooltip.y }}
          aria-atomic='true'
          aria-live='assertive'
          role='tooltip'
        >
          {cellTooltip.content}
        </div>
      )}
    </div>
  );
});
