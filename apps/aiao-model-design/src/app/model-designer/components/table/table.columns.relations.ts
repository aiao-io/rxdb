import { SafeListEditor } from '@aiao/rxdb-model-angular';
import type { ColumnsDefine } from '@visactor/vtable';
import { ColumnDefine, StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types';

import {
    actionsColumn,
    getCellRecord,
    isReadonly,
    type DropdownOptions,
    type Translations
} from './table.columns.shared';

export type RelationColumnsErrorContext = {
  invalidRelationIds: ReadonlySet<string>;
  relationFieldErrors: Map<string, Set<string>>;
  missingInverseRelationIds: ReadonlySet<string>;
  errorBgColor: string;
};

function getRelationErrorStyle(
  record: Record<string, unknown> | undefined,
  ctx: RelationColumnsErrorContext,
  fieldName: string
): Record<string, unknown> {
  const relId = record?.['_relId'];
  if (!relId) return {};

  const hasAnyError = ctx.invalidRelationIds.has(relId as string);
  const hasMissingInverse = ctx.missingInverseRelationIds.has(relId as string);
  if (!hasAnyError && !hasMissingInverse) return {};

  const fieldErrors = ctx.relationFieldErrors.get(relId as string);
  const hasFieldError = fieldErrors?.has(fieldName);

  if (!hasFieldError && !hasMissingInverse) return {};

  return { bgColor: ctx.errorBgColor };
}

function relationErrorStyleFn(ctx: RelationColumnsErrorContext, fieldName: string): ColumnDefine['style'] | undefined {
  return ((args: StylePropertyFunctionArg) => {
    const record = getCellRecord(args);
    return getRelationErrorStyle(record, ctx, fieldName);
  }) as ColumnDefine['style'];
}

function relationEditor(dropdownValues?: readonly string[]): ColumnDefine['editor'] {
  return ((args: StylePropertyFunctionArg) => {
    const record = getCellRecord(args);
    if (isReadonly(record)) return undefined;
    if (dropdownValues) {
      return new SafeListEditor({ values: [...dropdownValues] });
    }
    return 'input-editor';
  }) as ColumnDefine['editor'];
}

export function createRelationColumns(
  t: Translations,
  dropdownOptions?: DropdownOptions,
  errorContext?: RelationColumnsErrorContext
): ColumnsDefine {
  const inputOrDisabled = ((args: StylePropertyFunctionArg) => {
    const record = getCellRecord(args);
    return isReadonly(record) ? undefined : 'input-editor';
  }) as ColumnDefine['editor'];

  return [
    {
      field: 'name',
      title: t.tableView.colName,
      width: 120,
      minWidth: 80,
      maxWidth: 300,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'name') }),
      editor: inputOrDisabled
    },
    {
      field: 'displayName',
      title: t.relationPanel.displayName,
      width: 100,
      minWidth: 80,
      maxWidth: 500,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'displayName') }),
      editor: inputOrDisabled
    },
    {
      field: 'relationKind',
      title: t.relationPanel.kind,
      width: 100,
      minWidth: 120,
      maxWidth: 200,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'relationKind') }),
      editor: relationEditor(dropdownOptions?.relationKinds)
    },
    {
      field: 'mappedEntityId',
      title: t.relationPanel.targetEntity,
      width: 120,
      minWidth: 80,
      maxWidth: 300,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'mappedEntityId') }),
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (isReadonly(record)) return undefined;
        if (dropdownOptions?.entities) {
          const entityNames = ['', ...dropdownOptions.entities.map(e => e.name)];
          return new SafeListEditor({ values: entityNames });
        }
        return 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'columnName',
      title: t.relationPanel.columnName,
      width: 100,
      minWidth: 80,
      maxWidth: 300,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'columnName') }),
      editor: inputOrDisabled
    },
    {
      field: 'mappedPropertyId',
      title: t.relationPanel.mappedProperty,
      width: 120,
      minWidth: 80,
      maxWidth: 300,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'mappedPropertyId') }),
      editor: ((args: StylePropertyFunctionArg) => {
        const record = getCellRecord(args);
        if (isReadonly(record)) return undefined;
        const mappedEntityId = record?.['_mappedEntityId'] as string | undefined;
        if (mappedEntityId && dropdownOptions?.targetRelationsByEntity) {
          const targetRelations = dropdownOptions.targetRelationsByEntity.get(mappedEntityId) || [];
          const propNames = ['', ...targetRelations.map(tr => tr.name)];
          return new SafeListEditor({ values: propNames });
        }
        return 'input-editor';
      }) as ColumnDefine['editor']
    },
    {
      field: 'onDeleteAction',
      title: t.relationPanel.onDelete,
      width: 100,
      minWidth: 80,
      maxWidth: 200,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'onDeleteAction') }),
      editor: relationEditor(dropdownOptions?.cascadeActions)
    },
    {
      field: 'onUpdateAction',
      title: t.relationPanel.onUpdate,
      width: 100,
      minWidth: 80,
      maxWidth: 200,
      cellType: 'text',
      ...(errorContext && { style: relationErrorStyleFn(errorContext, 'onUpdateAction') }),
      editor: relationEditor(dropdownOptions?.cascadeActions)
    },
    actionsColumn(t)
  ];
}
