/**
 * 实体表格模块
 *
 * 提供 VTable 驱动的实体表格基础设施：接口与配置、表格工厂/主题/操作、
 * 自定义编辑器与列构建工具的统一出口。
 *
 * @module entity-table
 */
// 接口与配置
export type {
  BatchChangeItem,
  CellChangeEvent,
  EntityTableConfig,
  EntityTableRecord,
  PendingWrite,
  RowDeleteEvent,
  RowReorderEvent
} from './interfaces.js';

// VTable 基础设施
export {
  TableClipboardManager,
  applyClipboard,
  applySystemText,
  collectDeleteWrites,
  formatAsTsv,
  snapshotSelection,
  type ClipboardCell,
  type ClipboardContent
} from './vtable/table-clipboard.js';
export {
  _resetEditorRegistry,
  buildTableOptions,
  createListTable,
  ensureBaseEditorRegistered,
  registerEditor
} from './vtable/table-factory.js';
export { handleTableKeydown, type KeyboardHandlerContext } from './vtable/table-keyboard.js';
export { collectReorderedIds, patchDragIconForReadonlyRows, updateTableRecords } from './vtable/table-operations.js';
export { createTheme, getCSSVariables, getDefaultColors, type CSSVariables } from './vtable/table-theme.js';
export { CellTooltipManager, computeTooltipPosition } from './vtable/table-tooltip.js';
export {
  ROW_SERIES_COL_OFFSET,
  changeCellValue,
  completeTableEdit,
  getTableContainer,
  isTableEditing,
  setCellSwitchState
} from './vtable/vtable-compat.js';

// 自定义编辑器
export { ColorEditor } from './editors/color-editor.js';
export { DateEditor } from './editors/date-editor.js';
export { EnumEditor, type EnumItem } from './editors/enum-editor.js';
export {
  DAISY_COLORS,
  GlobalOverlayEditor,
  positionOverlayPanel,
  scheduleEditorSetup
} from './editors/global-overlay-editor.js';
export { IconListEditor, type IconLabeledItem } from './editors/icon-list-editor.js';
export { JsonEditor } from './editors/json-editor.js';
export { KeyValueEditor } from './editors/key-value-editor.js';
export { lucideToSvgElement, type IconData } from './editors/lucide-svg.js';
export { MultiSelectEditor, type MultiSelectOption } from './editors/multiselect-editor.js';
export { NumberEditor, type NumberEditorOptions } from './editors/number-editor.js';
export { RelationEditor } from './editors/relation-editor.js';
export { SafeListEditor } from './editors/safe-list-editor.js';
export { TagsEditor, type TagsMode } from './editors/tags-editor.js';
export { TextFormatEditor, type TextFormatMode } from './editors/text-format-editor.js';

// 列工具
export {
  DELETE_COLOR,
  actionsColumn,
  buildPropertyColumn,
  disabledEditorForReadonly,
  formatDateValue,
  getCellRecord,
  isReadonly,
  isReadonlyOrAddRow,
  makeDeleteIcons,
  makeEditorForReadonly,
  parsePropertyColumnValue,
  switchDisabledForReadonly,
  type KVSchemaEntry,
  type PropertyColumnConfig,
  type PropertyTypeString,
  type SwitchDisableCallback
} from './columns/column-utils.js';
