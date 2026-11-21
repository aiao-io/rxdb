import type { InheritedPropertyDef } from '../../constants';
import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import {
  buildIndexRecords,
  buildPropertyRecords,
  buildRelationRecords
} from '../../components/table/table-records';
import { describe, expect, it } from 'vitest';

function property(data: Record<string, unknown>): DesignProperty {
  return data as unknown as DesignProperty;
}

function relation(data: Record<string, unknown>): DesignRelation {
  return data as unknown as DesignRelation;
}

function entity(data: Record<string, unknown>): DesignEntity {
  return data as unknown as DesignEntity;
}

function index(data: Record<string, unknown>): DesignIndex {
  return data as unknown as DesignIndex;
}

const inheritedProperty: InheritedPropertyDef = {
  name: 'id',
  type: 'uuid',
  displayName: 'ID',
  source: 'EntityBase',
  category: 'property'
};

describe('table record builders', () => {
  it('builds inherited, enum, and key-value property records', () => {
    const customProperty = property({
      id: 'status',
      name: 'status',
      propertyType: 'enum',
      enumValues: ['draft', 'published'],
      isNullable: false,
      isRequired: true,
      isUnique: false,
      isReadonly: false,
      isSortable: true
    });
    const keyValueProperty = property({
      id: 'metadata',
      name: 'metadata',
      propertyType: 'keyValue',
      isNullable: true,
      isRequired: false,
      isUnique: false,
      isReadonly: false,
      isSortable: false
    });
    const childProperty = property({
      id: 'metadata-label',
      name: 'label',
      propertyType: 'string',
      isNullable: false,
      isRequired: false,
      isUnique: false,
      isReadonly: false,
      isSortable: false
    });

    const records = buildPropertyRecords(
      [inheritedProperty],
      [customProperty, keyValueProperty],
      new Map([['metadata', [childProperty]]])
    );

    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      index: 1,
      name: 'id',
      propertyType: 'uuid',
      _readonly: true,
      _propId: null
    });
    expect(records[1]).toMatchObject({
      index: 2,
      name: 'status',
      enumValues: 'draft, published',
      _readonly: false,
      _propId: 'status'
    });
    expect(records[2]).toMatchObject({
      index: 3,
      name: 'metadata',
      hierarchyState: 'expand',
      _propId: 'metadata'
    });
    expect(records[2].children).toEqual([
      expect.objectContaining({
        index: '3.1',
        name: 'label',
        propertyType: 'string',
        _parentPropId: 'metadata'
      })
    ]);
  });

  it('keeps an empty child collection for key-value properties without children', () => {
    const records = buildPropertyRecords(
      [],
      [
        property({
          id: 'metadata',
          name: 'metadata',
          propertyType: 'keyValue'
        })
      ],
      new Map()
    );

    expect(records[0]).toMatchObject({ hierarchyState: 'expand', children: [] });
  });

  it('resolves relation labels and marks invalid custom relations', () => {
    const customRelation = relation({
      id: 'posts',
      name: 'posts',
      displayName: 'Posts',
      relationKind: 'ONE_TO_MANY',
      mappedEntityId: 'user',
      mappedPropertyId: 'user-posts',
      columnName: 'user_id'
    });
    const targetRelation = relation({ id: 'user-posts', name: 'posts' });

    const records = buildRelationRecords(
      [
        {
          ...inheritedProperty,
          name: 'createdBy',
          type: 'uuid',
          category: 'relation'
        }
      ],
      [customRelation],
      [entity({ id: 'user', name: 'User' })],
      new Map([['user', [targetRelation]]]),
      new Set(['posts'])
    );

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ name: 'createdBy', _readonly: true, _relId: null });
    expect(records[1]).toMatchObject({
      name: 'posts',
      mappedEntityId: 'User',
      mappedPropertyId: 'posts',
      onDeleteAction: 'NO_ACTION',
      onUpdateAction: 'NO_ACTION',
      _mappedEntityId: 'user',
      _mappedPropertyId: 'user-posts',
      _isInvalid: true
    });
  });

  it('maps index property ids to names and keeps unknown ids', () => {
    const records = buildIndexRecords(
      [index({ id: 'idx-status', propertyIds: ['status', 'missing'], isUnique: true })],
      [{ id: 'status', name: 'status' }]
    );

    expect(records).toEqual([
      expect.objectContaining({
        index: 1,
        propertyNames: 'status, missing',
        isUnique: true,
        _idxId: 'idx-status',
        _propertyIds: ['status', 'missing']
      })
    ]);
  });
});
