import { describe, expect, it } from 'vitest';
import type {
  DesignEntitySnapshot,
  DesignIndexSnapshot,
  DesignPropertySnapshot,
  DesignRelationSnapshot
} from '../../utils/design-clone';
import { cloneDesignSnapshot } from '../../utils/design-clone';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function makeEntity(overrides: Partial<DesignEntitySnapshot> & { id: string; name: string }): DesignEntitySnapshot {
  return {
    tableName: null,
    displayName: null,
    entityNamespace: null,
    extendsBase: 'EntityBase',
    repositoryType: 'Repository',
    nodeX: 0,
    nodeY: 0,
    nodeWidth: 240,
    sortOrder: 'a0',
    ...overrides
  };
}

function makeProperty(
  overrides: Partial<DesignPropertySnapshot> & { id: string; designEntityId: string; name: string }
): DesignPropertySnapshot {
  return {
    parentId: null,
    propertyType: 'string',
    columnName: null,
    displayName: null,
    isUnique: false,
    isNullable: false,
    isRequired: false,
    isReadonly: false,
    isSortable: false,
    defaultValue: null,
    enumValues: null,
    sortOrder: 'a0',
    ...overrides
  };
}

function makeRelation(
  overrides: Partial<DesignRelationSnapshot> & { id: string; designEntityId: string; name: string }
): DesignRelationSnapshot {
  return {
    relationKind: 'MANY_TO_ONE',
    mappedEntityId: null,
    mappedPropertyId: null,
    mappedNamespace: null,
    columnName: null,
    displayName: null,
    onDeleteAction: null,
    onUpdateAction: null,
    sortOrder: 'a0',
    ...overrides
  };
}

function makeIndex(
  overrides: Partial<DesignIndexSnapshot> & { id: string; designEntityId: string; propertyIds: string[] }
): DesignIndexSnapshot {
  return {
    isUnique: false,
    displayName: null,
    sortOrder: 'a0',
    ...overrides
  };
}

describe('cloneDesignSnapshot', () => {
  it('MUST regenerate ids for entities, properties, relations and indexes', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const properties = [makeProperty({ id: 'p1', designEntityId: 'e1', name: 'name' })];
    const relations = [makeRelation({ id: 'r1', designEntityId: 'e1', name: 'posts' })];
    const indexes = [makeIndex({ id: 'i1', designEntityId: 'e1', propertyIds: ['p1'] })];

    let counter = 0;
    const result = cloneDesignSnapshot(entities, properties, relations, indexes, () => `new-${++counter}`);

    expect(result.entities[0].id).not.toBe('e1');
    expect(result.properties[0].id).not.toBe('p1');
    expect(result.relations[0].id).not.toBe('r1');
    expect(result.indexes[0].id).not.toBe('i1');
  });

  it('MUST preserve non-reference fields verbatim', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User', displayName: '用户', nodeX: 120, nodeY: 80 })];
    const result = cloneDesignSnapshot(entities, [], [], []);
    expect(result.entities[0]).toMatchObject({ name: 'User', displayName: '用户', nodeX: 120, nodeY: 80 });
  });

  it('MUST remap designEntityId on properties/relations/indexes to the cloned entity id', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const properties = [makeProperty({ id: 'p1', designEntityId: 'e1', name: 'name' })];
    const relations = [makeRelation({ id: 'r1', designEntityId: 'e1', name: 'posts' })];
    const indexes = [makeIndex({ id: 'i1', designEntityId: 'e1', propertyIds: ['p1'] })];

    const result = cloneDesignSnapshot(entities, properties, relations, indexes);

    const newEntityId = result.entities[0].id;
    expect(result.properties[0].designEntityId).toBe(newEntityId);
    expect(result.relations[0].designEntityId).toBe(newEntityId);
    expect(result.indexes[0].designEntityId).toBe(newEntityId);
  });

  it('MUST remap DesignProperty.parentId for nested keyValue child properties', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const properties = [
      makeProperty({ id: 'p1', designEntityId: 'e1', name: 'address', propertyType: 'keyValue' }),
      makeProperty({ id: 'p2', designEntityId: 'e1', name: 'city', parentId: 'p1' })
    ];

    const result = cloneDesignSnapshot(entities, properties, [], []);

    const newParentId = must(result.properties.find(p => p.name === 'address')).id;
    const child = must(result.properties.find(p => p.name === 'city'));
    expect(child.parentId).toBe(newParentId);
  });

  it('MUST remap DesignIndex.propertyIds to the cloned property ids', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const properties = [
      makeProperty({ id: 'p1', designEntityId: 'e1', name: 'name' }),
      makeProperty({ id: 'p2', designEntityId: 'e1', name: 'email' })
    ];
    const indexes = [makeIndex({ id: 'i1', designEntityId: 'e1', propertyIds: ['p1', 'p2'] })];

    const result = cloneDesignSnapshot(entities, properties, [], indexes);

    const newP1 = must(result.properties.find(p => p.name === 'name')).id;
    const newP2 = must(result.properties.find(p => p.name === 'email')).id;
    expect(result.indexes[0].propertyIds).toEqual([newP1, newP2]);
  });

  it('MUST remap DesignRelation.mappedEntityId when the target entity is in the cloned set', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' }), makeEntity({ id: 'e2', name: 'Post' })];
    const relations = [makeRelation({ id: 'r1', designEntityId: 'e1', name: 'posts', mappedEntityId: 'e2' })];

    const result = cloneDesignSnapshot(entities, [], relations, []);

    const newE2 = must(result.entities.find(e => e.name === 'Post')).id;
    expect(result.relations[0].mappedEntityId).toBe(newE2);
  });

  it('MUST remap DesignRelation.mappedPropertyId (inverse relation pairing) when the target relation is in the cloned set', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' }), makeEntity({ id: 'e2', name: 'Post' })];
    const relations = [
      makeRelation({ id: 'r1', designEntityId: 'e1', name: 'posts', mappedEntityId: 'e2', mappedPropertyId: 'r2' }),
      makeRelation({ id: 'r2', designEntityId: 'e2', name: 'user', mappedEntityId: 'e1', mappedPropertyId: 'r1' })
    ];

    const result = cloneDesignSnapshot(entities, [], relations, []);

    const newR1 = must(result.relations.find(r => r.name === 'posts'));
    const newR2 = must(result.relations.find(r => r.name === 'user'));
    expect(newR1.mappedPropertyId).toBe(newR2.id);
    expect(newR2.mappedPropertyId).toBe(newR1.id);
  });

  it('MUST silently preserve DesignRelation.mappedEntityId when the target entity is NOT in the cloned set (cross-design reference)', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const relations = [
      makeRelation({ id: 'r1', designEntityId: 'e1', name: 'external', mappedEntityId: 'other-design-entity-id' })
    ];

    const result = cloneDesignSnapshot(entities, [], relations, []);

    expect(result.relations[0].mappedEntityId).toBe('other-design-entity-id');
  });

  it('MUST silently preserve DesignRelation.mappedPropertyId when the target relation is NOT in the cloned set', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const relations = [
      makeRelation({ id: 'r1', designEntityId: 'e1', name: 'external', mappedPropertyId: 'other-design-relation-id' })
    ];

    const result = cloneDesignSnapshot(entities, [], relations, []);

    expect(result.relations[0].mappedPropertyId).toBe('other-design-relation-id');
  });

  it('MUST leave null reference fields as null', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const relations = [makeRelation({ id: 'r1', designEntityId: 'e1', name: 'solo' })];
    const properties = [makeProperty({ id: 'p1', designEntityId: 'e1', name: 'name' })];

    const result = cloneDesignSnapshot(entities, properties, relations, []);

    expect(result.relations[0].mappedEntityId).toBeNull();
    expect(result.relations[0].mappedPropertyId).toBeNull();
    expect(result.properties[0].parentId).toBeNull();
  });

  it('MUST produce unique ids across all cloned entities/properties/relations/indexes', () => {
    const entities = [makeEntity({ id: 'e1', name: 'User' })];
    const properties = [makeProperty({ id: 'p1', designEntityId: 'e1', name: 'name' })];
    const relations = [makeRelation({ id: 'r1', designEntityId: 'e1', name: 'posts' })];
    const indexes = [makeIndex({ id: 'i1', designEntityId: 'e1', propertyIds: ['p1'] })];

    const result = cloneDesignSnapshot(entities, properties, relations, indexes);
    const allIds = [
      ...result.entities.map(e => e.id),
      ...result.properties.map(p => p.id),
      ...result.relations.map(r => r.id),
      ...result.indexes.map(i => i.id)
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('MUST handle empty input arrays', () => {
    const result = cloneDesignSnapshot([], [], [], []);
    expect(result).toEqual({ entities: [], properties: [], relations: [], indexes: [] });
  });
});
