import type * as VTable from '@visactor/vtable';
import type { ListTableConstructorOptions } from '@visactor/vtable';
import type { EntityTableRecord } from '../interfaces.js';

declare const ngDevMode: boolean | undefined;

/**
 * HACK: VTable 不提供禁用特定行拖拽的 API，通过 monkey-patch 内部属性实现
 *
 * TODO(vtable-upstream): 跟踪 VTable 上游 API，一旦提供 per-row dragOrder 配置即可移除此 hack
 * @see https://github.com/AgoraIO/vtable/issues — 搜索 "drag order per row"
 * @param table 目标表格实例
 */
export function patchDragIconForReadonlyRows(table: VTable.ListTable): void {
  const helper = (table as unknown as Record<string, unknown>)['internalProps'] as
    { rowSeriesNumberHelper?: { getIcons: (col: number, row: number) => unknown[] } } | undefined;
  if (!helper?.rowSeriesNumberHelper) {
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      console.warn('[entity-table] VTable internalProps.rowSeriesNumberHelper not found — drag icon patch skipped');
    }
    return;
  }
  const original = helper.rowSeriesNumberHelper.getIcons.bind(helper.rowSeriesNumberHelper);
  helper.rowSeriesNumberHelper.getIcons = (col: number, row: number): unknown[] => {
    const record = table.getRecordByCell(col, row) as EntityTableRecord | undefined;
    if (record?._readonly || record?._isAddRow) return [];
    return original(col, row);
  };
}

/**
 * 收集拖拽排序后的非只读行 ID 列表
 *
 * @param table 目标表格实例
 * @param idField 记录 ID 字段名
 * @returns 按当前行顺序排列的非只读行 ID
 */
export function collectReorderedIds(table: VTable.ListTable, idField: string): string[] {
  const rowCount = table.rowCount;
  const orderedIds: string[] = [];
  for (let row = 1; row < rowCount; row++) {
    const record = table.getRecordByCell(0, row) as EntityTableRecord | undefined;
    if (record && !record._readonly && !record._isAddRow) {
      const id = record[idField];
      if (typeof id === 'string') orderedIds.push(id);
    }
  }
  return orderedIds;
}

/**
 * 更新表格数据并恢复列宽（按 field 名匹配，容忍列增删）
 *
 * @param table 目标表格实例
 * @param records 更新后的行数据
 * @param prevColumns 更新前的列定义，用于读取旧列宽
 * @param newColumns 更新后的列定义
 */
export function updateTableRecords(
  table: VTable.ListTable,
  records: EntityTableRecord[],
  prevColumns: ListTableConstructorOptions['columns'],
  newColumns: ListTableConstructorOptions['columns']
): void {
  const prevCols = prevColumns as { field?: string }[];
  const colCount = table.colCount;
  const widthByField = new Map<string, number>();
  for (let col = 1; col < colCount; col++) {
    const field = prevCols[col - 1]?.field;
    if (field) widthByField.set(field, table.getColWidth(col));
  }
  table.setRecords(records);
  if (newColumns) table.updateColumns(newColumns as never);
  const newColDefs = newColumns as { field?: string }[] | undefined;
  const newColCount = table.colCount;
  for (let col = 1; col < newColCount; col++) {
    const field = newColDefs?.[col - 1]?.field;
    if (field) {
      const w = widthByField.get(field);
      if (w !== undefined) table.setColWidth(col, w);
    }
  }
}
