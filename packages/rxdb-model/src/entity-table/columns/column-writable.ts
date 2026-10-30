/**
 * @fileoverview 列级可写判据（包内共享，不经包入口导出）。
 *
 * 一列数据接不接受写入，在列构建时一处判定（`buildPropertyColumn` 的属性只读 / 计算属性，
 * `buildEditableColumns` 的 id 与时间戳列，`actionsColumn` 的操作列），判定结果落成列定义上的
 * {@link COLUMN_READONLY_KEY} 标记；同一判定同时决定是否挂编辑器、开关是否禁用。
 *
 * 鼠标编辑由 VTable 按 editor / disable 自行拦住；键盘布尔切换、内部 / 系统剪贴板粘贴、Delete 清空
 * 不经编辑器、直接产出写入，统一经 {@link isColumnWritable} 读这个标记——不能只靠「没挂编辑器」挡这些入口。
 * 行级只读（`_readonly` 行、分组行、新增模板行）另由 `isReadonly` / `isReadonlyOrAddRow` 判定。
 */

/** 列定义上的列级只读标记键（与 `_propertyType` 同属列定义的 `_` 前缀元数据） */
export const COLUMN_READONLY_KEY = '_readonly';

/**
 * 判断一列是否接受键盘切换、粘贴、清空等批量入口的写入。
 *
 * 不接受写入的列：
 * - 字段名为空（行号列等无字段的列）；
 * - 字段名以 `_` 开头：表格元字段，含选择列 `__selected`（切的是界面选中态，不是实体数据）；
 * - 列定义带 {@link COLUMN_READONLY_KEY} 标记。
 *
 * @param field 目标单元格的字段名
 * @param colDef 目标列定义；调用方未提供列定义时只按字段名判定
 * @returns 可以写入时为 true
 */
export function isColumnWritable(field: string, colDef: object | undefined): boolean {
  if (!field || field.startsWith('_')) return false;
  return (colDef as Record<string, unknown> | undefined)?.[COLUMN_READONLY_KEY] !== true;
}
