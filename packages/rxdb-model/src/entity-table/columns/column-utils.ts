import type { ColumnDefine, StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types/index.js';
import type { RelatedEntityItem } from '../../entity-form/interfaces.js';
import { formatEntityFieldValue, parseEntityFieldValue } from '../../entity-value.utils.js';
import { EnumEditor, type EnumItem } from '../editors/enum-editor.js';
import { KeyValueEditor } from '../editors/key-value-editor.js';
import { RelationEditor } from '../editors/relation-editor.js';
import { getCSSVariableValue, getDocumentRootStyle } from '../vtable/table-theme.js';

/** 删除图标默认颜色 */
export const DELETE_COLOR = 'var(--entity-table-delete, #ef4444)';

const DELETE_FALLBACK_COLOR = '#ef4444';
const SAFE_COLOR = /^[#\w(),.\-\s/%]+$/;

// ── PropertyType 列构建器 ──────────────────────────────────────────────────────

/**
 * 实体属性类型字符串字面量
 * 与 `@aiao/rxdb` 的 `PropertyType` 枚举值一一对应，另扩展关系类型与计算属性
 */
export type PropertyTypeString =
  | 'uuid'
  | 'string'
  | 'enum'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'stringArray'
  | 'numberArray'
  | 'keyValue'
  | 'json'
  // ── 关系类型 ──────────────────────────────────────────────
  /** 一对一关系：存外键 ID，显示关联实体 displayName，可搜索下拉编辑 */
  | 'oneToOne'
  /** 多对一关系：存外键 ID，显示关联实体 displayName，可搜索下拉编辑 */
  | 'manyToOne'
  // ── 计算属性 ──────────────────────────────────────────────
  /** 计算属性：只读显示，无编辑器 */
  | 'computed';

/**
 * 构建属性列所需的配置
 */
export interface PropertyColumnConfig {
  /** 字段名（record 中的键） */
  field: string;
  /** 列标题（默认用 field） */
  title?: string;
  /** 属性类型 */
  type: PropertyTypeString | string;
  /** 属性级只读（整列不可编辑） */
  readonly?: boolean;
  /** 枚举值列表（type=enum 时使用，不含图标/i18n 时的简短形式） */
  enumValues?: readonly string[];
  /** 枚举项完整定义（type=enum 时使用，支持 text 国际化、icon 图标；优先级高于 enumValues） */
  enumItems?: readonly EnumItem[];
  /** 是否允许 null（type=enum 时使用） */
  nullable?: boolean;
  /** 列宽（默认 'auto'，uuid 类型默认 320） */
  width?: number | 'auto';
  /** 是否启用排序 */
  sort?: boolean;
  /** keyValue 属性 Schema—定义允许的键以及对应的值类型 */
  keyValueSchema?: Record<string, KVSchemaEntry>;
  /**
   * 关联实体候选列表（oneToOne / manyToOne 类型使用）
   *
   * 每项包含 `id`（外键值）和 `displayName`（单元格显示文本）。
   * 列更新时重新传入新列表即可刷新编辑器选项。
   */
  relatedItems?: RelatedEntityItem[];
  /**
   * 关联实体候选动态 provider（优先级高于 relatedItems）
   *
   * 每次单元格渲染或编辑器打开时调用，可返回最新的候选列表。
   * 适合业务层需要运行时动态查询关联实体的场景。
   */
  relatedItemsProvider?: () => RelatedEntityItem[];
}

/** keyValue 模式中单个键的属性描述 */
export interface KVSchemaEntry {
  /** 显示标签（默认用键名） */
  label?: string;
  /** 值类型（用于输入验证） */
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'date';
  /** 是否必填 */
  required?: boolean;
  /** 是否可以为 null */
  nullable?: boolean;
}

/**
 * 格式化日期值为本地字符串
 *
 * @param v 待格式化的日期值
 * @returns 本地化日期字符串
 */
export function formatDateValue(v: unknown): string {
  return formatEntityFieldValue('date', v);
}

/**
 * 构建编辑器函数：非只读行使用指定编辑器名称，只读行返回 undefined
 *
 * 用于 ColumnDefine.editor，以便在行级别区分只读/可编辑状态。
 *
 * @param editorName 非只读行使用的编辑器名称
 * @returns 可挂载到 ColumnDefine.editor 的编辑器回调
 */
export function makeEditorForReadonly(editorName: string): ColumnDefine['editor'] {
  return ((args: StylePropertyFunctionArg) => {
    const record = getCellRecord(args);
    return isReadonly(record) ? undefined : editorName;
  }) as ColumnDefine['editor'];
}

function formatArray(v: unknown): string {
  return formatEntityFieldValue('stringArray', v);
}

function formatJson(v: unknown): string {
  return formatEntityFieldValue('json', v);
}

function stringField(r: Record<string, unknown>, field: string): string {
  const v = r[field];
  return v == null ? '' : String(v);
}

/** 各属性类型的默认列宽及最小/最大宽度 */
export const DEFAULT_COLUMN_SIZES: Record<string, { width: number; minWidth?: number; maxWidth?: number }> = {
  boolean: { width: 80, minWidth: 60, maxWidth: 120 },
  enum: { width: 120, minWidth: 80 },
  date: { width: 180, minWidth: 140 },
  stringArray: { width: 160, minWidth: 100 },
  numberArray: { width: 160, minWidth: 100 },
  keyValue: { width: 200, minWidth: 120 },
  json: { width: 200, minWidth: 120 },
  uuid: { width: 320, minWidth: 200, maxWidth: 400 },
  number: { width: 100, minWidth: 70 },
  integer: { width: 80, minWidth: 60 },
  oneToOne: { width: 160, minWidth: 100 },
  manyToOne: { width: 160, minWidth: 100 },
  computed: { width: 0, minWidth: 80 },
  string: { width: 0, minWidth: 80 }
};

function applyDefaultSizes(
  col: ColumnDefine & Record<string, unknown>,
  type: string,
  configWidth?: number | 'auto'
): void {
  const sizes = DEFAULT_COLUMN_SIZES[type];
  if (!sizes) return;
  if (configWidth == null && sizes.width > 0) col['width'] = sizes.width;
  if (sizes.minWidth) col['minWidth'] = sizes.minWidth;
  if (sizes.maxWidth) col['maxWidth'] = sizes.maxWidth;
}

/**
 * 根据属性类型配置构建 VTable ColumnDefine
 *
 * 处理全部 11 种 PropertyType：
 * - uuid / string / number / integer → 文本显示 + input-editor（非只读时）
 * - enum → 文本显示 + list-editor 下拉框（非只读时）
 * - boolean → switch cellType
 * - date → 本地时间格式化 + date-editor 日期时间选择器（非只读时）
 * - stringArray → 逗号分隔显示 + tags-editor 标签输入（非只读时）
 * - numberArray → 逗号分隔显示 + number-tags-editor 数字标签输入（非只读时）
 * - keyValue → JSON 字符串显示 + key-value-editor 键值对编辑器（非只读时）
 * - json → JSON 字符串显示 + json-editor 文本区域（非只读时）
 *
 * @param config 属性列配置
 * @returns 构建好的 VTable ColumnDefine
 */
export function buildPropertyColumn(config: PropertyColumnConfig): ColumnDefine {
  const {
    field,
    title,
    type,
    readonly: propReadonly,
    enumValues,
    enumItems,
    nullable,
    keyValueSchema,
    sort = true
  } = config;

  const col: ColumnDefine & Record<string, unknown> = {
    field,
    title: title ?? field,
    width: config.width ?? 'auto',
    sort
  };

  col['_propertyType'] = type;

  switch (type) {
    case 'boolean': {
      const b = col as unknown as Record<string, unknown>;
      b['cellType'] = 'switch';
      applyDefaultSizes(col, type, config.width);
      if (propReadonly) {
        b['disable'] = true;
      } else {
        b['disable'] = switchDisabledForReadonly;
      }
      break;
    }

    case 'enum': {
      const resolvedItems: EnumItem[] =
        enumItems ? [...enumItems] : (enumValues ?? []).map(v => ({ value: v, text: v }));
      const textMap = enumItems ? new Map(enumItems.map(i => [i.value, i.text ?? i.value])) : null;
      col['fieldFormat'] = (r: Record<string, unknown>) => {
        const v = stringField(r, field);
        return textMap?.get(v) ?? v;
      };
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) {
        const allItems: EnumItem[] = nullable ? [{ value: '', text: '(空)' }, ...resolvedItems] : resolvedItems;
        const enumInst = new EnumEditor(allItems);
        col['editor'] = ((args: StylePropertyFunctionArg) =>
          isReadonly(getCellRecord(args)) ? undefined : enumInst) as ColumnDefine['editor'];
        if (nullable) col['nullable'] = true;
      }
      break;
    }

    case 'date':
      col['fieldFormat'] = (r: Record<string, unknown>) => formatDateValue(r[field]);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('date-editor');
      break;

    case 'stringArray':
      col['fieldFormat'] = (r: Record<string, unknown>) => formatArray(r[field]);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('tags-editor');
      break;

    case 'numberArray':
      col['fieldFormat'] = (r: Record<string, unknown>) => formatArray(r[field]);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('number-tags-editor');
      break;

    case 'keyValue':
      col['fieldFormat'] = (r: Record<string, unknown>) => formatJson(r[field]);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) {
        if (keyValueSchema) {
          const kvInst = new KeyValueEditor(keyValueSchema);
          col['editor'] = ((args: StylePropertyFunctionArg) =>
            isReadonly(getCellRecord(args)) ? undefined : kvInst) as ColumnDefine['editor'];
        } else {
          col['editor'] = makeEditorForReadonly('key-value-editor');
        }
      }
      break;

    case 'json':
      col['fieldFormat'] = (r: Record<string, unknown>) => formatJson(r[field]);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('json-editor');
      break;

    // uuid / string / number / integer / 未知类型
    case 'uuid':
      col['fieldFormat'] = (r: Record<string, unknown>) => stringField(r, field);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('uuid-editor');
      break;

    case 'number':
      col['fieldFormat'] = (r: Record<string, unknown>) => stringField(r, field);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('number-editor');
      break;

    case 'integer':
      col['fieldFormat'] = (r: Record<string, unknown>) => stringField(r, field);
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) col['editor'] = makeEditorForReadonly('integer-editor');
      break;

    // ── 关系类型 ─────────────────────────────────────────────────────────
    case 'oneToOne':
    case 'manyToOne': {
      // provider 优先，其次是静态 relatedItems；单元格渲染时实时调用以反映最新数据
      const provider = config.relatedItemsProvider;
      const staticItems = config.relatedItems ?? [];
      col['fieldFormat'] = (r: Record<string, unknown>) => {
        const v = r[field];
        if (v == null || v === '') return '';
        const id = String(v);
        const items = provider ? provider() : staticItems;
        return items.find(i => i.id === id)?.displayName ?? id;
      };
      applyDefaultSizes(col, type, config.width);
      if (!propReadonly) {
        // 将 provider 或静态 items 传入 RelationEditor，打开时动态格取
        const relEditor = new RelationEditor(provider ?? staticItems, nullable ?? false);
        col['editor'] = ((args: StylePropertyFunctionArg) =>
          isReadonly(getCellRecord(args)) ? undefined : relEditor) as ColumnDefine['editor'];
      }
      break;
    }

    // ── 计算属性 ─────────────────────────────────────────────────────────
    case 'computed':
      col['fieldFormat'] = (r: Record<string, unknown>) => stringField(r, field);
      applyDefaultSizes(col, type, config.width);
      // 无编辑器，始终只读
      break;

    // string / 未知类型
    default:
      col['fieldFormat'] = (r: Record<string, unknown>) => stringField(r, field);
      applyDefaultSizes(col, 'string', config.width);
      if (!propReadonly) col['editor'] = disabledEditorForReadonly;
      break;
  }

  return col as ColumnDefine;
}

/**
 * 将 input-editor 输入的字符串值解析回属性原始类型
 *
 * 在 cellChanged 事件处理器中调用此函数，将用户输入转成正确的 JS 类型后再保存。
 *
 * @param type 属性类型
 * @param raw 编辑器输入的原始值
 * @returns 解析后的属性值
 */
export function parsePropertyColumnValue(type: PropertyTypeString | string, raw: unknown): unknown {
  return parseEntityFieldValue(type, raw);
}

const resolveDeleteColor = (): string => {
  const style = getDocumentRootStyle();
  const errorColor = getCSSVariableValue('--color-error', DELETE_FALLBACK_COLOR, style);
  const color = getCSSVariableValue('--entity-table-delete', errorColor, style);
  return SAFE_COLOR.test(color) ? color : DELETE_FALLBACK_COLOR;
};

const createDeleteSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

const VIEW_COLOR = '#3b82f6';
const VIEW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${VIEW_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

/** VTable 回调参数中实际携带 table 实例 */
type CellCallbackArgs = StylePropertyFunctionArg & {
  table: { getRecordByCell: (col: number, row: number) => unknown };
};

type ColumnRecord = Record<string, unknown> & {
  _readonly?: boolean;
  _isAddRow?: boolean;
};

/**
 * 通过 VTable 回调参数安全获取当前行记录
 *
 * @param args VTable 回调参数
 * @returns 当前行记录；无法获取时返回 undefined
 */
export const getCellRecord = (args: StylePropertyFunctionArg): ColumnRecord | undefined => {
  const casted = args as CellCallbackArgs;
  return casted.table?.getRecordByCell(casted.col, casted.row) as ColumnRecord | undefined;
};

/**
 * switch 禁用状态判断回调
 *
 * @param args VTable 回调参数（用于获取当前行记录）
 * @returns true 表示禁用 switch
 */
export type SwitchDisableCallback = (args: StylePropertyFunctionArg) => boolean;

/**
 * 检查记录是否为只读行
 *
 * @param record 待检查的行记录
 * @returns 是否为只读行
 */
export const isReadonly = (record: unknown): boolean => {
  return (record as ColumnRecord | undefined)?._readonly === true;
};

/**
 * 检查记录是否为只读行或新增模板行
 *
 * @param record 待检查的行记录
 * @returns 是否为只读行或新增模板行
 */
export const isReadonlyOrAddRow = (record: unknown): boolean => {
  const r = record as ColumnRecord | undefined;
  return r?._readonly === true || r?._isAddRow === true;
};

/**
 * 生成查看按钮的图标选项（仅 SVG，避免 text 撑满剩余宽度）
 *
 * @returns 图标选项数组
 */
export function makeViewIcons(): unknown[] {
  return [
    {
      type: 'svg',
      svg: VIEW_SVG,
      name: 'view-action',
      positionType: 'contentLeft',
      width: 16,
      height: 16,
      marginRight: 10,
      cursor: 'pointer',
      hover: { width: 20, height: 20, bgColor: 'rgba(59,130,246,0.12)' }
    }
  ];
}

/**
 * 生成删除按钮的图标选项（SVG 图标 + 文字标签）
 *
 * @param label 删除按钮文字
 * @returns 图标选项数组
 */
export function makeDeleteIcons(label: string): unknown[] {
  const deleteColor = resolveDeleteColor();

  return [
    {
      type: 'svg',
      svg: createDeleteSvg(deleteColor),
      name: 'delete-action',
      positionType: 'contentLeft',
      width: 14,
      height: 14,
      marginRight: 4,
      cursor: 'pointer',
      hover: { width: 20, height: 20, bgColor: 'rgba(239,68,68,0.12)' }
    },
    {
      type: 'text',
      content: label,
      name: 'delete-action',
      positionType: 'contentLeft',
      cursor: 'pointer',
      style: { fill: deleteColor, fontSize: 12 },
      hover: { bgColor: 'rgba(239,68,68,0.12)' }
    }
  ];
}

/** 不可编辑的行：禁用 editor */
export const disabledEditorForReadonly = ((args: StylePropertyFunctionArg) => {
  const record = getCellRecord(args);
  return isReadonly(record) ? undefined : 'input-editor';
}) as ColumnDefine['editor'];

/** 禁用 switch：只读行不可操作 */
export const switchDisabledForReadonly: SwitchDisableCallback = (args: StylePropertyFunctionArg) => {
  const record = getCellRecord(args);
  return isReadonly(record);
};

/**
 * 操作列：可选包含查看（view）和删除按钮，只读行不显示操作
 *
 * @param title 列标题
 * @param deleteLabel 删除按钮文案
 * @param viewLabel 查看按钮文案（可选，不传则只显示删除按钮）
 * @returns 操作列定义
 */
export function actionsColumn(title: string, deleteLabel: string, viewLabel?: string): ColumnDefine {
  const width = viewLabel ? 130 : 100;
  return {
    field: 'actions',
    title,
    width,
    maxWidth: width,
    minWidth: width,
    disableSelect: true,
    disableHeaderSelect: true,
    icon: ((args: StylePropertyFunctionArg) => {
      const record = getCellRecord(args);
      if (isReadonly(record)) return [];
      return viewLabel ? [...makeViewIcons(), ...makeDeleteIcons(deleteLabel)] : makeDeleteIcons(deleteLabel);
    }) as ColumnDefine['icon']
  };
}
