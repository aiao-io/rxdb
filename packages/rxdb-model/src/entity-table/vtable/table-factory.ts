import type { ListTableConstructorOptions } from '@visactor/vtable';
import * as VTable from '@visactor/vtable';
import { InputEditor, TextAreaEditor } from '@visactor/vtable-editors';
import { ColorEditor } from '../editors/color-editor.js';
import { DateEditor } from '../editors/date-editor.js';
import { EnumEditor } from '../editors/enum-editor.js';
import { JsonEditor } from '../editors/json-editor.js';
import { KeyValueEditor } from '../editors/key-value-editor.js';
import { MultiSelectEditor } from '../editors/multiselect-editor.js';
import { NumberEditor } from '../editors/number-editor.js';
import { RelationEditor } from '../editors/relation-editor.js';
import { SafeListEditor } from '../editors/safe-list-editor.js';
import { TagsEditor } from '../editors/tags-editor.js';
import { TextFormatEditor } from '../editors/text-format-editor.js';
import { UuidEditor } from '../editors/uuid-editor.js';
import type { EntityTableRecord } from '../interfaces.js';
import { createTheme, getCSSVariables } from './table-theme.js';

/** 基础编辑器注册标记（全局仅注册一次） */
let baseEditorRegistered = false;

/** 注册 VTable 基础编辑器（全局单例，重复调用仅注册一次） */
export function ensureBaseEditorRegistered(): void {
  if (baseEditorRegistered) return;
  baseEditorRegistered = true;
  VTable.register.editor('input-editor', new InputEditor());
  VTable.register.editor('list-editor', new SafeListEditor({ values: [] }));
  VTable.register.editor('enum-editor', new EnumEditor());
  VTable.register.editor('date-editor', new DateEditor());
  VTable.register.editor('tags-editor', new TagsEditor('string'));
  VTable.register.editor('number-tags-editor', new TagsEditor('number'));
  VTable.register.editor('json-editor', new JsonEditor());
  VTable.register.editor('key-value-editor', new KeyValueEditor());
  VTable.register.editor('number-editor', new NumberEditor(false));
  VTable.register.editor('integer-editor', new NumberEditor(true));
  VTable.register.editor('bigint-editor', new NumberEditor(false, { bigint: true }));
  VTable.register.editor('uuid-editor', new UuidEditor());
  VTable.register.editor('relation-editor', new RelationEditor());
  VTable.register.editor('color-editor', new ColorEditor());
  VTable.register.editor('text-format-editor', new TextFormatEditor('url'));
  VTable.register.editor('multiselect-editor', new MultiSelectEditor([]));
  VTable.register.editor('vtable-textarea-editor', new TextAreaEditor());
}

/**
 * 注册自定义编辑器
 *
 * 业务层调用此函数注册领域相关编辑器（如属性类型选择器）。
 *
 * @param name 编辑器名称
 * @param editor 编辑器实例
 */
export function registerEditor(name: string, editor: unknown): void {
  VTable.register.editor(name, editor as never);
}

/**
 * 构建 ListTable 初始化选项
 *
 * @param records 表格行数据
 * @param columns 列定义
 * @param isDarkMode 是否暗色主题
 * @param options 额外选项（可选），覆盖默认配置
 * @returns ListTable 构造选项
 */
export function buildTableOptions(
  records: EntityTableRecord[],
  columns: ListTableConstructorOptions['columns'],
  isDarkMode: boolean,
  options?: Partial<ListTableConstructorOptions>
): ListTableConstructorOptions {
  return {
    records,
    columns,
    widthMode: 'autoWidth',
    autoFillWidth: true,
    rightFrozenColCount: 1,
    hierarchyIndent: 20,
    theme: createTheme(isDarkMode, getCSSVariables()),
    editCellTrigger: ['keydown', 'doubleclick'],
    tooltip: { renderMode: 'html' },
    menu: { contextMenuItems: ['copy', 'paste'] },
    rowSeriesNumber: {
      title: '',
      width: 40,
      dragOrder: true
    },
    ...options
  };
}

/**
 * 创建 VTable ListTable 实例
 *
 * @param container 挂载容器元素
 * @param records 表格行数据
 * @param columns 列定义
 * @param isDarkMode 是否暗色主题
 * @param options 额外选项（可选），覆盖默认配置
 * @returns 已注册基础编辑器的 ListTable 实例
 */
export function createListTable(
  container: HTMLElement,
  records: EntityTableRecord[],
  columns: ListTableConstructorOptions['columns'],
  isDarkMode: boolean,
  options?: Partial<ListTableConstructorOptions>
): VTable.ListTable {
  ensureBaseEditorRegistered();
  const option = buildTableOptions(records, columns, isDarkMode, options);
  return new VTable.ListTable(container, option);
}

/** 重置编辑器注册状态（仅供测试使用） */
export function _resetEditorRegistry(): void {
  baseEditorRegistered = false;
}
