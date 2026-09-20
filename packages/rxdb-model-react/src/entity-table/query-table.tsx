/**
 * @fileoverview 集成查询构建器的实体表格组件（Angular `QueryTableComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：`filterBar` 插槽 + 筛选状态栏（filtered / total 计数）
 * + `EntityTable`，事件全部透传；命令式能力经 ref handle 委托给内部表格。
 *
 * @module entity-table/query-table
 */
import type { BatchChangeItem, CellChangeEvent, EntityTableRecord } from '@aiao/rxdb-model';
import type { ListTable, ListTableConstructorOptions } from '@visactor/vtable';
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { EntityTable, type EntityTableHandle } from './entity-table';
import './query-table.css';

/** 查询表格命令面（对应 Angular 组件的公开 getter / 方法）。 */
export interface QueryTableHandle {
  /** 内部实体表格的 VTable 实例；未初始化时为 `null`。 */
  readonly tableInstance: ListTable | null;
  /** 回滚单元格值（委托给内部实体表格）。 */
  changeCellValue(col: number, row: number, value: unknown): void;
  /** 重绘主题（委托给内部实体表格）。 */
  redrawTheme(): void;
}

/** {@link QueryTable} 的 props。 */
export interface QueryTableProps {
  /** 表格记录。 */
  records: EntityTableRecord[];
  /** 列定义。 */
  columns: NonNullable<ListTableConstructorOptions['columns']>;
  /** 主键字段名，缺省 `'id'`。 */
  idField?: string;
  /** 不可清空的字段集合。 */
  nonClearableFields?: ReadonlySet<string>;
  /** 透传给 VTable 的额外表格选项。 */
  tableOptions?: Partial<ListTableConstructorOptions>;
  /** 单元格错误检测器。 */
  cellErrorDetector?: (record: EntityTableRecord, field: string) => string | null;
  /** 暗色模式；缺省时自动探测。 */
  isDarkMode?: boolean;
  /** 业务层回调判断单元格是否可清空。 */
  cellClearable?: (record: Record<string, unknown>, field: string) => boolean;
  /** 查询条件是否激活（显示筛选状态标签）。 */
  queryActive?: boolean;
  /** 结果总数（显示在筛选状态栏中）。 */
  totalCount?: number;
  /** 筛选后结果数。 */
  filteredCount?: number;
  /** 是否显示加载状态。 */
  loading?: boolean;
  /** 加载更多中。 */
  loadingMore?: boolean;
  /** 触底时加载更多数据的回调，透传给 EntityTable。 */
  loadMore?: () => void;
  /** 筛选栏插槽（对应 Angular 的 `[filterBar]` 内容投影）。 */
  filterBar?: ReactNode;
  /** 空态插槽（对应 Angular 的 `[emptyState]` 内容投影）。 */
  emptyState?: ReactNode;
  /** 单元格变更。 */
  onCellChanged?: (event: CellChangeEvent) => void;
  /** 行删除。 */
  onRowDeleted?: (record: EntityTableRecord) => void;
  /** 非删除类图标点击。 */
  onIconClicked?: (event: { name: string; record: EntityTableRecord }) => void;
  /** 批量变更。 */
  onBatchUpdated?: (mutations: BatchChangeItem[]) => void;
  /** 行重排。 */
  onRowReordered?: (orderedIds: string[]) => void;
  /** 触底且未提供 loadMore 时输出。 */
  onScrollNearBottom?: () => void;
  /** 列头排序点击。 */
  onSortClicked?: (event: { field: unknown; order: unknown }) => void;
}

/**
 * 查询表格组件：筛选栏插槽 + 筛选状态栏 + EntityTable。
 */
export const QueryTable = forwardRef<QueryTableHandle, QueryTableProps>(function QueryTable(
  {
    records,
    columns,
    idField = 'id',
    nonClearableFields = new Set<string>(),
    tableOptions,
    cellErrorDetector,
    isDarkMode,
    cellClearable,
    queryActive = false,
    totalCount,
    filteredCount,
    loading = false,
    loadingMore = false,
    loadMore,
    filterBar,
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
  const entityTableRef = useRef<EntityTableHandle | null>(null);

  const statusText =
    totalCount == null ? ''
    : filteredCount != null && filteredCount !== totalCount ? `${filteredCount} / ${totalCount}`
    : `${totalCount}`;

  useImperativeHandle(
    ref,
    () => ({
      get tableInstance(): ListTable | null {
        return entityTableRef.current?.tableInstance ?? null;
      },
      changeCellValue(col: number, row: number, value: unknown): void {
        entityTableRef.current?.changeCellValue(col, row, value);
      },
      redrawTheme(): void {
        entityTableRef.current?.redrawTheme();
      }
    }),
    []
  );

  return (
    <div className='rxdb-query-table flex h-full w-full flex-col overflow-hidden'>
      {filterBar}
      {queryActive && statusText && (
        <div className='text-base-content/60 flex items-center gap-2 border-b px-3 py-1 text-xs'>
          <span>{statusText}</span>
        </div>
      )}
      <div className='min-h-0 flex-1'>
        <EntityTable
          ref={entityTableRef}
          records={records}
          columns={columns}
          idField={idField}
          nonClearableFields={nonClearableFields}
          tableOptions={tableOptions}
          cellErrorDetector={cellErrorDetector}
          isDarkMode={isDarkMode}
          cellClearable={cellClearable}
          loading={loading}
          loadingMore={loadingMore}
          loadMore={loadMore}
          emptyState={emptyState}
          onCellChanged={onCellChanged}
          onRowDeleted={onRowDeleted}
          onIconClicked={onIconClicked}
          onBatchUpdated={onBatchUpdated}
          onRowReordered={onRowReordered}
          onScrollNearBottom={onScrollNearBottom}
          onSortClicked={onSortClicked}
        />
      </div>
    </div>
  );
});
