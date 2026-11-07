vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  entities: [] as Array<Record<string, unknown>>,
  properties: [] as Array<Record<string, unknown>>
}));

vi.mock('@aiao/rxdb', () => ({
  __decorateClass: (_d: unknown[], target: unknown) => target,
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  TreeEntity: () => (target: unknown) => target,
  EntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
  TreeAdjacencyListEntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
  PropertyType: { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: (EntityClass: { name: string }) =>
    EntityClass.name === 'DesignEntity' ? { value: () => mockState.entities } : { value: () => mockState.properties }
}));

import { DesignDiffService, diffEntityArrays, diffPropertyArrays } from '../../services/design-diff.service';

function makeComparableProperty(overrides: Record<string, unknown> & { id: string; name: string }) {
  return {
    propertyType: 'string',
    isRequired: false,
    isUnique: false,
    isNullable: false,
    isReadonly: false,
    isSortable: false,
    defaultValue: null,
    enumValues: null,
    displayName: null,
    columnName: null,
    ...overrides
  };
}

describe('diffEntityArrays', () => {
  it('MUST classify entities present only in b as added', () => {
    const result = diffEntityArrays([], [{ id: 'e1', name: 'User' }]);
    expect(result.added).toEqual([{ name: 'User', entityIdA: null, entityIdB: 'e1' }]);
    expect(result.removed).toEqual([]);
    expect(result.common).toEqual([]);
  });

  it('MUST classify entities present only in a as removed', () => {
    const result = diffEntityArrays([{ id: 'e1', name: 'User' }], []);
    expect(result.removed).toEqual([{ name: 'User', entityIdA: 'e1', entityIdB: null }]);
  });

  it('MUST match entities present in both by name into common', () => {
    const result = diffEntityArrays([{ id: 'e1', name: 'User' }], [{ id: 'e2', name: 'User' }]);
    expect(result.common).toEqual([{ name: 'User', entityIdA: 'e1', entityIdB: 'e2' }]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });
});

describe('diffPropertyArrays', () => {
  it('MUST classify properties present only in b as added', () => {
    const result = diffPropertyArrays([], [makeComparableProperty({ id: 'p1', name: 'email' })]);
    expect(result.added).toEqual([{ name: 'email', propertyIdA: null, propertyIdB: 'p1', changedFields: [] }]);
  });

  it('MUST classify properties present only in a as removed', () => {
    const result = diffPropertyArrays([makeComparableProperty({ id: 'p1', name: 'email' })], []);
    expect(result.removed).toEqual([{ name: 'email', propertyIdA: 'p1', propertyIdB: null, changedFields: [] }]);
  });

  it('MUST classify matching properties with identical fields as unchanged', () => {
    const a = [makeComparableProperty({ id: 'p1', name: 'email', propertyType: 'string' })];
    const b = [makeComparableProperty({ id: 'p2', name: 'email', propertyType: 'string' })];
    const result = diffPropertyArrays(a, b);
    expect(result.unchanged).toEqual([{ name: 'email', propertyIdA: 'p1', propertyIdB: 'p2', changedFields: [] }]);
    expect(result.changed).toEqual([]);
  });

  it('MUST classify matching properties with differing fields as changed and list changed field names', () => {
    const a = [makeComparableProperty({ id: 'p1', name: 'email', propertyType: 'string', isRequired: false })];
    const b = [makeComparableProperty({ id: 'p2', name: 'email', propertyType: 'text', isRequired: true })];
    const result = diffPropertyArrays(a, b);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].changedFields.sort()).toEqual(['isRequired', 'propertyType']);
  });

  it('MUST compare enumValues arrays by content, not reference', () => {
    const a = [makeComparableProperty({ id: 'p1', name: 'status', enumValues: ['a', 'b'] })];
    const b = [makeComparableProperty({ id: 'p2', name: 'status', enumValues: ['a', 'b'] })];
    const result = diffPropertyArrays(a, b);
    expect(result.unchanged).toHaveLength(1);
  });

  it('MUST detect enumValues content changes', () => {
    const a = [makeComparableProperty({ id: 'p1', name: 'status', enumValues: ['a', 'b'] })];
    const b = [makeComparableProperty({ id: 'p2', name: 'status', enumValues: ['a', 'c'] })];
    const result = diffPropertyArrays(a, b);
    expect(result.changed[0].changedFields).toEqual(['enumValues']);
  });
});

describe('DesignDiffService', () => {
  let service: DesignDiffService;

  beforeEach(() => {
    mockState.entities.length = 0;
    mockState.properties.length = 0;

    TestBed.configureTestingModule({ providers: [DesignDiffService] });
    service = TestBed.inject(DesignDiffService);
  });

  it('MUST filter entities by modelDesignId before diffing', () => {
    mockState.entities.push(
      { id: 'e1', name: 'User', modelDesignId: 'design-a' },
      { id: 'e2', name: 'Post', modelDesignId: 'design-a' },
      { id: 'e3', name: 'User', modelDesignId: 'design-b' }
    );

    const result = service.diffEntitySets('design-a', 'design-b');
    expect(result.common).toEqual([{ name: 'User', entityIdA: 'e1', entityIdB: 'e3' }]);
    expect(result.removed).toEqual([{ name: 'Post', entityIdA: 'e2', entityIdB: null }]);
  });

  it('MUST filter properties by designEntityId before diffing', () => {
    mockState.properties.push(
      makeComparableProperty({ id: 'p1', name: 'name', designEntityId: 'entity-a' }),
      makeComparableProperty({ id: 'p2', name: 'name', designEntityId: 'entity-b' }),
      makeComparableProperty({ id: 'p3', name: 'age', designEntityId: 'entity-a' })
    );

    const result = service.diffPropertySets('entity-a', 'entity-b');
    expect(result.unchanged).toEqual([{ name: 'name', propertyIdA: 'p1', propertyIdB: 'p2', changedFields: [] }]);
    expect(result.removed).toEqual([{ name: 'age', propertyIdA: 'p3', propertyIdB: null, changedFields: [] }]);
  });
});
