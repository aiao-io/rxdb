import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CellChangeEvent, EntityTableRecord, BatchChangeItem } from '@aiao/rxdb-model-angular';
import { describe, expect, it, vi } from 'vitest';
import { generateKeysBetween } from '@aiao/utils';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import { TableViewComponent } from '../../components/table/table-view.component';

type SetupOptions = {
  entities?: DesignEntity[];
  properties?: DesignProperty[];
  children?: Map<string, DesignProperty[]>;
  relations?: DesignRelation[];
  targetRelations?: DesignRelation[];
  indexes?: DesignIndex[];
  activeEntityId?: string | null;
  detailTab?: 'properties' | 'relations' | 'indexes';
};

function id(value: string): DesignProperty['id'] {
  return value as DesignProperty['id'];
}

function entity(value: string, name: string): DesignEntity {
  return { id: id(value), name, extendsBase: 'EntityBase', entityNamespace: null } as DesignEntity;
}

function property(value: string, name: string, overrides: Partial<DesignProperty> = {}): DesignProperty {
  return {
    id: id(value),
    name,
    propertyType: 'string',
    columnName: null,
    displayName: null,
    isNullable: false,
    isRequired: false,
    isUnique: false,
    isReadonly: false,
    isSortable: false,
    defaultValue: null,
    enumValues: null,
    sortOrder: 'z',
    ...overrides
  } as DesignProperty;
}

function relation(value: string, name: string, designEntityId: string, overrides: Partial<DesignRelation> = {}): DesignRelation {
  return {
    id: id(value),
    name,
    relationKind: 'ONE_TO_MANY',
    mappedEntityId: null,
    mappedPropertyId: null,
    mappedNamespace: null,
    columnName: null,
    displayName: null,
    onDeleteAction: 'NO_ACTION',
    onUpdateAction: 'NO_ACTION',
    sortOrder: 'z',
    designEntityId: id(designEntityId),
    ...overrides
  } as DesignRelation;
}

function index(value: string, designEntityId: string, overrides: Partial<DesignIndex> = {}): DesignIndex {
  return {
    id: id(value),
    propertyIds: [],
    isUnique: false,
    displayName: null,
    sortOrder: 'z',
    designEntityId: id(designEntityId),
    ...overrides
  } as DesignIndex;
}

function setup(options: SetupOptions = {}) {
  const order = entity('e1', 'Order');
  const entities = options.entities ?? [order, entity('e2', 'Customer')];
  const activeEntityId = options.activeEntityId === undefined ? order.id : options.activeEntityId;
  TestBed.configureTestingModule({
    imports: [TableViewComponent],
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  }).overrideComponent(TableViewComponent, { set: { template: '' } });

  const fixture = TestBed.createComponent(TableViewComponent);
  fixture.componentRef.setInput('entities', entities);
  fixture.componentRef.setInput('propertiesMap', new Map([[order.id, options.properties ?? []]]));
  fixture.componentRef.setInput('childPropertiesMap', options.children ?? new Map());
  fixture.componentRef.setInput(
    'relationsMap',
    new Map([
      [order.id, options.relations ?? []],
      [entities[1]?.id ?? id('e2'), options.targetRelations ?? []]
    ])
  );
  fixture.componentRef.setInput('indexesMap', new Map([[order.id, options.indexes ?? []]]));
  fixture.componentRef.setInput('activeEntityId', activeEntityId);
  fixture.componentRef.setInput('detailTab', options.detailTab ?? 'properties');
  fixture.detectChanges();
  return fixture;
}

function record(value: Record<string, unknown>): EntityTableRecord {
  return value;
}

function cell(value: Partial<CellChangeEvent>): CellChangeEvent {
  return {
    col: 0,
    row: 0,
    field: '',
    value: undefined,
    record: record({}),
    ...value
  };
}

describe('TableViewComponent', () => {
  it('builds active records and switches table configuration by tab', () => {
    const parent = property('p1', 'metadata', { propertyType: 'keyValue' });
    const child = property('c1', 'source');
    const customer = entity('e2', 'Customer');
    const orderRelation = relation('r1', 'customer', 'e1', {
      mappedEntityId: customer.id,
      mappedPropertyId: id('r2')
    });
    const customerRelation = relation('r2', 'orders', customer.id);
    const fixture = setup({
      properties: [parent],
      children: new Map([[parent.id, [child]]]),
      relations: [orderRelation],
      targetRelations: [customerRelation],
      indexes: [index('i1', 'e1', { propertyIds: [parent.id] })]
    });
    const view = fixture.componentInstance;

    expect(view.activeEntity()?.name).toBe('Order');
    expect(view.tableRecords().find(item => item['_propId'] === parent.id)?.children?.[0]['_propId']).toBe(child.id);
    expect(view.activePropertiesForIndex().some(item => item.id === parent.id)).toBe(true);
    expect(view.tableIdField()).toBe('_propId');
    expect(view.tableNonClearableFields()).toEqual(new Set(['name', 'propertyType']));
    expect(view.tableColumns().length).toBeGreaterThan(0);
    expect(view.cellClearableFn({ _parentPropId: parent.id })).toBe(false);
    expect(view.cellClearableFn({ _propId: parent.id })).toBe(true);

    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    expect(view.tableRecords().find(item => item['_relId'] === orderRelation.id)?.['mappedEntityId']).toBe('Customer');
    expect(view.tableIdField()).toBe('_relId');
    expect(view.tableNonClearableFields()).toEqual(new Set(['name', 'relationKind']));
    expect(view.tableColumns().length).toBeGreaterThan(0);

    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    expect(view.tableRecords().find(item => item['_idxId'] === 'i1')?.['propertyNames']).toBe('metadata');
    expect(view.tableIdField()).toBe('_idxId');
    expect(view.tableNonClearableFields()).toEqual(new Set());
    expect(view.tableColumns().length).toBeGreaterThan(0);
  });

  it('emits direct cell updates for properties, relations, and indexes', () => {
    const prop = property('p1', 'status', { propertyType: 'enum' });
    const customer = entity('e2', 'Customer');
    const orderRelation = relation('r1', 'customer', 'e1', { mappedEntityId: customer.id });
    const customerRelation = relation('r2', 'orders', customer.id);
    const fixture = setup({
      properties: [prop],
      relations: [orderRelation],
      targetRelations: [customerRelation],
      indexes: [index('i1', 'e1')]
    });
    const view = fixture.componentInstance;
    const propertyUpdated: unknown[] = [];
    const relationUpdated: unknown[] = [];
    const indexUpdated: unknown[] = [];
    view.propertyUpdated.subscribe(value => propertyUpdated.push(value));
    view.relationUpdated.subscribe(value => relationUpdated.push(value));
    view.indexUpdated.subscribe(value => indexUpdated.push(value));

    view.onCellChanged(cell({ record: record({ _propId: prop.id }), field: 'enumValues', value: 'draft, published' }));
    expect(propertyUpdated).toEqual([{ id: prop.id, changes: { enumValues: ['draft', 'published'] } }]);

    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    view.onCellChanged(
      cell({
        record: record({ _relId: orderRelation.id, _mappedEntityId: customer.id }),
        field: 'mappedPropertyId',
        value: 'orders'
      })
    );
    expect(relationUpdated).toEqual([{ id: orderRelation.id, changes: { mappedPropertyId: customerRelation.id } }]);

    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    view.onCellChanged(cell({ record: record({ _idxId: 'i1' }), field: 'isUnique', value: true }));
    expect(indexUpdated).toEqual([{ id: 'i1', changes: { isUnique: true } }]);
  });

  it('emits row deletion and child-property creation events only for editable records', () => {
    const prop = property('p1', 'metadata', { propertyType: 'keyValue' });
    const fixture = setup({ properties: [prop], children: new Map([[prop.id, [property('c1', 'newField')]]]) });
    const view = fixture.componentInstance;
    const propertyDeleted = vi.fn();
    const relationDeleted = vi.fn();
    const indexDeleted = vi.fn();
    const childAdded = vi.fn();
    view.propertyDeleted.subscribe(propertyDeleted);
    view.relationDeleted.subscribe(relationDeleted);
    view.indexDeleted.subscribe(indexDeleted);
    view.childPropertyAdded.subscribe(childAdded);

    view.onRowDeleted(record({ _propId: prop.id, _readonly: false }));
    view.onRowDeleted(record({ _propId: id('readonly'), _readonly: true }));
    expect(propertyDeleted).toHaveBeenCalledWith(prop.id);
    expect(propertyDeleted).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    view.onRowDeleted(record({ _relId: id('r1'), _readonly: false }));
    expect(relationDeleted).toHaveBeenCalledWith(id('r1'));

    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    view.onRowDeleted(record({ _idxId: id('i1') }));
    expect(indexDeleted).toHaveBeenCalledWith(id('i1'));

    fixture.componentRef.setInput('detailTab', 'properties');
    fixture.detectChanges();
    view.onIconClicked({ name: 'add-child-action', record: record({ _propId: prop.id, _readonly: false }) });
    expect(childAdded).toHaveBeenCalledWith({
      entityId: id('e1'),
      parentPropertyId: prop.id,
      name: 'newField2',
      type: 'string'
    });
  });

  it('dispatches paste mutations with normalized values for each tab', () => {
    const prop = property('p1', 'status', { propertyType: 'enum', columnName: 'status' });
    const customer = entity('e2', 'Customer');
    const orderRelation = relation('r1', 'customer', 'e1', { mappedEntityId: customer.id });
    const customerRelation = relation('r2', 'orders', customer.id);
    const fixture = setup({
      properties: [prop],
      relations: [orderRelation],
      targetRelations: [customerRelation],
      indexes: [index('i1', 'e1')]
    });
    const view = fixture.componentInstance;
    const propertiesBatchUpdated: unknown[] = [];
    const relationsBatchUpdated: unknown[] = [];
    const indexesBatchUpdated: unknown[] = [];
    view.propertiesBatchUpdated.subscribe(value => propertiesBatchUpdated.push(value));
    view.relationsBatchUpdated.subscribe(value => relationsBatchUpdated.push(value));
    view.indexesBatchUpdated.subscribe(value => indexesBatchUpdated.push(value));

    const propertyMutations: BatchChangeItem[] = [
      { recordId: prop.id, changes: { name: 'status', columnName: '', enumValues: 'draft, draft, published', isUnique: true, _propId: 'ignored' } }
    ];
    view.onBatchUpdated(propertyMutations);
    expect(propertiesBatchUpdated).toEqual([
      [{ id: prop.id, changes: { columnName: null, enumValues: ['draft', 'published'], isUnique: true } }]
    ]);

    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    view.onBatchUpdated([
      {
        recordId: orderRelation.id,
        changes: { mappedEntityId: 'Order', mappedPropertyId: 'orders', displayName: 'Customer' }
      }
    ]);
    expect(relationsBatchUpdated).toEqual([
      [
        {
          id: orderRelation.id,
          changes: { mappedEntityId: id('e1'), mappedPropertyId: customerRelation.id, displayName: 'Customer' }
        }
      ]
    ]);

    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    view.onBatchUpdated([{ recordId: 'i1', changes: { displayName: 'By status', isUnique: true } }]);
    expect(indexesBatchUpdated).toEqual([[{ id: 'i1', changes: { displayName: 'By status', isUnique: true } }]]);
  });

  it('reorders top-level and child properties, relations, and indexes', () => {
    const p1 = property('p1', 'first');
    const p2 = property('p2', 'second');
    const c1 = property('c1', 'childFirst');
    const c2 = property('c2', 'childSecond');
    const fixture = setup({
      properties: [p1, p2],
      children: new Map([[p1.id, [c1, c2]]]),
      relations: [relation('r1', 'firstRelation', 'e1'), relation('r2', 'secondRelation', 'e1')],
      indexes: [index('i1', 'e1'), index('i2', 'e1')]
    });
    const view = fixture.componentInstance;
    const propertiesBatchUpdated: unknown[] = [];
    const relationsBatchUpdated: unknown[] = [];
    const indexesBatchUpdated: unknown[] = [];
    view.propertiesBatchUpdated.subscribe(value => propertiesBatchUpdated.push(value));
    view.relationsBatchUpdated.subscribe(value => relationsBatchUpdated.push(value));
    view.indexesBatchUpdated.subscribe(value => indexesBatchUpdated.push(value));

    view.onRowReordered([p2.id, p1.id, c2.id, c1.id]);
    expect((propertiesBatchUpdated[0] as { id: string }[]).map(item => item.id)).toEqual([p2.id, p1.id, c2.id, c1.id]);

    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    view.onRowReordered([id('r2'), id('r1')]);
    expect((relationsBatchUpdated[0] as { id: string }[]).map(item => item.id)).toEqual([id('r2'), id('r1')]);

    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    view.onRowReordered(['i2', 'i1']);
    expect((indexesBatchUpdated[0] as { id: string }[]).map(item => item.id)).toEqual(['i2', 'i1']);
  });

  it('reports property errors through the cell error detector and resolves empty routes', () => {
    const prop = property('p1', 'Bad-name', { columnName: 'Bad-column' });
    const fixture = setup({ properties: [prop] });
    const view = fixture.componentInstance;

    const error = view.cellErrorDetector()(record({ _propId: prop.id, name: prop.name }), 'name');
    expect(error).toContain(DEFAULT_TRANSLATIONS.validation.propertyNameHint);

    fixture.componentRef.setInput('activeEntityId', null);
    fixture.detectChanges();
    expect(view.activeEntity()).toBeNull();
    expect(view.tableRecords()).toEqual([]);
  });

  it('returns empty derived data when the active entity cannot be resolved', () => {
    const fixture = setup({ activeEntityId: 'missing' });
    const view = fixture.componentInstance;

    expect(view.activeEntity()).toBeNull();
    expect(view.activeEntityProperties()).toEqual([]);
    expect(view.activeEntityRelations()).toEqual([]);
    expect(view.activeEntityIndexes()).toEqual([]);
    expect(view.tableRecords()).toEqual([]);
    expect(view.dropdownOptions().entities).toHaveLength(2);
  });

  it('tracks property validation errors through cell changes', () => {
    const prop = property('p1', 'status');
    const fixture = setup({ properties: [prop] });
    const view = fixture.componentInstance;
    const updated = vi.fn();
    view.propertyUpdated.subscribe(updated);
    const propRecord = record({ _propId: prop.id, _readonly: false });

    view.onCellChanged(cell({ record: propRecord, field: 'name', value: 'bad-name' }));
    expect(view.cellErrorDetector()(propRecord, 'name')).toContain(DEFAULT_TRANSLATIONS.validation.propertyNameHint);
    view.onCellChanged(cell({ record: propRecord, field: 'columnName', value: 'bad-column' }));
    expect(view.cellErrorDetector()(propRecord, 'columnName')).toContain(DEFAULT_TRANSLATIONS.validation.columnNameHint);

    view.onCellChanged(cell({ record: propRecord, field: 'name', value: 'validName' }));
    view.onCellChanged(cell({ record: propRecord, field: 'columnName', value: '' }));
    expect(view.cellErrorDetector()(propRecord, 'name')).toBeNull();
    expect(view.cellErrorDetector()(propRecord, 'columnName')).toBeNull();
    expect(updated).toHaveBeenCalledTimes(4);
  });

  it('handles add-row validation and all row event guard clauses', () => {
    const prop = property('p1', 'metadata', { propertyType: 'keyValue' });
    const fixture = setup({ properties: [prop] });
    const view = fixture.componentInstance;
    const propertyAdded = vi.fn();
    const propertyDeleted = vi.fn();
    const childAdded = vi.fn();
    view.propertyAdded.subscribe(propertyAdded);
    view.propertyDeleted.subscribe(propertyDeleted);
    view.childPropertyAdded.subscribe(childAdded);

    view.onCellChanged(cell({ record: record({ _isAddRow: true, propertyType: 'number' }), field: 'name', value: '   ' }));
    view.onCellChanged(cell({ record: record({ _isAddRow: true, propertyType: 'number' }), field: 'name', value: 'bad-name' }));
    view.onCellChanged(cell({ record: record({ _isAddRow: true, propertyType: 'number' }), field: 'displayName', value: 'ignored' }));
    view.onCellChanged(cell({ record: record({ _isAddRow: true, propertyType: 'number' }), field: 'name', value: '  amount  ' }));
    expect(propertyAdded).toHaveBeenCalledWith({ entityId: id('e1'), name: 'amount', type: 'number' });

    view.onRowDeleted(record({}));
    view.onRowDeleted(record({ _propId: prop.id, _readonly: true }));
    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    view.onRowDeleted(record({}));
    view.onRowDeleted(record({ _relId: id('r1'), _readonly: true }));
    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    view.onRowDeleted(record({}));
    expect(propertyDeleted).not.toHaveBeenCalled();

    fixture.componentRef.setInput('detailTab', 'properties');
    fixture.detectChanges();
    view.onIconClicked({ name: 'other', record: record({ _propId: prop.id, _readonly: false }) });
    view.onIconClicked({ name: 'add-child-action', record: record({ _readonly: false }) });
    view.onIconClicked({ name: 'add-child-action', record: record({ _propId: prop.id, _readonly: true }) });
    fixture.componentRef.setInput('activeEntityId', null);
    fixture.detectChanges();
    view.onIconClicked({ name: 'add-child-action', record: record({ _propId: prop.id, _readonly: false }) });
    expect(childAdded).not.toHaveBeenCalled();
  });

  it('ignores empty, readonly, unchanged, and unknown paste mutations', () => {
    const prop = property('p1', 'status', { propertyType: 'enum', enumValues: ['draft'] });
    const relationValue = relation('r1', 'customer', 'e1', { mappedEntityId: id('e2') });
    const idx = index('i1', 'e1');
    const fixture = setup({ properties: [prop], relations: [relationValue], indexes: [idx] });
    const view = fixture.componentInstance;
    const propertyBatch = vi.fn();
    const relationBatch = vi.fn();
    const indexBatch = vi.fn();
    view.propertiesBatchUpdated.subscribe(propertyBatch);
    view.relationsBatchUpdated.subscribe(relationBatch);
    view.indexesBatchUpdated.subscribe(indexBatch);

    view.onBatchUpdated([]);
    view.onBatchUpdated([
      { recordId: 'missing', changes: { name: 'ignored' } },
      { recordId: '', changes: { name: 'ignored' } },
      { recordId: prop.id, changes: { name: 'status', unknown: 'ignored', _propId: 'ignored' } }
    ]);
    expect(propertyBatch).not.toHaveBeenCalled();

    fixture.componentRef.setInput('detailTab', 'relations');
    fixture.detectChanges();
    view.onBatchUpdated([
      {
        recordId: relationValue.id,
        changes: { mappedEntityId: 'Missing', mappedPropertyId: 'orders', unknown: 'ignored' }
      }
    ]);
    expect(relationBatch).toHaveBeenCalledWith([
      { id: relationValue.id, changes: { mappedEntityId: null, mappedPropertyId: null } }
    ]);

    fixture.componentRef.setInput('detailTab', 'indexes');
    fixture.detectChanges();
    view.onBatchUpdated([{ recordId: idx.id, changes: { unknown: true } }]);
    expect(indexBatch).not.toHaveBeenCalled();
  });

  it('does not emit reorder batches when there are no effective changes', () => {
    const sortOrder = generateKeysBetween(null, null, 1)[0];
    const prop = property('p1', 'status', { sortOrder });
    const fixture = setup({ properties: [prop] });
    const batch = vi.fn();
    fixture.componentInstance.propertiesBatchUpdated.subscribe(batch);

    fixture.componentInstance.onRowReordered([]);
    fixture.componentInstance.onRowReordered([id('missing')]);
    fixture.componentInstance.onRowReordered([prop.id]);

    expect(batch).not.toHaveBeenCalled();
  });
});
