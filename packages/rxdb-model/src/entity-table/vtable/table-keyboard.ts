import type * as VTable from '@visactor/vtable';
import type { EntityTableRecord } from '../interfaces.js';
import { isTableEditing, setCellSwitchState } from './vtable-compat.js';

/** 键盘处理上下文 — 由组件提供回调 */
export interface KeyboardHandlerContext {
  /** 获取当前表格实例 */
  getTable(): VTable.ListTable | null;
  /** 获取当前选中单元格坐标 */
  getSelectedCell(): {
    /** 列索引 */
    col: number;
    /** 行索引 */
    row: number;
  } | null;
  /** 按列索引获取列定义 */
  getColDef(col: number):
    | {
        /** 单元格类型 */
        cellType?: string;
        /** 字段名 */
        field?: string;
      }
    | undefined;
  /** 复制回调 */
  onCopy(): void;
  /** 粘贴回调 */
  onPaste(): void;
  /** 删除回调 */
  onDelete(): void;
  /** 单元格值变更回调 */
  onCellChange(col: number, row: number, value: unknown): void;
}

/** 可通过 Enter / Space 切换的布尔类型列 */
const TOGGLE_CELL_TYPES = new Set(['switch', 'checkbox', 'radio']);

/**
 * 表格容器 keydown 事件处理 — 剪贴板快捷键 + 布尔切换 + 删除。
 * 编辑状态下不拦截剪贴板快捷键与删除键。
 *
 * @param ctx 键盘处理上下文
 * @param e 键盘事件
 */
export function handleTableKeydown(ctx: KeyboardHandlerContext, e: KeyboardEvent): void {
  const table = ctx.getTable();
  if (!table) return;
  const editing = isTableEditing(table);
  const isCtrl = e.ctrlKey || e.metaKey;

  if (isCtrl && e.key === 'c') {
    if (editing) return;
    ctx.onCopy();
    e.preventDefault();
    return;
  }
  if (isCtrl && e.key === 'v') {
    if (editing) return;
    ctx.onPaste();
    e.preventDefault();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    ctx.onDelete();
    return;
  }
  if (e.key !== 'Enter' && e.key !== ' ') return;
  toggleCellValue(ctx, e);
}

/** Enter / Space 切换 switch / checkbox / radio 单元格值 */
function toggleCellValue(ctx: KeyboardHandlerContext, e: KeyboardEvent): void {
  const sel = ctx.getSelectedCell();
  if (!sel) return;
  const colDef = ctx.getColDef(sel.col);
  if (!colDef?.cellType || !TOGGLE_CELL_TYPES.has(colDef.cellType)) return;
  const table = ctx.getTable()!;
  const record = table.getRecordByCell(sel.col, sel.row) as EntityTableRecord | undefined;
  if (record?._readonly) return;
  e.preventDefault();
  if (!colDef.field) return;
  const currentValue = (record as Record<string, unknown> | undefined)?.[colDef.field];
  const newValue = !currentValue;
  setCellSwitchState(table, sel.col, sel.row, newValue);
  ctx.onCellChange(sel.col, sel.row, newValue);
}
