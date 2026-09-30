// @vitest-environment happy-dom

import type { EntityMetadata } from '@aiao/rxdb';
import { PropertyType, RelationKind } from '@aiao/rxdb';
import type { StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types/index.js';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEditableColumns,
  normalizeKVSchemaEntryType
} from '../../../entity-table/columns/build-editable-columns.js';
import { EnumEditor } from '../../../entity-table/editors/enum-editor.js';
import { KeyValueEditor } from '../../../entity-table/editors/key-value-editor.js';
import { RelationEditor } from '../../../entity-table/editors/relation-editor.js';

function makeMeta(overrides: Partial<EntityMetadata> = {}): EntityMetadata {
  return {
    name: 'Test',
    namespace: 'public',
    displayName: 'Test',
    tableName: 'test',
    repository: 'Repository',
    extends: [],
    properties: [],
    computedProperties: [],
    relations: [],
    indexes: [],
    propertyMap: new Map(),
    computedPropertyMap: new Map(),
    relationMap: new Map(),
    foreignKeyRelationMap: new Map(),
    foreignKeyRelations: [],
    foreignKeyNames: [],
    foreignKeyColumnNames: [],
    columnNameToPropertyName: new Map(),
    indexMap: new Map(),
    defaultValueProperties: [],
    isForeignKey: () => false,
    ...overrides
  } as EntityMetadata;
}

function makeArgs(record: Record<string, unknown>): StylePropertyFunctionArg {
  return {
    col: 1,
    row: 1,
    table: { getRecordByCell: vi.fn().mockReturnValue(record) }
  } as unknown as StylePropertyFunctionArg;
}

describe('normalizeKVSchemaEntryType', () => {
  it('maps uuid and enum to string-compatible editors', () => {
    expect(normalizeKVSchemaEntryType(PropertyType.uuid)).toBe('string');
    expect(normalizeKVSchemaEntryType(PropertyType.enum)).toBe('string');
  });

  it('preserves primitive scalar editor types', () => {
    expect(normalizeKVSchemaEntryType(PropertyType.string)).toBe('string');
    expect(normalizeKVSchemaEntryType(PropertyType.number)).toBe('number');
    expect(normalizeKVSchemaEntryType(PropertyType.integer)).toBe('integer');
    expect(normalizeKVSchemaEntryType(PropertyType.boolean)).toBe('boolean');
    expect(normalizeKVSchemaEntryType(PropertyType.date)).toBe('date');
  });

  it('drops unsupported nested schema types instead of casting unsafely', () => {
    expect(normalizeKVSchemaEntryType(PropertyType.json)).toBeUndefined();
    expect(normalizeKVSchemaEntryType(PropertyType.keyValue)).toBeUndefined();
    expect(normalizeKVSchemaEntryType(PropertyType.stringArray)).toBeUndefined();
    expect(normalizeKVSchemaEntryType(PropertyType.numberArray)).toBeUndefined();
  });
});

describe('buildEditableColumns', () => {
  it('starts with the ID column', () => {
    const columns = buildEditableColumns(makeMeta());
    expect(columns[0]).toMatchObject({ field: 'id', title: 'ID', width: 260, sort: true });
  });

  it('builds property columns in propertyMap order with display names', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        ['name', { name: 'name', columnName: 'name', type: PropertyType.string, displayName: '名称' }],
        ['age', { name: 'age', columnName: 'age', type: PropertyType.integer, displayName: '年龄' }]
      ])
    });
    const columns = buildEditableColumns(meta);
    const fields = columns.map(c => c.field);
    expect(fields[1]).toBe('name');
    expect(fields[2]).toBe('age');
    expect(columns[1].title).toBe('名称');
    expect(columns[2].title).toBe('年龄');
  });

  it('skips id / createdAt / updatedAt / createdBy / updatedBy system fields', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        ['id', { name: 'id', columnName: 'id', type: PropertyType.uuid }],
        ['createdAt', { name: 'createdAt', columnName: 'createdAt', type: PropertyType.date }],
        ['updatedAt', { name: 'updatedAt', columnName: 'updatedAt', type: PropertyType.date }],
        ['createdBy', { name: 'createdBy', columnName: 'createdBy', type: PropertyType.uuid }],
        ['updatedBy', { name: 'updatedBy', columnName: 'updatedBy', type: PropertyType.uuid }],
        ['visible', { name: 'visible', columnName: 'visible', type: PropertyType.string }]
      ])
    });
    const columns = buildEditableColumns(meta);
    expect(columns.map(c => c.field)).toEqual(['id', 'visible', 'createdAt', 'updatedAt', 'actions']);
  });

  it('marks property-level readonly columns as non-editable', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        ['locked', { name: 'locked', columnName: 'locked', type: PropertyType.string, readonly: true }]
      ])
    });
    const columns = buildEditableColumns(meta);
    const col = columns[1] as Record<string, unknown>;
    expect(col['editor']).toBeUndefined();
  });

  it('passes enum values into the enum editor column', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        ['status', { name: 'status', columnName: 'status', type: PropertyType.enum, enum: ['a', 'b'] }]
      ])
    });
    const columns = buildEditableColumns(meta);
    const col = columns[1] as Record<string, unknown>;
    const editorFn = col['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const inst = editorFn(makeArgs({})) as { editorType?: string; getValue?: () => string };
    expect(inst).toBeInstanceOf(EnumEditor);
    expect(inst.editorType).toBe('enum-editor');
  });

  it('uses enum options labels as cell display text', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'status',
          {
            name: 'status',
            columnName: 'status',
            type: PropertyType.enum,
            enum: ['draft', 'archived'],
            options: { draft: { label: '草稿' }, archived: { label: '归档', disabled: true } }
          }
        ]
      ])
    });
    const columns = buildEditableColumns(meta);
    const col = columns[1] as Record<string, unknown>;
    const fn = col['fieldFormat'] as (r: Record<string, unknown>) => string;
    expect(fn({ status: 'draft' })).toBe('草稿');
    expect(fn({ status: 'archived' })).toBe('归档');
    expect(fn({ status: 'unknown' })).toBe('unknown');
  });

  it('uses a MultiSelectEditor for stringArray with enum', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        ['labels', { name: 'labels', columnName: 'labels', type: PropertyType.stringArray, enum: ['a', 'b'] }]
      ])
    });
    const columns = buildEditableColumns(meta);
    const col = columns[1] as Record<string, unknown>;
    const editorFn = col['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const inst = editorFn(makeArgs({})) as { editorType?: string };
    expect(inst?.editorType).toBe('multiselect-editor');
  });

  it('passes format through for color columns', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'accent',
          {
            name: 'accent',
            columnName: 'accent',
            type: PropertyType.string,
            format: { kind: 'color', colorSpace: 'hex' }
          }
        ]
      ])
    });
    const columns = buildEditableColumns(meta);
    const col = columns[1] as Record<string, unknown>;
    const editorFn = col['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const inst = editorFn(makeArgs({})) as { editorType?: string };
    expect(inst?.editorType).toBe('color-editor');
  });

  it('builds a KeyValueEditor with the schema derived from keyValue properties', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'profile',
          {
            name: 'profile',
            columnName: 'profile',
            type: PropertyType.keyValue,
            properties: [
              { name: 'age', type: PropertyType.integer, displayName: '年龄', required: true, nullable: false },
              { name: 'nick', type: PropertyType.string, displayName: '昵称' }
            ]
          }
        ]
      ])
    });
    const columns = buildEditableColumns(meta);
    const col = columns[1] as Record<string, unknown>;
    const editorFn = col['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const inst = editorFn(makeArgs({})) as { editorType?: string };
    expect(inst).toBeInstanceOf(KeyValueEditor);
    expect(inst.editorType).toBe('key-value-editor');
  });

  it('appends computed property columns after regular properties', () => {
    const meta = makeMeta({
      propertyMap: new Map([['name', { name: 'name', columnName: 'name', type: PropertyType.string }]]),
      computedPropertyMap: new Map([
        ['fullName', { name: 'fullName', columnName: 'fullName', type: PropertyType.string, displayName: '全名' }]
      ])
    });
    const columns = buildEditableColumns(meta);
    const computedCol = columns[2] as Record<string, unknown>;
    expect(computedCol['field']).toBe('fullName');
    expect(computedCol['title']).toBe('全名');
    expect(computedCol['_propertyType']).toBe('computed');
    expect(computedCol['editor']).toBeUndefined();
  });

  it('maps oneToOne and manyToOne relations into searchable columns', () => {
    const meta = makeMeta({
      foreignKeyRelationMap: new Map([
        [
          'profile',
          {
            name: 'profile',
            kind: RelationKind.ONE_TO_ONE,
            mappedEntity: 'Profile',
            mappedNamespace: 'public',
            mappedProperty: 'todo',
            columnName: 'profile_id',
            displayName: '档案',
            nullable: true
          }
        ],
        [
          'owner',
          {
            name: 'owner',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedNamespace: 'public',
            columnName: 'owner_id',
            mappedProperty: 'todo',
            displayName: '拥有者',
            nullable: false
          }
        ]
      ])
    });
    const columns = buildEditableColumns(meta);
    const relationCols = columns.slice(1, 3) as Record<string, unknown>[];

    expect(relationCols[0]['field']).toBe('profile');
    expect(relationCols[0]['title']).toBe('档案');
    expect(relationCols[0]['_propertyType']).toBe('oneToOne');
    expect(relationCols[1]['_propertyType']).toBe('manyToOne');

    const editorFn = relationCols[1]['editor'] as (a: StylePropertyFunctionArg) => unknown;
    expect(editorFn(makeArgs({}))).toBeInstanceOf(RelationEditor);
    expect(editorFn(makeArgs({ _readonly: true }))).toBeUndefined();
  });

  it('passes the relation nullable flag into the editor', () => {
    const meta = makeMeta({
      foreignKeyRelationMap: new Map([
        [
          'profile',
          {
            name: 'profile',
            kind: RelationKind.ONE_TO_ONE,
            mappedEntity: 'Profile',
            mappedNamespace: 'public',
            mappedProperty: 'todo',
            columnName: 'profile_id',
            displayName: '档案',
            nullable: true
          }
        ]
      ])
    });
    const columns = buildEditableColumns(meta);
    const editorFn = (columns[1] as Record<string, unknown>)['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const relEditor = editorFn(makeArgs({})) as RelationEditor;

    const container = document.createElement('div');
    container.tabIndex = 0;
    document.body.appendChild(container);
    relEditor.onStart({
      col: 1,
      row: 1,
      value: 'p1',
      container,
      table: null,
      endEdit: vi.fn(),
      referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } }
    } as never);

    expect(document.body.textContent).toContain('(空)');

    relEditor.onEnd();
  });

  it('invokes the relatedItemsProviderFactory for each relation', () => {
    const providerFactory = vi.fn().mockReturnValue(undefined);
    const meta = makeMeta({
      foreignKeyRelationMap: new Map([
        [
          'owner',
          {
            name: 'owner',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedNamespace: 'public',
            columnName: 'owner_id',
            mappedProperty: 'todo',
            displayName: '拥有者',
            nullable: false
          }
        ]
      ])
    });
    buildEditableColumns(meta, { relatedItemsProviderFactory: providerFactory });

    expect(providerFactory).toHaveBeenCalledWith('owner', 'User');
  });

  it('passes the provider into the relation column fieldFormat', () => {
    const provider = vi.fn().mockReturnValue([
      { id: 'u1', displayName: 'Alice' },
      { id: 'u2', displayName: 'Bob' }
    ]);
    const providerFactory = vi.fn().mockReturnValue(provider);
    const meta = makeMeta({
      foreignKeyRelationMap: new Map([
        [
          'owner',
          {
            name: 'owner',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedNamespace: 'public',
            columnName: 'owner_id',
            mappedProperty: 'todo',
            displayName: '拥有者',
            nullable: false
          }
        ]
      ])
    });
    const columns = buildEditableColumns(meta, { relatedItemsProviderFactory: providerFactory });
    const fmt = (columns[1] as Record<string, unknown>)['fieldFormat'] as (r: Record<string, unknown>) => string;

    expect(fmt({ owner: 'u1' })).toBe('Alice');
    expect(provider).toHaveBeenCalled();
    provider.mockReturnValue([]);
    expect(fmt({ owner: 'missing' })).toBe('missing');
    expect(fmt({ owner: null })).toBe('');
  });

  it('appends createdAt / updatedAt columns with date formatting', () => {
    const columns = buildEditableColumns(makeMeta());
    const createdAt = columns[1] as Record<string, unknown>;
    const updatedAt = columns[2] as Record<string, unknown>;

    expect(createdAt['field']).toBe('createdAt');
    expect(createdAt['title']).toBe('创建时间');
    expect(updatedAt['title']).toBe('更新时间');

    const fmt = createdAt['fieldFormat'] as (r: Record<string, unknown>) => string;
    const d = new Date('2024-01-15T10:30:00');
    expect(fmt({ createdAt: d })).toBe(d.toLocaleString());
    expect(fmt({ createdAt: null })).toBe('');
  });

  it('appends the actions column last', () => {
    const columns = buildEditableColumns(makeMeta());
    expect(columns.at(-1)?.field).toBe('actions');
    expect(columns.at(-1)?.title).toBe('操作');
  });

  it('honors custom titles and labels', () => {
    const meta = makeMeta({
      propertyMap: new Map([['name', { name: 'name', columnName: 'name', type: PropertyType.string }]])
    });
    const columns = buildEditableColumns(meta, {
      actionsTitle: 'Actions',
      deleteLabel: 'Delete',
      viewLabel: 'View',
      createdAtTitle: 'Created',
      updatedAtTitle: 'Updated'
    });

    const fields = columns.map(c => c.field);
    const createdAtIdx = fields.indexOf('createdAt');
    expect(columns[createdAtIdx]?.title).toBe('Created');
    expect(columns[createdAtIdx + 1]?.title).toBe('Updated');

    const actions = columns.at(-1) as Record<string, unknown>;
    expect(actions['title']).toBe('Actions');
    expect(actions['width']).toBe(130); // 带查看按钮 → 更宽

    const iconFn = actions['icon'] as (a: StylePropertyFunctionArg) => unknown[];
    const icons = iconFn(makeArgs({ id: '1' }));
    expect(icons.length).toBeGreaterThanOrEqual(3); // 查看 + 删除
  });

  it('uses a narrower actions column when the view label is disabled', () => {
    const columns = buildEditableColumns(makeMeta(), { viewLabel: '' });
    const actions = columns.at(-1) as Record<string, unknown>;
    expect(actions['width']).toBe(100);

    const iconFn = actions['icon'] as (a: StylePropertyFunctionArg) => unknown[];
    expect(iconFn(makeArgs({ id: '1' }))).toHaveLength(2); // 仅删除
  });
});
