import { IconListEditor, lucideToSvgElement } from '@aiao/rxdb-model-angular';
import type { ColumnsDefine } from '@visactor/vtable';
import type { ColumnDefine, StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types';
import type { LucideIconData } from 'lucide-angular';
import { Binary, Braces, Calendar, Code, Hash, KeyRound, List, ListOrdered, ToggleLeft, Type } from 'lucide-angular';
import {
  getCellRecord,
  isReadonly,
  propertyActionsColumn,
  type DropdownOptions,
  type Translations
} from './table.columns.shared';

/** 属性类型对应的图标与颜色（与 property-item.component.ts 保持一致） */
const PROPERTY_TYPE_META: Record<string, { icon: LucideIconData; color: string }> = {
  uuid: { icon: KeyRound, color: '#8b5cf6' },
  string: { icon: Type, color: '#3b82f6' },
  number: { icon: Hash, color: '#10b981' },
  integer: { icon: Binary, color: '#059669' },
  boolean: { icon: ToggleLeft, color: '#f59e0b' },
  date: { icon: Calendar, color: '#ec4899' },
  stringArray: { icon: List, color: '#06b6d4' },
  numberArray: { icon: ListOrdered, color: '#14b8a6' },
  keyValue: { icon: Braces, color: '#6366f1' },
  json: { icon: Code, color: '#64748b' },
  enum: { icon: List, color: '#7c3aed' }
};

export type PropertyColumnsErrorContext = {
  propertyErrors: Map<string, { name?: boolean; columnName?: boolean }>;
  addRowNameError: boolean;
  propertyNameHint: string;
  columnNameHint: string;
  errorBgColor: string;
};

/** 获取类型本地化标签，支持传入 translations.propertyTypes 映射 */
function getTypeLabel(type: string, typeLabels?: Record<string, string>): string {
  return typeLabels?.[type] ?? type;
}

function isPropertyNameErrorCell(
  record: Record<string, unknown> | undefined,
  field: string,
  ctx: PropertyColumnsErrorContext
): boolean {
  if (field !== 'name') return false;
  if (record?.['_isAddRow'] && ctx.addRowNameError) return true;
  const propId = record?.['_propId'];
  return !!(propId && ctx.propertyErrors.get(propId as string)?.name);
}

function isPropertyColumnNameErrorCell(
  record: Record<string, unknown> | undefined,
  field: string,
  ctx: PropertyColumnsErrorContext
): boolean {
  if (field !== 'columnName') return false;
  const propId = record?.['_propId'];
  return !!(propId && ctx.propertyErrors.get(propId as string)?.columnName);
}

function errorStyle(
  args: StylePropertyFunctionArg,
  field: string,
  ctx: PropertyColumnsErrorContext,
  checker: (record: Record<string, unknown> | undefined, field: string, ctx: PropertyColumnsErrorContext) => boolean
): Record<string, unknown> {
  const record = getCellRecord(args);
  if (!checker(record, field, ctx)) return {};
  return { bgColor: ctx.errorBgColor };
}

/** keyValue 子属性可选类型（受限子集） */
const KEYVALUE_CHILD_TYPES = ['string', 'number', 'integer', 'date', 'boolean'];

const CHILD_UNSUPPORTED_STYLE = { color: '#aaaaaa', fontSize: 11 };

/**
 * 创建不支持子属性的 switch 列：子属性行折叠为文本展示不支持，其余行正常渲染 switch。
 */
function makeChildUnsupportedSwitchColumn(field: string, title: string, notSupportedLabel: string): ColumnDefine {
  return {
    field,
    title,
    width: 60,
    minWidth: 60,
    maxWidth: 100,
    cellType: (args: StylePropertyFunctionArg) => {
      const r = getCellRecord(args);
      return r?.['_parentPropId'] ? 'text' : 'switch';
    },
    fieldFormat: (record: Record<string, unknown>) => (record?.['_parentPropId'] ? notSupportedLabel : record?.[field]),
    style: ((args: StylePropertyFunctionArg) => {
      const r = getCellRecord(args);
      return r?.['_parentPropId'] ? CHILD_UNSUPPORTED_STYLE : {};
    }) as ColumnDefine['style'],
    disable: (args: StylePropertyFunctionArg) => {
      const r = getCellRecord(args);
      return !!r?.['_readonly'];
    }
  } as ColumnDefine;
}

export function createPropertyColumns(
  t: Translations & { tableView: { addChildProperty: string }; propertyTypes?: Record<string, string> },
  errorContext?: PropertyColumnsErrorContext,
  dropdownOptions?: DropdownOptions
): ColumnsDefine {
  return [
    {
      field: 'name',
      title: t.tableView.colName,
      width: 120,
      minWidth: 80,
      maxWidth: 300,
      cellType: 'text',
      tree: true,
      ...(errorContext && {
        style: ((args: StylePropertyFunctionArg) =>
          errorStyle(args, 'name', errorContext, isPropertyNameErrorCell)) as ColumnDefine['style']
      }),
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        return isReadonly(record) ? undefined : 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'propertyType',
      title: t.tableView.colType,
      width: 130,
      minWidth: 120,
      maxWidth: 200,
      cellType: 'text',
      fieldFormat: (record: Record<string, unknown>) => {
        const raw = record?.['propertyType'] as string | undefined;
        return raw ? getTypeLabel(raw, t.propertyTypes) : '';
      },
      customRender: ((args: {
        col: number;
        row: number;
        table: { getRecordByCell: (col: number, row: number) => unknown };
      }) => {
        const record = args.table.getRecordByCell(args.col, args.row) as Record<string, unknown> | undefined;
        const rawType = record?.['propertyType'] as string | undefined;
        if (!rawType) return { elements: [], expectedWidth: 0, expectedHeight: 0, renderDefault: true };

        const label = getTypeLabel(rawType, t.propertyTypes);
        const theme = document.documentElement.getAttribute('data-theme');
        const darkMode = theme === 'dark' || theme === 'dim' || theme === 'material-dark';
        const isReadonlyRow = !!record?.['_readonly'];
        const dotColor =
          isReadonlyRow ?
            darkMode ? '#64748b'
            : '#94a3b8'
          : (PROPERTY_TYPE_META[rawType]?.color ?? '#888888');
        const textColor =
          isReadonlyRow ?
            darkMode ? '#64748b'
            : '#94a3b8'
          : darkMode ? '#e2e8f0'
          : '#1e293b';
        const iconMeta = PROPERTY_TYPE_META[rawType];
        const svgStr = iconMeta ? lucideToSvgElement(iconMeta.icon, dotColor, 12).outerHTML : null;

        return {
          elements: [
            ...(svgStr ? [{ type: 'icon' as const, svg: svgStr, x: 8, y: '50%', dy: -6, width: 12, height: 12 }] : []),
            {
              type: 'text' as const,
              x: svgStr ? 26 : 8,
              y: '50%',
              text: label,
              textBaseline: 'middle' as const,
              fontSize: 12,
              fill: textColor
            }
          ],
          expectedWidth: 0,
          expectedHeight: 0,
          renderDefault: false
        };
      }) as unknown as ColumnDefine['customRender'],
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (isReadonly(record)) return undefined;
        // 子属性只允许标量类型
        const isChild = !!(record as Record<string, unknown> | undefined)?.['_parentPropId'];
        const rawTypes = isChild ? KEYVALUE_CHILD_TYPES : [...(dropdownOptions?.propertyTypes ?? [])];
        if (rawTypes.length > 0) {
          // 使用 IconListEditor 显示图标 + 本地化标签，存储原始属性类型字符串
          const values = rawTypes.map(v => ({
            text: getTypeLabel(v, t.propertyTypes),
            value: v,
            ...(PROPERTY_TYPE_META[v] ?? {})
          }));
          return new IconListEditor({ values });
        }
        return 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'columnName',
      title: t.tableView.colColumnName,
      width: 100,
      minWidth: 80,
      maxWidth: 300,
      cellType: 'text',
      ...(errorContext && {
        style: ((args: StylePropertyFunctionArg) =>
          errorStyle(args, 'columnName', errorContext, isPropertyColumnNameErrorCell)) as ColumnDefine['style']
      }),
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (isReadonly(record) || record?.['_parentPropId']) return undefined;
        return 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'displayName',
      title: t.tableView.colDisplayName,
      width: 100,
      minWidth: 80,
      maxWidth: 500,
      cellType: 'text',
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        return isReadonly(record) ? undefined : 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'isNullable',
      title: t.tableView.colNullable,
      width: 60,
      minWidth: 60,
      maxWidth: 100,
      cellType: 'switch',
      disable: (args: StylePropertyFunctionArg) => {
        const r = getCellRecord(args);
        return !!r?.['_readonly'];
      }
    },
    {
      field: 'isRequired',
      title: t.tableView.colRequired,
      width: 60,
      minWidth: 60,
      maxWidth: 100,
      cellType: 'switch',
      disable: (args: StylePropertyFunctionArg) => {
        const r = getCellRecord(args);
        return !!r?.['_readonly'];
      }
    },
    makeChildUnsupportedSwitchColumn('isUnique', t.tableView.colUnique, t.tableView.colNotSupported),
    makeChildUnsupportedSwitchColumn('isReadonly', t.tableView.colReadonly, t.tableView.colNotSupported),
    makeChildUnsupportedSwitchColumn('isSortable', t.tableView.colSortable, t.tableView.colNotSupported),
    {
      field: 'defaultValue',
      title: t.tableView.colDefault,
      width: 100,
      minWidth: 80,
      maxWidth: 400,
      cellType: 'text',
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        return isReadonly(record) ? undefined : 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'enumValues',
      title: t.tableView.colEnumValues,
      width: 140,
      minWidth: 100,
      maxWidth: 400,
      cellType: 'text',
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (isReadonly(record)) return undefined;
        if (record?.['propertyType'] !== 'enum') return undefined;
        return 'input-editor';
      }) as ColumnDefine['editor'],
      style: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (record?.['propertyType'] !== 'enum') return { color: '#aaaaaa', fontSize: 11 };
        return {};
      }) as ColumnDefine['style'],
      fieldFormat: (record: Record<string, unknown>) => {
        if (record?.['propertyType'] !== 'enum') return t.tableView.colNotSupported;
        return (record?.['enumValues'] as string) ?? '';
      }
    },
    propertyActionsColumn(t)
  ];
}
