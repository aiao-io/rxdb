import type * as VTable from '@visactor/vtable';

/**
 * VTable ListTable 类型补充工具
 *
 * VTable 官方类型未导出部分内部方法，此模块提供类型安全的包装器，
 * 避免散落的 `as unknown as` 类型断言。
 * 所有包装器在调用前做运行时 `in` 检查，VTable 版本升级移除 API 时安全降级。
 */

/**
 * VTable rowSeriesNumber 列占据 col=0，数据列从 col=1 开始。
 * 将 VTable 列索引映射到 columns 数组索引时需减此偏移。
 */
export const ROW_SERIES_COL_OFFSET = 1;

type AnyTable = Record<string, unknown>;

/**
 * 设置 switch/checkbox/radio 单元格视觉状态
 *
 * @param table 目标表格实例
 * @param col 列索引
 * @param row 行索引
 * @param value 目标布尔状态
 */
export function setCellSwitchState(table: VTable.ListTable, col: number, row: number, value: boolean): void {
  const t = table as unknown as AnyTable;
  if (typeof t['setCellSwitchState'] === 'function') {
    (t['setCellSwitchState'] as (c: number, r: number, v: boolean) => void)(col, row, value);
  }
}

/**
 * 获取表格 DOM 容器元素
 *
 * @param table 目标表格实例
 * @returns 容器元素；VTable 未提供该方法时返回 undefined
 */
export function getTableContainer(table: VTable.ListTable): HTMLElement | undefined {
  const t = table as unknown as AnyTable;
  if (typeof t['getContainer'] === 'function') {
    return (t['getContainer'] as () => HTMLElement)();
  }
  return undefined;
}

/**
 * 检查表格是否正在编辑中
 *
 * @param table 目标表格实例
 * @returns 存在活动编辑器时为 true
 */
export function isTableEditing(table: VTable.ListTable): boolean {
  const em = (table as unknown as AnyTable)['editorManager'] as AnyTable | undefined;
  return !!em?.['editingEditor'];
}

/**
 * 完成当前单元格编辑
 *
 * @param table 目标表格实例
 */
export function completeTableEdit(table: VTable.ListTable): void {
  const em = (table as unknown as AnyTable)['editorManager'] as AnyTable | undefined;
  if (em?.['editCell'] && typeof em['completeEdit'] === 'function') {
    (em['completeEdit'] as () => void)();
  }
}

/**
 * 回写单元格值（不触发编辑事件）
 *
 * @param table 目标表格实例
 * @param col 列索引
 * @param row 行索引
 * @param value 写入的值
 */
export function changeCellValue(table: VTable.ListTable, col: number, row: number, value: unknown): void {
  const t = table as unknown as AnyTable;
  if (typeof t['changeCellValue'] === 'function') {
    (t['changeCellValue'] as (...args: unknown[]) => void)(col, row, value, false, false);
  }
}
