/** 编辑上下文中与读取单元格原始值有关的部分。 */
interface CellOriginContext {
  readonly table?: unknown;
  readonly col: number;
  readonly row: number;
  readonly value?: unknown;
}

type OriginTable = { getCellOriginValue(col: number, row: number): unknown };

const readsOrigin = (table: unknown): table is OriginTable =>
  typeof (table as Partial<OriginTable> | null | undefined)?.getCellOriginValue === 'function';

/**
 * 读取正在编辑的单元格的原始值。
 *
 * @remarks 表格能给出原始值时一律以它为准，`null` / `undefined` 也是单元格的真实值（已清空、新增行）；
 * 只有没有表格（单测、宿主直接驱动编辑器）时才用 `ctx.value`。
 * VTable 以键盘输入开始编辑时 `ctx.value` 是空串，宿主经 `startEditCell(col, row, value)` 开始编辑时是任意值，
 * 原先的 `getCellOriginValue(...) ?? ctx.value` 会把它们当成空单元格的值。
 * @param ctx - VTable 编辑上下文
 * @returns 单元格原始值
 */
export function readCellOrigin(ctx: CellOriginContext): unknown {
  return readsOrigin(ctx.table) ? ctx.table.getCellOriginValue(ctx.col, ctx.row) : ctx.value;
}
