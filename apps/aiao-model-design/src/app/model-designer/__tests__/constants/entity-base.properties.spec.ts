vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { describe, expect, it } from 'vitest';

vi.mock('@aiao/rxdb', () => ({
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  EntityBase: class {},
  TreeAdjacencyListEntityBase: class {},
  ENTITY_BASE_METADATA_OPTIONS: {
    properties: [
      { name: 'id', type: 'uuid', displayName: 'ID' },
      { name: 'createdAt', type: 'date', displayName: 'Created At' }
    ],
    computedProperties: [{ name: 'displayName', type: 'string', displayName: 'Display Name' }],
    relations: [
      {
        name: 'createdBy',
        kind: '1:1',
        displayName: 'Created By',
        columnName: 'createdById',
        mappedEntity: 'User'
      }
    ]
  },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: {
    properties: [{ name: 'sortOrder', type: 'string', displayName: 'Sort Order' }],
    computedProperties: [],
    relations: [
      {
        name: 'parent',
        kind: 'm:1',
        displayName: 'Parent',
        columnName: 'parentId',
        mappedEntity: 'Self'
      },
      {
        name: 'children',
        kind: '1:m',
        displayName: 'Children',
        mappedEntity: 'Self'
      }
    ]
  }
}));

import { vi } from 'vitest';
import { getInheritedProperties, getRepositoryType, isInheritedProperty } from '../../constants/entity-base.properties';

describe('entity-base.properties', () => {
  describe('getInheritedProperties', () => {
    it('MUST return base properties for EntityBase', () => {
      const props = getInheritedProperties('EntityBase');
      expect(props.length).toBeGreaterThan(0);
      expect(props.some(p => p.name === 'id')).toBe(true);
      expect(props.some(p => p.name === 'createdAt')).toBe(true);
    });

    it('MUST return extra properties for TreeEntityBase', () => {
      const props = getInheritedProperties('TreeEntityBase');
      const baseProps = getInheritedProperties('EntityBase');
      expect(props.length).toBeGreaterThan(baseProps.length);
      expect(props.some(p => p.name === 'sortOrder')).toBe(true);
    });

    it('MUST include computed properties', () => {
      const props = getInheritedProperties('EntityBase');
      const computed = props.filter(p => p.category === 'computed');
      expect(computed.length).toBeGreaterThan(0);
    });

    it('MUST include relation column properties', () => {
      const props = getInheritedProperties('EntityBase');
      expect(props.some(p => p.name === 'createdById')).toBe(true);
    });

    it('MUST include relation definitions', () => {
      const props = getInheritedProperties('EntityBase');
      const relations = props.filter(p => p.category === 'relation');
      expect(relations.length).toBeGreaterThan(0);
      expect(relations.some(p => p.name === 'createdBy')).toBe(true);
    });
  });

  describe('getRepositoryType', () => {
    it('MUST return Repository for EntityBase', () => {
      expect(getRepositoryType('EntityBase')).toBe('Repository');
    });

    it('MUST return TreeRepository for TreeEntityBase', () => {
      expect(getRepositoryType('TreeEntityBase')).toBe('TreeRepository');
    });
  });

  describe('isInheritedProperty', () => {
    it('MUST return true for base property names', () => {
      expect(isInheritedProperty('id')).toBe(true);
      expect(isInheritedProperty('createdAt')).toBe(true);
    });

    it('MUST return false for custom property names', () => {
      expect(isInheritedProperty('customField')).toBe(false);
      expect(isInheritedProperty('myProp')).toBe(false);
    });

    it('MUST return true for tree entity property names', () => {
      expect(isInheritedProperty('sortOrder')).toBe(true);
    });
  });
});
