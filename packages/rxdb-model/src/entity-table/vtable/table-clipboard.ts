import type * as VTable from '@visactor/vtable';
import { UUID_RE } from '../../entity-value.utils.js';
import type { EntityTableRecord, PendingWrite } from '../interfaces.js';

/** 布尔类型列 */
const BOOL_CELL_TYPES = new Set(['switch', 'checkbox', 'radio']);

/** 验证失败哨值 — 区分「无效值应跳过」与「合法的 null/空 」 */
const INVALID = Symbol('invalid');

/**
 * 针对 propertyType 验证并转换来自系统剪贴板的字符串值。
 * - 返回 INVALID 表示验证不通过，应跳过该单元格。
 * - 返回其他值（包括 null）表示写入该值（空字符串/null 表示清空）。
 */
function parseSystemValue(value: string, propertyType: string | undefined): unknown {
  const trimmed = value.trim();
  switch (propertyType) {
    case 'uuid':
      if (trimmed === '') return '';
      return UUID_RE.test(trimmed) ? trimmed : INVALID;
    case 'number': {
      if (trimmed === '') return null;
      const n = Number(trimmed);
      return isNaN(n) ? INVALID : n;
    }
    case 'integer': {
      if (trimmed === '') return null;
      if (!/^-?\d+$/.test(trimmed)) return INVALID;
      return parseInt(trimmed, 10);
    }
    case 'bigint': {
      if (trimmed === '') return null;
      if (!/^-?\d+$/.test(trimmed)) return INVALID;
      return BigInt(trimmed);
    }
    case 'binary': {
      if (trimmed === '') return null;
      if (trimmed.length % 2 !== 0 || !/^(?:[0-9a-fA-F]{2})+$/.test(trimmed)) return INVALID;
      const bytes = new Uint8Array(trimmed.length / 2);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    case 'date': {
      if (trimmed === '') return null;
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? INVALID : value;
    }
    case 'json': {
      if (trimmed === '') return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return INVALID;
      }
    }
    case 'keyValue': {
      if (trimmed === '') return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return INVALID;
        return parsed;
      } catch {
        return INVALID;
      }
    }
    case 'enum':
      // isAllowedByMenuList 已在外层过滤不合法枚举值，此处仅确保返回字符串
      return trimmed;
    case 'stringArray': {
      if (trimmed === '') return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || parsed.some(el => typeof el !== 'string')) return INVALID;
        return parsed;
      } catch {
        return INVALID;
      }
    }
    case 'numberArray': {
      if (trimmed === '') return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed) || parsed.some(el => typeof el !== 'number' || isNaN(el))) return INVALID;
        return parsed;
      } catch {
        return INVALID;
      }
    }
    default:
      return value;
  }
}

/**
 * 当列定义包含 menuList 时，检查值是否在允许的枚举选项中。
 * - strict=false（默认）：无 menuList 时返回 true（不限制）。
 * - strict=true（enum 列）：无 menuList 时返回 false（必须有 menuList 才能验证）。
 */
function isAllowedByMenuList(colDef: Record<string, unknown> | undefined, value: string, strict = false): boolean {
  const menuList = colDef?.['menuList'] as Array<{ value: unknown } | string> | undefined;
  if (!menuList?.length) return !strict;
  return menuList.some(m => String(typeof m === 'object' ? (m.value ?? '') : m) === value);
}

/** 文本 → 布尔值转换（仅已知值，未知则返回 undefined 表示跳过） */
const TRUTHY_TEXT = new Set(['true', '1', 'yes', '是']);
const FALSY_TEXT = new Set(['false', '0', 'no', '否', '']);
function textToBoolean(text: string): boolean | undefined {
  const t = text.trim().toLowerCase();
  if (TRUTHY_TEXT.has(t)) return true;
  if (FALSY_TEXT.has(t)) return false;
  return undefined;
}

/** 单个单元格的剪贴板快照 */
export interface ClipboardCell {
  /** 列索引 */
  col: number;
  /** 字段名 */
  field: string;
  /** 单元格值 */
  value: unknown;
  /** 单元格类型 */
  cellType: string;
  /** 属性类型 */
  propertyType?: string;
}

/** 剪贴板内容：行优先二维数组 `[rowOffset][colOffset]` */
export type ClipboardContent = ClipboardCell[][];

/** 从 VTable 选区提取去重排序后的目标行/列，排除表头 */
function getDestRowsCols(table: VTable.ListTable): { destRows: number[]; destCols: number[] } | null {
  const cellInfos = table.getSelectedCellInfos() as VTable.TYPES.CellInfo[][] | null;
  if (!cellInfos?.length) return null;
  const flat = cellInfos.flat().filter(c => c.row > 0);
  if (!flat.length) return null;
  return {
    destRows: [...new Set(flat.map(c => c.row))].sort((a, b) => a - b),
    destCols: [...new Set(flat.map(c => c.col))].sort((a, b) => a - b)
  };
}

/**
 * PropertyType 兼容分组 — 同组之间允许粘贴，跨组则拒绝。
 * 未定义的类型视为 'text'。
 */
const PROPERTY_TYPE_GROUP: Record<string, string> = {
  string: 'text',
  uuid: 'text',
  enum: 'enum',
  number: 'number',
  integer: 'number',
  bigint: 'number',
  boolean: 'boolean',
  date: 'date',
  binary: 'binary',
  stringArray: 'stringArray',
  numberArray: 'numberArray',
  json: 'object',
  keyValue: 'object'
};

/** 取 propertyType 的兼容分组，未定义类型返回空字符串 */
function getPropertyTypeGroup(type: string | undefined): string {
  return type ? (PROPERTY_TYPE_GROUP[type] ?? 'text') : '';
}

/**
 * 将当前 VTable 选区快照为剪贴板内容。
 *
 * 跳过：表头行、只读行、新增行、元字段列（`_` 前缀）。
 *
 * @param table 目标表格实例
 * @param columns 列定义列表（可选），用于读取列属性类型
 * @returns 剪贴板快照；无可复制单元格时返回 null
 */
export function snapshotSelection(
  table: VTable.ListTable,
  columns?: readonly Record<string, unknown>[]
): ClipboardContent | null {
  const cellInfos = table.getSelectedCellInfos() as VTable.TYPES.CellInfo[][] | null;
  if (!cellInfos?.length) return null;

  const result: ClipboardContent = [];

  for (const rowCells of cellInfos) {
    const clipRow: ClipboardCell[] = [];

    for (const cell of rowCells) {
      if (cell.row === 0) continue;
      const field = cell.field == null ? '' : String(cell.field);
      if (!field || field.startsWith('_')) continue;

      const record = table.getRecordByCell(cell.col, cell.row) as EntityTableRecord | undefined;
      if (!record || record._readonly || record._isAddRow) continue;

      clipRow.push({
        col: cell.col,
        field,
        value: (record as Record<string, unknown>)[field],
        cellType: String(cell.cellType ?? 'text'),
        propertyType: (columns?.[cell.col - 1]?.['_propertyType'] as string) ?? undefined
      });
    }

    if (clipRow.length) result.push(clipRow);
  }

  return result.length ? result : null;
}

/**
 * 将 ClipboardContent 序列化为 TSV 字符串
 *
 * @param clipboard 内部剪贴板内容
 * @returns TSV 格式文本，null/undefined 值序列化为空字符串
 */
export function formatAsTsv(clipboard: ClipboardContent): string {
  return clipboard.map(row => row.map(cell => String(cell.value ?? '')).join('\t')).join('\n');
}

/**
 * 从内部剪贴板收集待写入操作（按列位置匹配，类 Excel 行为）。
 * cellType 必须一致；行/列数不足时循环复用。
 * 若目标列定义了 menuList，则跳过不在枚举范围内的值。
 *
 * @param table 目标表格实例
 * @param clipboard 内部剪贴板内容
 * @param columns 列定义列表（可选），用于读取列属性类型与枚举选项
 * @returns 待写入操作列表
 */
export function applyClipboard(
  table: VTable.ListTable,
  clipboard: ClipboardContent,
  columns?: readonly Record<string, unknown>[]
): PendingWrite[] {
  const sel = getDestRowsCols(table);
  if (!sel) return [];
  const { destRows, destCols } = sel;

  const clipRowCount = clipboard.length;
  const clipColCount = clipboard[0]?.length ?? 0;
  if (!clipColCount) return [];

  const pending: PendingWrite[] = [];
  for (let rowI = 0; rowI < destRows.length; rowI++) {
    const targetRow = destRows[rowI];
    const clipRow = clipboard[rowI % clipRowCount];

    const targetRecord = table.getRecordByCell(destCols[0], targetRow) as EntityTableRecord | undefined;
    if (!targetRecord || targetRecord._readonly || targetRecord._isAddRow) continue;

    for (let colI = 0; colI < destCols.length; colI++) {
      const targetCol = destCols[colI];
      const clipCell = clipRow[colI % clipColCount];

      const targetCellInfo = table.getCellInfo(targetCol, targetRow) as { cellType?: unknown; field?: unknown };
      if (String(targetCellInfo.cellType ?? 'text') !== clipCell.cellType) continue;

      const colDef = columns?.[targetCol - 1];
      const srcGroup = getPropertyTypeGroup(clipCell.propertyType);
      const dstGroup = getPropertyTypeGroup(colDef?.['_propertyType'] as string | undefined);
      if (srcGroup && dstGroup && srcGroup !== dstGroup) continue;

      if (!isAllowedByMenuList(colDef, String(clipCell.value ?? ''))) continue;

      const field = String(targetCellInfo.field ?? '');
      pending.push({ col: targetCol, row: targetRow, value: clipCell.value, field, record: targetRecord });
    }
  }
  return pending;
}

/**
 * 从系统剪贴板文本（TSV）收集待写入操作。
 * 布尔列自动将文本转为布尔值（true/1/yes/是 → true，false/0/no/否/空 → false），
 * 无法识别的值跳过；枚举列跳过不在 menuList 中的值；行/列数不足时循环复用。
 *
 * @param table 目标表格实例
 * @param text 系统剪贴板文本（TSV 格式，按 \n 分行、\t 分列）
 * @param columns 列定义列表（可选），用于读取列属性类型与枚举选项
 * @returns 待写入操作列表
 */
export function applySystemText(
  table: VTable.ListTable,
  text: string,
  columns?: readonly Record<string, unknown>[]
): PendingWrite[] {
  const rows = text.split('\n').map(r => r.split('\t').map(v => v.trimEnd()));
  const sel = getDestRowsCols(table);
  if (!sel) return [];
  const { destRows, destCols } = sel;

  const clipRowCount = rows.length;
  const clipColCount = rows[0]?.length ?? 0;
  if (!clipColCount) return [];

  const pending: PendingWrite[] = [];
  for (let rowI = 0; rowI < destRows.length; rowI++) {
    const targetRow = destRows[rowI];
    const clipRow = rows[rowI % clipRowCount];

    const targetRecord = table.getRecordByCell(destCols[0], targetRow) as EntityTableRecord | undefined;
    if (!targetRecord || targetRecord._readonly || targetRecord._isAddRow) continue;

    for (let colI = 0; colI < destCols.length; colI++) {
      const targetCol = destCols[colI];
      const value = clipRow[colI % clipColCount] ?? '';

      const targetCellInfo = table.getCellInfo(targetCol, targetRow) as { cellType?: unknown; field?: unknown };
      const targetCellType = String(targetCellInfo.cellType ?? 'text');
      const field = String(targetCellInfo.field ?? '');

      if (BOOL_CELL_TYPES.has(targetCellType)) {
        const boolValue = textToBoolean(value);
        if (boolValue === undefined) continue;
        pending.push({ col: targetCol, row: targetRow, value: boolValue, field, record: targetRecord });
      } else {
        const colDef = columns?.[targetCol - 1];
        const propertyType = colDef?.['_propertyType'] as string | undefined;
        // enum 列必须有 menuList 且值在其中才允许写入（strict=true）
        if (!isAllowedByMenuList(colDef, value, propertyType === 'enum')) continue;
        const converted = parseSystemValue(value, propertyType);
        if (converted === INVALID) continue;
        pending.push({ col: targetCol, row: targetRow, value: converted, field, record: targetRecord });
      }
    }
  }
  return pending;
}

/**
 * 从选区收集 Delete/Backspace 需要清空的单元格写入列表。
 *
 * @param table 目标表格实例
 * @param columns 列定义列表
 * @param nonClearableFields 禁止清空的字段名集合
 * @param cellClearable 业务层回调判断单元格是否可清空，返回 false 跳过该单元格
 * @returns writes — 需要写入的清空操作；boolCells — 需要刷新视觉状态的布尔列坐标
 */
export function collectDeleteWrites(
  table: VTable.ListTable,
  columns: readonly { field?: string; cellType?: string | ((...args: unknown[]) => string) }[],
  nonClearableFields: ReadonlySet<string>,
  cellClearable?: (record: Record<string, unknown>, field: string) => boolean
): { writes: PendingWrite[]; boolCells: { col: number; row: number }[] } {
  const cellInfos = table.getSelectedCellInfos() as { col: number; row: number; field?: unknown }[][] | null;
  if (!cellInfos?.length) return { writes: [], boolCells: [] };

  const writes: PendingWrite[] = [];
  const boolCells: { col: number; row: number }[] = [];

  for (const rowCells of cellInfos) {
    for (const cell of rowCells) {
      if (cell.row === 0) continue;
      const record = table.getRecordByCell(cell.col, cell.row) as Record<string, unknown> | undefined;
      if (!record || record['_readonly'] || record['_isAddRow']) continue;
      const colDef = columns[cell.col - 1];
      const field = colDef?.field;
      if (!field || field.startsWith('_')) continue;
      if (nonClearableFields.has(field)) continue;
      if (cellClearable && !cellClearable(record, field)) continue;

      const isBool = BOOL_CELL_TYPES.has(typeof colDef.cellType === 'string' ? colDef.cellType : '');
      const clearValue = isBool ? false : '';
      const currentValue = record[field];
      const alreadyClear = isBool ? !currentValue : currentValue === '' || currentValue == null;
      if (alreadyClear) {
        if (isBool) boolCells.push({ col: cell.col, row: cell.row });
        continue;
      }
      writes.push({ col: cell.col, row: cell.row, value: clearValue, field, record: record as EntityTableRecord });
      if (isBool) boolCells.push({ col: cell.col, row: cell.row });
    }
  }

  return { writes, boolCells };
}

/** 内部剪贴板管理器 — 封装系统剪贴板 API 交互 + 内部备份 */
export class TableClipboardManager {
  #content: ClipboardContent | null = null;
  #lastWrittenTsv = '';

  /** 复制当前选区到系统剪贴板，并写入内部备份 */
  async copy(table: VTable.ListTable, columns?: readonly Record<string, unknown>[]): Promise<void> {
    const content = snapshotSelection(table, columns);
    if (!content) return;
    this.#content = content;
    const tsv = formatAsTsv(content);
    this.#lastWrittenTsv = tsv;
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      // fallback: internal clipboard still works
    }
  }

  /** 粘贴：系统剪贴板文本与上次写入不同时按文本解析，否则退回内部备份按列匹配写入 */
  async paste(table: VTable.ListTable, columns?: readonly Record<string, unknown>[]): Promise<PendingWrite[]> {
    let systemText = '';
    try {
      systemText = await navigator.clipboard.readText();
    } catch {
      // fallback
    }
    if (systemText && systemText !== this.#lastWrittenTsv) {
      return applySystemText(table, systemText, columns);
    }
    if (this.#content) {
      return applyClipboard(table, this.#content, columns);
    }
    return [];
  }
}
