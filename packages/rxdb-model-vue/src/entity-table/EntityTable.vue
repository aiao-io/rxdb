<script lang="ts" setup>
/**
 * 通用实体数据表格组件（对齐 Angular 侧 `EntityTableComponent`）。
 *
 * 基于 VTable 提供高性能表格渲染，全部表格基础设施（列构建、编辑器、剪贴板、
 * 键盘、主题）来自 `@aiao/rxdb-model`；本组件负责表格实例生命周期、事件桥接、
 * 暗色主题探测与销毁释放。
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
import * as VTable from '@visactor/vtable';
import { inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { ENTITY_TABLE_CONFIG } from './config';

const props = withDefaults(
  defineProps<{
    /** 表格行数据 */
    records: EntityTableRecord[];
    /** 列定义 */
    columns: ListTableConstructorOptions['columns'];
    /** 是否暗色主题（缺省时自动探测） */
    isDarkMode?: boolean;
    /** 主键字段名 */
    idField?: string;
    /** 不可清空的字段集合 */
    nonClearableFields?: ReadonlySet<string>;
    /** VTable 构造选项（覆盖默认配置） */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    tableOptions?: Partial<ListTableConstructorOptions>;
    /** 单元格错误检测器（悬停时显示 tooltip） */
    cellErrorDetector?: (record: EntityTableRecord, field: string) => string | null;
    /** 是否加载中（渲染 spinner） */
    loading?: boolean;
    /** 业务层回调判断单元格是否可清空（返回 false 跳过） */
    cellClearable?: (record: Record<string, unknown>, field: string) => boolean;
    /** 触底时加载更多数据的回调 */
    loadMore?: () => void;
    /** 加载更多中状态（底部小 spinner，不拦截滚动） */
    loadingMore?: boolean;
  }>(),
  {
    isDarkMode: undefined,
    idField: 'id',
    nonClearableFields: () => new Set<string>(),
    cellErrorDetector: undefined,
    loading: false,
    cellClearable: undefined,
    loadMore: undefined,
    loadingMore: false
  }
);

const emit = defineEmits<{
  /** 单元格变更 */
  cellChanged: [event: CellChangeEvent];
  /** 行删除（delete-action 图标） */
  rowDeleted: [record: EntityTableRecord];
  /** 图标点击（delete-action 之外的名字） */
  iconClicked: [event: { name: string; record: EntityTableRecord }];
  /** 批量变更（剪贴板粘贴 / Delete 清空） */
  batchUpdated: [items: BatchChangeItem[]];
  /** 行拖拽重排后的 id 顺序 */
  rowReordered: [ids: string[]];
  /** 触底且未提供 loadMore */
  scrollNearBottom: [];
  /** 列头排序点击（业务层接管查询排序） */
  sortClicked: [event: { field: unknown; order: unknown }];
}>();

const config = inject(ENTITY_TABLE_CONFIG, undefined);

/** 当前表格实例（初始化后为真实 VTable ListTable） */
const tableInstance = shallowRef<ListTable | null>(null);
const tableContainer = ref<HTMLElement | null>(null);
const tableReady = ref(false);
const cellTooltip = ref<{ x: number; y: number; content: string } | null>(null);
const headerHeight = ref(40);

let prevColumns: ListTableConstructorOptions['columns'] | null = null;
let prevRecords: EntityTableRecord[] | null = null;
let selectedCell: { col: number; row: number } | null = null;
let containerKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
let resizeObserver: ResizeObserver | null = null;
let containerEl: HTMLElement | null = null;
let themeObserver: MutationObserver | null = null;
let prefersDarkQuery: MediaQueryList | null = null;
let prefersDarkListener: (() => void) | null = null;

const detectedDarkMode = ref(false);
const clipboard = new TableClipboardManager();
const tooltip = new CellTooltipManager();

const resolvedDarkMode = (): boolean => props.isDarkMode ?? detectedDarkMode.value;

const syncDetectedDarkMode = (): void => {
  detectedDarkMode.value = isDocumentDarkMode();
};

const observeThemeChanges = (): void => {
  if (typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => syncDetectedDarkMode());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }

  prefersDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  prefersDarkListener = (): void => {
    if (!document.documentElement.hasAttribute('data-theme')) {
      syncDetectedDarkMode();
    }
  };
  prefersDarkQuery.addEventListener('change', prefersDarkListener);
};

const initTable = (container: HTMLElement): void => {
  const table = createListTable(container, props.records, props.columns, resolvedDarkMode(), props.tableOptions);
  tableInstance.value = table;
  prevRecords = props.records;
  containerEl = container;
  const h = table.getRowHeight(0);
  if (h > 0) headerHeight.value = h;

  resizeObserver = new ResizeObserver(() => table.resize());
  resizeObserver.observe(container);
  table.updateTheme(createTheme(resolvedDarkMode(), getCSSVariables()));
  patchDragIconForReadonlyRows(table);
  bindTableEvents(table, container);
};

/** 从业务层回滚单元格值（校验失败时恢复原值） */
const changeCellValue = (col: number, row: number, value: unknown): void => {
  if (tableInstance.value) vtChangeCellValue(tableInstance.value, col, row, value);
};

/** 重绘主题（isDarkMode / 自动探测变化时） */
const redrawTheme = (): void => {
  if (tableInstance.value) {
    tableInstance.value.updateTheme(createTheme(resolvedDarkMode(), getCSSVariables()));
  }
};

const bindTableEvents = (table: VTable.ListTable, container: HTMLElement): void => {
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
    if (args.name === 'delete-action') emit('rowDeleted', record);
    else emit('iconClicked', { name: args.name, record });
  });
  table.on('mouseenter_cell', (args: { col: number; row: number }) => showCellError(args.col, args.row));
  table.on('mouseleave_cell', () => tooltip.hide(v => (cellTooltip.value = v)));
  table.on('selected_cell', (args: { col: number; row: number }) => {
    selectedCell = { col: args.col, row: args.row };
  });
  table.on('change_header_position', () => {
    const ids = collectReorderedIds(table, props.idField);
    if (ids.length > 0) emit('rowReordered', ids);
  });
  // 返回 false 阻止 VTable 客户端排序，由业务层 cursor orderBy 重查
  table.on('sort_click', (args: { field: unknown; order: unknown }) => {
    emit('sortClicked', { field: args.field, order: args.order });
    return false;
  });
  table.on('scroll', (args: { scrollDirection: string; scrollRatioY?: number; dy?: number }) => {
    if (
      args.scrollDirection === 'vertical' &&
      (args.dy ?? 0) > 0 &&
      (args.scrollRatioY ?? 0) > 0.9 &&
      !props.loadingMore
    ) {
      const fn = props.loadMore;
      if (fn) {
        fn();
      } else {
        emit('scrollNearBottom');
      }
    }
  });

  containerKeydownHandler = (e: KeyboardEvent) =>
    handleTableKeydown(
      {
        getTable: () => tableInstance.value,
        getSelectedCell: () => selectedCell,
        getColDef: col => getColDef(col),
        onCopy: () => void clipboard.copy(table, props.columns as Record<string, unknown>[]),
        onPaste: () => void pasteFromClipboard(),
        onDelete: () => deleteSelectedCells(),
        onCellChange: (col, row, val) => handleCellChange(col, row, val)
      },
      e
    );
  container.addEventListener('keydown', containerKeydownHandler);
};

const getColDef = (col: number): { cellType?: string; field?: string } | undefined =>
  (props.columns as Record<string, unknown>[])?.[col - ROW_SERIES_COL_OFFSET] as
    { cellType?: string; field?: string } | undefined;

const handleCellChange = (col: number, row: number, changedValue: unknown): void => {
  const record = tableInstance.value?.getRecordByCell(col, row) as EntityTableRecord | undefined;
  const fieldName = (getColDef(col) as { field?: string } | undefined)?.field;
  if (!record || !fieldName) return;
  emit('cellChanged', { col, row, field: fieldName, value: changedValue, record });
};

const showCellError = (col: number, row: number): void => {
  const table = tableInstance.value;
  if (!table) return;
  const detector = props.cellErrorDetector;
  if (!detector) return;
  const record = table.getRecordByCell(col, row) as EntityTableRecord | undefined;
  if (!record) return;
  const field = (getColDef(col) as { field?: string } | undefined)?.field;
  if (!field) return;
  const content = detector(record, field);
  if (!content) return;
  tooltip.showError(table, col, row, content, v => (cellTooltip.value = v), config?.tooltipDelay);
};

/** 将 PendingWrite[] 按 idField 归并为 BatchChangeItem[] */
const groupWrites = (writes: PendingWrite[]): BatchChangeItem[] => {
  const map = new Map<string, Record<string, unknown>>();
  for (const w of writes) {
    const id = String((w.record as Record<string, unknown>)[props.idField]);
    if (!map.has(id)) map.set(id, {});
    map.get(id)![w.field] = w.value;
  }
  return [...map.entries()].map(([recordId, changes]) => ({ recordId, changes }));
};

const pasteFromClipboard = async (): Promise<void> => {
  if (!tableInstance.value) return;
  const writes = await clipboard.paste(tableInstance.value, props.columns as Record<string, unknown>[]);
  if (writes.length > 0) {
    for (const w of writes) {
      if (typeof w.value === 'boolean') {
        setCellSwitchState(tableInstance.value, w.col, w.row, w.value);
      }
    }
    emit('batchUpdated', groupWrites(writes));
  }
};

const deleteSelectedCells = (): void => {
  const table = tableInstance.value;
  if (!table) return;
  const columns = props.columns as { field?: string; cellType?: string | ((...a: unknown[]) => string) }[];
  const { writes, boolCells } = collectDeleteWrites(table, columns, props.nonClearableFields, props.cellClearable);
  for (const bc of boolCells) setCellSwitchState(table, bc.col, bc.row, false);
  if (writes.length > 0) emit('batchUpdated', groupWrites(writes));
};

onMounted(() => {
  syncDetectedDarkMode();
  observeThemeChanges();

  const el = tableContainer.value;
  if (el && !tableInstance.value && props.columns?.length) {
    initTable(el);
    prevColumns = props.columns;
    tableReady.value = true;
  }
});

watch(
  () => [props.records, props.columns] as const,
  ([records, columns]) => {
    if (!tableInstance.value) {
      if (!tableReady.value && columns?.length) {
        const el = tableContainer.value;
        if (el) {
          initTable(el);
          prevColumns = columns;
          tableReady.value = true;
        }
      }
      return;
    }
    const columnsChanged = columns !== prevColumns;
    if (columnsChanged) {
      updateTableRecords(tableInstance.value, records, prevColumns ?? columns, columns);
      prevColumns = columns;
      prevRecords = records;
    } else if (records !== prevRecords) {
      tableInstance.value.setRecords(records);
      prevRecords = records;
    }
  }
);

watch([() => props.isDarkMode, detectedDarkMode], () => {
  redrawTheme();
});

onBeforeUnmount(() => {
  tooltip.cleanup();
  themeObserver?.disconnect();
  themeObserver = null;
  if (prefersDarkQuery && prefersDarkListener) {
    prefersDarkQuery.removeEventListener('change', prefersDarkListener);
  }
  prefersDarkQuery = null;
  prefersDarkListener = null;
  if (containerKeydownHandler) {
    containerEl?.removeEventListener('keydown', containerKeydownHandler);
    containerKeydownHandler = null;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (tableInstance.value) {
    completeTableEdit(tableInstance.value);
    tableInstance.value.release();
  }
  tableInstance.value = null;
  containerEl = null;
  tableReady.value = false;
});

defineExpose({
  tableInstance,
  tableContainer,
  headerHeight,
  cellTooltip,
  changeCellValue,
  redrawTheme
});
</script>

<template>
  <div class="rxdb-entity-table relative h-full w-full overflow-hidden">
    <div
      class="absolute inset-0"
      ref="tableContainer"
    />
    <div
      class="text-base-content/40 absolute inset-x-0 bottom-0 flex items-center justify-center text-sm"
      v-if="records.length === 0 && !loading"
      :style="{ top: headerHeight + 'px' }"
      aria-label="暂无数据"
      role="status"
    >
      <div class="empty-slot">
        <slot name="emptyState" />
      </div>
      <div class="empty-default flex flex-col items-center gap-3">
        <svg
          aria-hidden="true"
          fill="none"
          height="40"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.2"
          viewBox="0 0 24 24"
          width="40"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            height="18"
            rx="2"
            width="18"
            x="3"
            y="3"
          />
          <path d="M3 9h18" />
          <path d="M9 9v12" />
          <path d="M3 15h18" />
        </svg>
        <span>暂无数据</span>
      </div>
    </div>
    <div
      class="bg-base-100/60 absolute inset-0 z-10 flex items-center justify-center"
      v-if="loading"
    >
      <span class="loading loading-spinner loading-md text-primary" />
    </div>
    <div
      class="pointer-events-none absolute right-0 bottom-0 left-0 z-10 flex justify-center py-1.5"
      v-if="loadingMore"
    >
      <span class="loading loading-dots loading-sm text-primary" />
    </div>
    <div
      class="bg-base-300 text-base-content border-base-300 pointer-events-none fixed z-[100] max-w-xs rounded border px-2 py-1.5 text-xs shadow-lg"
      v-if="cellTooltip"
      :style="{ left: cellTooltip.x + 'px', top: cellTooltip.y + 'px' }"
      aria-atomic="true"
      aria-live="assertive"
      role="tooltip"
    >
      {{ cellTooltip.content }}
    </div>
  </div>
</template>

<style scoped>
.rxdb-entity-table {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.empty-slot:has(> *) ~ .empty-default {
  display: none;
}
</style>
