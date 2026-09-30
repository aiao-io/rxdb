import { PropertyType, type EntityMetadata, type EntityPropertyMetadata } from '@aiao/rxdb';
import { createDefaultFormData, entityToFormData, formDataToEntityChanges } from '../../entity-form/form-data.js';
import { buildFormFields, filterVisibleFields, sortFormFields } from '../../entity-form/form-fields.js';
import { validateField, validateForm } from '../../entity-form/form-validation.js';
import type { FormFieldConfig } from '../../entity-form/interfaces.js';

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

const testMeta = makeMeta({
  propertyMap: new Map<string, EntityPropertyMetadata>([
    ['id', { name: 'id', columnName: 'id', type: PropertyType.uuid }],
    ['createdAt', { name: 'createdAt', columnName: 'created_at', type: PropertyType.date }],
    ['name', { name: 'name', columnName: 'name', type: PropertyType.string, displayName: '名称', required: true }],
    ['age', { name: 'age', columnName: 'age', type: PropertyType.integer, displayName: '年龄' }],
    ['active', { name: 'active', columnName: 'active', type: PropertyType.boolean, displayName: '启用' }]
  ]),
  computedPropertyMap: new Map<string, EntityPropertyMetadata>([
    ['fullName', { name: 'fullName', columnName: 'full_name', type: PropertyType.string, displayName: '全名' }]
  ])
});

describe('buildFormFields', () => {
  it('should build create mode fields (no computed, no system)', () => {
    const fields = buildFormFields(testMeta, 'create');
    const fieldNames = fields.map(f => f.field);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('age');
    expect(fieldNames).not.toContain('fullName');
    expect(fieldNames).not.toContain('id');
    expect(fieldNames).not.toContain('createdAt');
  });

  it('should build edit mode fields (includes system as readonly)', () => {
    const fields = buildFormFields(testMeta, 'edit');
    const fieldNames = fields.map(f => f.field);
    expect(fieldNames).toContain('name');
    expect(fieldNames).toContain('fullName');
    expect(fieldNames).toContain('id');
    const idField = fields.find(f => f.field === 'id');
    expect(idField?.readonly).toBe(true);
  });

  it('should build view mode fields (all readonly)', () => {
    const fields = buildFormFields(testMeta, 'view');
    expect(fields.every(f => f.readonly === true)).toBe(true);
  });
});

describe('sortFormFields', () => {
  it('should sort by order', () => {
    const fields: FormFieldConfig[] = [
      { field: 'b', displayName: 'B', type: 'string', order: 2 },
      { field: 'a', displayName: 'A', type: 'string', order: 1 },
      { field: 'c', displayName: 'C', type: 'string' }
    ];
    const sorted = sortFormFields(fields);
    expect(sorted.map(f => f.field)).toEqual(['c', 'a', 'b']);
  });
});

describe('filterVisibleFields', () => {
  it('should remove hidden fields', () => {
    const fields: FormFieldConfig[] = [
      { field: 'a', displayName: 'A', type: 'string' },
      { field: 'b', displayName: 'B', type: 'string', hidden: true }
    ];
    expect(filterVisibleFields(fields).map(f => f.field)).toEqual(['a']);
  });
});

describe('validateField', () => {
  it('should validate required field', () => {
    const field: FormFieldConfig = { field: 'name', displayName: 'Name', type: 'string', required: true };
    expect(validateField(field, null)).not.toBeNull();
    expect(validateField(field, 'value')).toBeNull();
  });
});

describe('validateForm', () => {
  it('should validate all editable fields', () => {
    const fields: FormFieldConfig[] = [
      { field: 'name', displayName: 'Name', type: 'string', required: true },
      { field: 'id', displayName: 'ID', type: 'uuid', readonly: true }
    ];
    const result = validateForm(fields, { name: '', id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('name');
  });

  it('should return valid for correct data', () => {
    const fields: FormFieldConfig[] = [{ field: 'name', displayName: 'Name', type: 'string', required: true }];
    const result = validateForm(fields, { name: 'test' });
    expect(result.valid).toBe(true);
  });
});

describe('entityToFormData', () => {
  it('should extract fields from entity', () => {
    const fields: FormFieldConfig[] = [
      { field: 'name', displayName: 'Name', type: 'string' },
      { field: 'age', displayName: 'Age', type: 'integer' }
    ];
    const data = entityToFormData({ name: 'Alice', age: 30, extra: true }, fields);
    expect(data).toEqual({ name: 'Alice', age: 30 });
  });

  it('should default missing fields to null', () => {
    const fields: FormFieldConfig[] = [{ field: 'name', displayName: 'Name', type: 'string' }];
    const data = entityToFormData({}, fields);
    expect(data).toEqual({ name: null });
  });
});

describe('formDataToEntityChanges', () => {
  it('should detect changed fields', () => {
    const fields: FormFieldConfig[] = [
      { field: 'name', displayName: 'Name', type: 'string' },
      { field: 'age', displayName: 'Age', type: 'integer' }
    ];
    const original = { name: 'Alice', age: 30 };
    const formData = { name: 'Bob', age: 30 };
    const changes = formDataToEntityChanges(original, formData, fields);
    expect(changes).toEqual({ name: 'Bob' });
  });

  it('should skip readonly fields', () => {
    const fields: FormFieldConfig[] = [
      { field: 'id', displayName: 'ID', type: 'uuid', readonly: true },
      { field: 'name', displayName: 'Name', type: 'string' }
    ];
    const changes = formDataToEntityChanges({ id: '123', name: 'A' }, { id: '999', name: 'B' }, fields);
    expect(changes).toEqual({ name: 'B' });
  });
});

describe('createDefaultFormData', () => {
  it('should create defaults based on type', () => {
    const fields: FormFieldConfig[] = [
      { field: 'name', displayName: 'Name', type: 'string' },
      { field: 'active', displayName: 'Active', type: 'boolean' },
      { field: 'tags', displayName: 'Tags', type: 'stringArray' },
      { field: 'id', displayName: 'ID', type: 'uuid', readonly: true }
    ];
    const data = createDefaultFormData(fields);
    expect(data).toEqual({ name: null, active: false, tags: [] });
  });
});
