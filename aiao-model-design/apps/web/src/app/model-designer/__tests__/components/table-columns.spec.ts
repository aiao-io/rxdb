import { IconListEditor, SafeListEditor } from '@aiao/rxdb-model-angular';
import type { ColumnsDefine } from '@visactor/vtable';
import type { ColumnDefine, StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types';
import { describe, expect, it } from 'vitest';
import {
  createPropertyColumns,
  type PropertyColumnsErrorContext
} from '../../components/table/table.columns.properties';
import {
  createRelationColumns,
  type RelationColumnsErrorContext
} from '../../components/table/table.columns.relations';
import { DEFAULT_TRANSLATIONS } from '../../i18n';

const translations = {
  ...DEFAULT_TRANSLATIONS,
  tableView: { ...DEFAULT_TRANSLATIONS.tableView, addChildProperty: '+ child' }
};

function args(record: Record<string, unknown>): StylePropertyFunctionArg {
  return {
    col: 0,
    row: 0,
    table: { getRecordByCell: () => record }
  } as unknown as StylePropertyFunctionArg;
}

function column(columns: ColumnsDefine, field: string): ColumnDefine {
  const result = columns.find(item => item.field === field);
  expect(result).toBeDefined();
  return result as ColumnDefine;
}

function invoke(value: unknown, input: unknown): unknown {
  return typeof value === 'function' ? (value as (arg: unknown) => unknown)(input) : value;
}

function columnValue(column: ColumnDefine, key: string): unknown {
  return (column as unknown as Record<string, unknown>)[key];
}

describe('property table columns', () => {
  const errorContext: PropertyColumnsErrorContext = {
    propertyErrors: new Map([['prop-1', { name: true, columnName: true }]]),
    addRowNameError: true,
    propertyNameHint: 'name hint',
    columnNameHint: 'column hint',
    errorBgColor: '#fee2e2'
  };

  it('formats types, renders icons, and chooses editors by row kind', () => {
    const columns = createPropertyColumns({ ...translations, propertyTypes: { string: 'Text' } }, errorContext, {
      propertyTypes: ['string', 'enum'],
      relationKinds: [],
      cascadeActions: [],
      entities: [],
      targetRelationsByEntity: new Map()
    });
    const typeColumn = column(columns, 'propertyType');
    const nameColumn = column(columns, 'name');
    const columnNameColumn = column(columns, 'columnName');
    const enumColumn = column(columns, 'enumValues');

    expect(invoke(typeColumn.fieldFormat, { propertyType: 'string' })).toBe('Text');
    expect(invoke(typeColumn.fieldFormat, { propertyType: undefined })).toBe('');
    expect(invoke(typeColumn.editor, args({ _readonly: true }))).toBeUndefined();
    expect(invoke(typeColumn.editor, args({ propertyType: 'string' }))).toBeInstanceOf(IconListEditor);
    expect(invoke(typeColumn.editor, args({ _parentPropId: 'parent' }))).toBeInstanceOf(IconListEditor);
    expect(
      invoke(typeColumn.customRender, {
        col: 0,
        row: 0,
        table: { getRecordByCell: () => ({ propertyType: 'string', _readonly: false }) }
      })
    ).toMatchObject({ renderDefault: false });
    expect(
      invoke(typeColumn.customRender, {
        col: 0,
        row: 0,
        table: { getRecordByCell: () => ({}) }
      })
    ).toMatchObject({ elements: [], renderDefault: true });

    expect(invoke(nameColumn.style, args({ _isAddRow: true }))).toEqual({ bgColor: '#fee2e2' });
    expect(invoke(columnNameColumn.style, args({ _propId: 'prop-1' }))).toEqual({ bgColor: '#fee2e2' });
    expect(invoke(nameColumn.editor, args({ _readonly: true }))).toBeUndefined();
    expect(invoke(nameColumn.editor, args({}))).toBe('input-editor');
    expect(invoke(columnNameColumn.editor, args({ _parentPropId: 'parent' }))).toBeUndefined();
    expect(invoke(columnNameColumn.editor, args({}))).toBe('input-editor');

    expect(invoke(enumColumn.editor, args({ propertyType: 'string' }))).toBeUndefined();
    expect(invoke(enumColumn.editor, args({ propertyType: 'enum' }))).toBe('input-editor');
    expect(invoke(enumColumn.style, args({ propertyType: 'string' }))).toEqual({ color: '#aaaaaa', fontSize: 11 });
    expect(invoke(enumColumn.fieldFormat, { propertyType: 'string' })).toBe(translations.tableView.colNotSupported);
    expect(invoke(enumColumn.fieldFormat, { propertyType: 'enum', enumValues: 'draft' })).toBe('draft');
  });

  it('renders child switch fields and property actions', () => {
    const columns = createPropertyColumns(translations);
    for (const field of ['isUnique', 'isReadonly', 'isSortable']) {
      const switchColumn = column(columns, field);
      expect(invoke(switchColumn.cellType, args({ _parentPropId: 'parent' }))).toBe('text');
      expect(invoke(switchColumn.fieldFormat, { _parentPropId: 'parent', [field]: true })).toBe(
        translations.tableView.colNotSupported
      );
      expect(invoke(switchColumn.style, args({ _parentPropId: 'parent' }))).toEqual({ color: '#aaaaaa', fontSize: 11 });
      expect(invoke(columnValue(switchColumn, 'disable'), args({ _readonly: true }))).toBe(true);
      expect(invoke(columnValue(switchColumn, 'disable'), args({}))).toBe(false);
    }

    const actions = column(columns, 'actions');
    expect(invoke(actions.icon, args({ _readonly: true }))).toEqual([]);
    expect(invoke(actions.icon, args({ _isAddRow: true }))).toEqual([]);
    expect(invoke(actions.icon, args({ propertyType: 'keyValue' }))).toHaveLength(3);
    expect(invoke(actions.icon, args({ propertyType: 'string' }))).toHaveLength(2);
  });
});

describe('relation table columns', () => {
  const errorContext: RelationColumnsErrorContext = {
    invalidRelationIds: new Set(['rel-1']),
    relationFieldErrors: new Map([['rel-1', new Set(['name'])]]),
    missingInverseRelationIds: new Set(),
    errorBgColor: '#fee2e2'
  };

  it('provides readonly editors, dropdown editors, and relation error styles', () => {
    const columns = createRelationColumns(
      translations,
      {
        propertyTypes: [],
        relationKinds: ['ONE_TO_ONE'],
        cascadeActions: ['NO_ACTION'],
        entities: [{ id: 'user', name: 'User' }],
        targetRelationsByEntity: new Map([['user', [{ id: 'posts', name: 'posts' }]]])
      },
      errorContext
    );
    const nameColumn = column(columns, 'name');
    const relationKindColumn = column(columns, 'relationKind');
    const entityColumn = column(columns, 'mappedEntityId');
    const propertyColumn = column(columns, 'mappedPropertyId');
    const deleteColumn = column(columns, 'onDeleteAction');

    expect(invoke(nameColumn.style, args({ _relId: 'rel-1' }))).toEqual({ bgColor: '#fee2e2' });
    expect(invoke(nameColumn.style, args({ _relId: 'unknown' }))).toEqual({});
    expect(invoke(nameColumn.editor, args({ _readonly: true }))).toBeUndefined();
    expect(invoke(nameColumn.editor, args({}))).toBe('input-editor');
    expect(invoke(relationKindColumn.editor, args({}))).toBeInstanceOf(SafeListEditor);
    expect(invoke(entityColumn.editor, args({}))).toBeInstanceOf(SafeListEditor);
    expect(invoke(propertyColumn.editor, args({ _mappedEntityId: 'user' }))).toBeInstanceOf(SafeListEditor);
    expect(invoke(deleteColumn.editor, args({}))).toBeInstanceOf(SafeListEditor);
    expect(invoke(propertyColumn.editor, args({ _mappedEntityId: 'missing' }))).toBeInstanceOf(SafeListEditor);
    expect(invoke(createRelationColumns(translations)[5].editor, args({ _mappedEntityId: 'missing' }))).toBe(
      'input-editor'
    );
  });

  it('uses missing-inverse errors for every relation field', () => {
    const columns = createRelationColumns(translations, undefined, {
      invalidRelationIds: new Set(),
      relationFieldErrors: new Map(),
      missingInverseRelationIds: new Set(['rel-2']),
      errorBgColor: '#fef3c7'
    });

    for (const item of columns) {
      if (item.field === 'actions' || !item.style) continue;
      expect(invoke(item.style, args({ _relId: 'rel-2' }))).toEqual({ bgColor: '#fef3c7' });
    }
  });
});
