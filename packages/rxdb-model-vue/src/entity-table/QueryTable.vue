<script lang="ts" setup>
/**
 * 集成查询构建器的实体表格组件（对齐 Angular 侧 `QueryTableComponent`）。
 *
 * 在实体表格上方提供筛选栏插槽（`filterBar`）与空态插槽（`emptyState`），
 * 透传全部事件给内部 {@link EntityTable}，并渲染筛选状态栏（filtered / total 计数）。
 */
import type { BatchChangeItem, CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import type { ListTable, ListTableConstructorOptions } from '@visactor/vtable';
import { computed, ref } from 'vue';
import EntityTable from './EntityTable.vue';

const props = withDefaults(
  defineProps<{
    /** 表格行数据 */
    records: EntityTableRecord[];
    /** 列定义 */
    columns: ListTableConstructorOptions['columns'];
    /** 主键字段名 */
    idField?: string;
    /** 不可清空的字段集合 */
    nonClearableFields?: ReadonlySet<string>;
    /** VTable 构造选项 */
    // eslint-disable-next-line vue/require-default-prop -- 对象类型 props 的 undefined 默认与 withDefaults 类型推断不兼容（语义与 Angular 的 input<T | undefined>() 一致）
    tableOptions?: Partial<ListTableConstructorOptions>;
    /** 单元格错误检测器 */
    cellErrorDetector?: (record: EntityTableRecord, field: string) => string | null;
    /** 是否暗色主题（缺省自动探测） */
    isDarkMode?: boolean;
    /** 业务层回调判断单元格是否可清空 */
    cellClearable?: (record: Record<string, unknown>, field: string) => boolean;
    /** 查询条件是否激活（显示筛选状态标签） */
    queryActive?: boolean;
    /** 结果总数（显示在筛选状态栏中） */
    totalCount?: number;
    /** 筛选后结果数 */
    filteredCount?: number;
    /** 是否显示加载状态 */
    loading?: boolean;
    /** 加载更多中（已有数据，底部小 spinner） */
    loadingMore?: boolean;
    /** 触底时加载更多数据的回调，透传给 EntityTable */
    loadMore?: () => void;
  }>(),
  {
    idField: 'id',
    nonClearableFields: () => new Set<string>(),
    cellErrorDetector: undefined,
    isDarkMode: undefined,
    cellClearable: undefined,
    queryActive: false,
    totalCount: undefined,
    filteredCount: undefined,
    loading: false,
    loadingMore: false,
    loadMore: undefined
  }
);

const emit = defineEmits<{
  /** 单元格变更 */
  cellChanged: [event: CellChangeEvent];
  /** 行删除 */
  rowDeleted: [record: EntityTableRecord];
  /** 图标点击 */
  iconClicked: [event: { name: string; record: EntityTableRecord }];
  /** 批量变更 */
  batchUpdated: [items: BatchChangeItem[]];
  /** 行重排 */
  rowReordered: [ids: string[]];
  /** 触底且无 loadMore */
  scrollNearBottom: [];
  /** 列头排序点击 */
  sortClicked: [event: { field: unknown; order: unknown }];
}>();

/** 内部实体表格组件实例 */
const entityTable = ref<InstanceType<typeof EntityTable> | null>(null);

const statusText = computed(() => {
  const total = props.totalCount;
  const filtered = props.filteredCount;
  if (total == null) return '';
  if (filtered != null && filtered !== total) return `${filtered} / ${total}`;
  return `${total}`;
});

/** 表格引擎实例（委托给内部 EntityTable；未就绪时为 null） */
const tableInstance = computed<ListTable | null>(() => entityTable.value?.tableInstance ?? null);

const changeCellValue = (col: number, row: number, value: unknown): void => {
  entityTable.value?.changeCellValue(col, row, value);
};

const redrawTheme = (): void => {
  entityTable.value?.redrawTheme();
};

defineExpose({
  entityTable,
  statusText,
  tableInstance,
  changeCellValue,
  redrawTheme
});
</script>

<template>
  <div class="rxdb-query-table flex h-full w-full flex-col overflow-hidden">
    <!-- 筛选栏插槽 -->
    <slot name="filterBar" />

    <!-- 筛选状态栏 -->
    <div
      class="text-base-content/60 flex items-center gap-2 border-b px-3 py-1 text-xs"
      v-if="queryActive && statusText"
    >
      <span>{{ statusText }}</span>
    </div>

    <!-- 表格主体 -->
    <div class="min-h-0 flex-1">
      <EntityTable
        :cell-clearable="cellClearable"
        :cell-error-detector="cellErrorDetector"
        :columns="columns"
        :id-field="idField"
        :is-dark-mode="isDarkMode"
        :load-more="loadMore"
        :loading="loading"
        :loading-more="loadingMore"
        :non-clearable-fields="nonClearableFields"
        :records="records"
        :table-options="tableOptions"
        @batch-updated="emit('batchUpdated', $event)"
        @cell-changed="emit('cellChanged', $event)"
        @icon-clicked="emit('iconClicked', $event)"
        @row-deleted="emit('rowDeleted', $event)"
        @row-reordered="emit('rowReordered', $event)"
        @scroll-near-bottom="emit('scrollNearBottom')"
        @sort-clicked="emit('sortClicked', $event)"
        ref="entityTable"
      >
        <template #emptyState>
          <slot name="emptyState" />
        </template>
      </EntityTable>
    </div>
  </div>
</template>

<style scoped>
.rxdb-query-table {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
