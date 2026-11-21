import { MultiSelectEditor } from '@aiao/rxdb-model-angular';
import type { ColumnsDefine } from '@visactor/vtable';
import type { ColumnDefine, StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types';

import {
  actionsColumn,
  getCellRecord,
  isReadonlyOrAddRow,
  type DropdownOptions,
  type SwitchDisableCallback,
  type Translations
} from './table.columns.shared';

export function createIndexColumns(
  t: Translations,
  dropdownOptions?: DropdownOptions,
  onPropertyIdsCommit?: (ids: string[]) => void
): ColumnsDefine {
  return [
    {
      field: 'propertyNames',
      title: t.indexPanel.properties,
      width: 400,
      minWidth: 200,
      maxWidth: 4000,
      cellType: 'text',
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (isReadonlyOrAddRow(record)) return undefined;
        const props = dropdownOptions?.availableProperties;
        if (props && props.length > 0) {
          const selectedIds = (record?.['_propertyIds'] as string[]) ?? [];
          return new MultiSelectEditor([...props], selectedIds, onPropertyIdsCommit);
        }
        return 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'displayName',
      title: t.indexPanel.displayName,
      width: 100,
      minWidth: 80,
      maxWidth: 500,
      cellType: 'text',
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        return isReadonlyOrAddRow(record) ? undefined : 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'isUnique',
      title: t.indexPanel.unique,
      width: 80,
      minWidth: 80,
      maxWidth: 80,
      cellType: 'checkbox',
      disable: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        return isReadonlyOrAddRow(record);
      }) as SwitchDisableCallback
    },
    actionsColumn(t)
  ];
}
