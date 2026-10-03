/**
 * @fileoverview 表格单行拖动的读取与动态开关（US-028 阶段 B）
 *
 * VTable 只在建表时读 `rowSeriesNumber.dragOrder`，之后改选项不生效；手柄是否出现由
 * `rowSeriesNumberHelper.getIcons` 决定。所以建表时统一打开 `dragOrder`，再由
 * {@link setRowDragEnabled} 记下的开关在 `patchDragIconForReadonlyRows` 打的补丁里收掉手柄。
 */
import type * as VTable from '@visactor/vtable';
import type { EntityTableRecord } from '../interfaces.js';

/**
 * 单行拖放的结果：被拖行与它落点前后的邻居
 *
 * @remarks
 * 形状对齐 `Repository.reorder(id, { prevId, nextId })`；落到首部时 `prevId` 为 `null`，
 * 落到尾部时 `nextId` 为 `null`。只描述表格里看到的位置，是否允许落库由调用方决定。
 */
export interface RowMoveEvent {
  /** 被拖动行的主键 */
  readonly id: string;
  /** 落点之前那一行的主键；落到首部为 `null` */
  readonly prevId: string | null;
  /** 落点之后那一行的主键；落到尾部为 `null` */
  readonly nextId: string | null;
}

/**
 * VTable `change_header_position` 事件参数中本模块用到的部分
 */
export interface HeaderPositionChange {
  /** 拖动起点 */
  readonly source: { readonly col: number; readonly row: number };
  /** 放下后的位置 */
  readonly target: { readonly col: number; readonly row: number };
  /** 拖动的是行还是列 */
  readonly movingColumnOrRow?: 'row' | 'column';
}

/** 第 0 行是表头，数据从第 1 行开始 */
const FIRST_DATA_ROW = 1;

const disabledTables = new WeakSet<VTable.ListTable>();

const idAt = (table: VTable.ListTable, idField: string, row: number): string | null => {
  if (row < FIRST_DATA_ROW || row >= table.rowCount) return null;
  const id = (table.getRecordByCell(0, row) as EntityTableRecord | undefined)?.[idField];
  return typeof id === 'string' ? id : null;
};

/**
 * 从一次行拖放读出被拖行与落点邻居
 *
 * @param table - 已完成换位的表格实例（VTable 先 `changeRecordOrder` 再派发事件）
 * @param idField - 记录主键字段名
 * @param change - `change_header_position` 的事件参数
 * @returns 拖的是列、原位放下或被拖行主键不是字符串时为 `null`
 *
 * @example
 * ```typescript
 * table.on('change_header_position', args => {
 *   const move = readRowMove(table, 'id', args);
 *   if (move) emitRowMoved(move);
 * });
 * ```
 */
export function readRowMove(
  table: VTable.ListTable,
  idField: string,
  change: HeaderPositionChange
): RowMoveEvent | null {
  if (change.movingColumnOrRow === 'column' || change.source.row === change.target.row) return null;
  const row = change.target.row;
  const id = idAt(table, idField, row);
  if (id === null) return null;
  return { id, prevId: idAt(table, idField, row - 1), nextId: idAt(table, idField, row + 1) };
}

/**
 * 运行时开关表格的行拖动手柄
 *
 * @param table - 目标表格实例（建表时需开启 `rowSeriesNumber.dragOrder`）
 * @param enabled - `false` 时所有行都不显示手柄
 *
 * @remarks
 * 只在状态真的变化时重建单元格；手柄的收起依赖 `patchDragIconForReadonlyRows` 已经打过补丁。
 */
export function setRowDragEnabled(table: VTable.ListTable, enabled: boolean): void {
  if (enabled === isRowDragEnabled(table)) return;
  if (enabled) disabledTables.delete(table);
  else disabledTables.add(table);
  table.renderWithRecreateCells();
}

/**
 * 表格当前是否允许行拖动
 *
 * @param table - 目标表格实例
 * @returns 未调用过 {@link setRowDragEnabled} 时为 `true`
 */
export function isRowDragEnabled(table: VTable.ListTable): boolean {
  return !disabledTables.has(table);
}

/**
 * 把表格行恢复成最近一次提交的顺序
 *
 * @param table - 目标表格实例
 * @param records - 交给表格的那份记录数组（会被原地改回）
 * @param committed - 最近一次 `setRecords` 时记下的顺序副本
 *
 * @remarks
 * VTable 拖放换位是对传入数组原地 `splice`，交进去的记录数组此时已是拖后的顺序；
 * 所以宿主组件每次交数据时要另存一份副本，失败或被拒时用它把数组改回去再重绘。
 */
export function restoreTableRecords(
  table: VTable.ListTable,
  records: EntityTableRecord[],
  committed: readonly EntityTableRecord[]
): void {
  records.splice(0, records.length, ...committed);
  table.setRecords(records);
}
