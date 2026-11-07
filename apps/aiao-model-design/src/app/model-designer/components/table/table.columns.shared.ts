import {
  actionsColumn as baseActionsColumn,
  disabledEditorForReadonly,
  getCellRecord,
  isReadonly,
  isReadonlyOrAddRow,
  makeDeleteIcons,
  switchDisabledForReadonly,
  type MultiSelectOption,
  type SwitchDisableCallback
} from '@aiao/rxdb-model-angular';
import type { ColumnDefine, StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types';

const DELETE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

// Re-export generic utilities
export {
  disabledEditorForReadonly as disabledEditorForInherited,
  getCellRecord,
  isReadonly,
  isReadonlyOrAddRow,
  makeDeleteIcons,
  switchDisabledForReadonly as switchDisabledForInherited
};
export type { SwitchDisableCallback };

export type Translations = {
  tableView: {
    colName: string;
    colType: string;
    colColumnName: string;
    colDisplayName: string;
    colNullable: string;
    colRequired: string;
    colUnique: string;
    colReadonly: string;
    colSortable: string;
    colDefault: string;
    colEnumValues: string;
    colActions: string;
    colDeleteAction: string;
    colNotSupported: string;
    addChildProperty: string;
  };
  relationPanel: {
    displayName: string;
    kind: string;
    targetEntity: string;
    columnName: string;
    mappedProperty: string;
    onDelete: string;
    onUpdate: string;
  };
  indexPanel: {
    properties: string;
    displayName: string;
    unique: string;
  };
};

export type DropdownOptions = {
  propertyTypes: readonly string[];
  relationKinds: readonly string[];
  cascadeActions: readonly string[];
  entities: { id: string; name: string }[];
  targetRelationsByEntity: Map<string, { id: string; name: string }[]>;
  /** 当前实体可用的属性列表（id + name），用于索引属性多选 */
  availableProperties?: MultiSelectOption[];
};

/** 删除按钮 icon 列：只读行不显示 */
export function actionsColumn(t: Translations): ColumnDefine {
  return baseActionsColumn(t.tableView.colActions, t.tableView.colDeleteAction, record => !isReadonlyOrAddRow(record));
}

/** 生成 keyValue 添加子属性图标 + 删除图标 */
function makeAddChildIcons(addLabel: string, deleteLabel: string): unknown[] {
  return [
    {
      type: 'text',
      content: addLabel,
      name: 'add-child-action',
      positionType: 'left',
      marginRight: 8,
      cursor: 'pointer',
      style: { fill: '#3b82f6', fontSize: 12 },
      hover: { bgColor: 'rgba(59,130,246,0.12)' }
    },
    {
      type: 'svg',
      svg: DELETE_SVG,
      name: 'delete-action',
      positionType: 'left',
      width: 14,
      height: 14,
      marginRight: 4,
      cursor: 'pointer',
      hover: { width: 20, height: 20, bgColor: 'rgba(239,68,68,0.12)' }
    },
    {
      type: 'text',
      content: deleteLabel,
      name: 'delete-action',
      positionType: 'left',
      cursor: 'pointer',
      style: { fill: '#ef4444', fontSize: 12 },
      hover: { bgColor: 'rgba(239,68,68,0.12)' }
    }
  ];
}

/** 属性标签页专用操作列：keyValue 行显示 + 子属性 和 删除，普通行只显示 删除 */
export function propertyActionsColumn(t: Translations): ColumnDefine {
  return {
    field: 'actions',
    title: t.tableView.colActions,
    width: 140,
    maxWidth: 140,
    minWidth: 140,
    disableSelect: true,
    disableHeaderSelect: true,
    icon: ((args: StylePropertyFunctionArg) => {
      const record = getCellRecord(args) as Record<string, unknown> | undefined;
      if (isReadonlyOrAddRow(record)) return [];
      const isKeyValue = record?.['propertyType'] === 'keyValue' && !record?.['_parentPropId'];
      if (isKeyValue) {
        return makeAddChildIcons(t.tableView.addChildProperty, t.tableView.colDeleteAction);
      }
      return makeDeleteIcons(t.tableView.colDeleteAction);
    }) as ColumnDefine['icon']
  };
}
