import { RelationKind, type EntityMetadata, type EntityRelationMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { buildDetailTabs } from './detail-tabs.js';
import type { DetailFormTab, DetailTableTab } from './interfaces.js';

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

describe('buildDetailTabs', () => {
  it('should return only form tab when no relations', () => {
    const tabs = buildDetailTabs(makeMeta());
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toEqual<DetailFormTab>({ key: 'basic', label: '基本信息', type: 'form' });
  });

  it('should create table tab for ONE_TO_MANY relation', () => {
    const meta = makeMeta({
      relationMap: new Map([
        [
          'items',
          {
            name: 'items',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'OrderItem',
            mappedNamespace: 'public',
            mappedProperty: 'order',
            displayName: '订单项'
          } as EntityRelationMetadata
        ]
      ])
    });

    const tabs = buildDetailTabs(meta);
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toEqual<DetailTableTab>({
      key: 'items',
      label: '订单项',
      type: 'table',
      relationName: 'items',
      relatedEntityName: 'OrderItem',
      relatedNamespace: 'public',
      relationKind: RelationKind.ONE_TO_MANY,
      foreignKeyField: 'orderId'
    });
  });

  it('should create table tab for MANY_TO_MANY relation without foreignKeyField', () => {
    const meta = makeMeta({
      relationMap: new Map([
        [
          'tags',
          {
            name: 'tags',
            kind: RelationKind.MANY_TO_MANY,
            mappedEntity: 'Tag',
            mappedNamespace: 'public',
            mappedProperty: 'posts',
            displayName: '标签'
          } as EntityRelationMetadata
        ]
      ])
    });

    const tabs = buildDetailTabs(meta);
    expect(tabs).toHaveLength(2);
    const tab = tabs[1] as DetailTableTab;
    expect(tab.relationKind).toBe(RelationKind.MANY_TO_MANY);
    expect(tab.foreignKeyField).toBeUndefined();
  });

  it('should skip MANY_TO_ONE and ONE_TO_ONE relations', () => {
    const meta = makeMeta({
      relationMap: new Map([
        [
          'author',
          {
            name: 'author',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'User',
            mappedNamespace: 'public',
            mappedProperty: 'posts'
          } as EntityRelationMetadata
        ],
        [
          'profile',
          {
            name: 'profile',
            kind: RelationKind.ONE_TO_ONE,
            mappedEntity: 'Profile',
            mappedNamespace: 'public',
            mappedProperty: 'user'
          } as EntityRelationMetadata
        ]
      ])
    });

    const tabs = buildDetailTabs(meta);
    expect(tabs).toHaveLength(1);
  });

  it('should use relation name as fallback label when displayName is missing', () => {
    const meta = makeMeta({
      relationMap: new Map([
        [
          'comments',
          {
            name: 'comments',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'Comment',
            mappedNamespace: 'public',
            mappedProperty: 'post'
          } as EntityRelationMetadata
        ]
      ])
    });

    const tabs = buildDetailTabs(meta);
    expect((tabs[1] as DetailTableTab).label).toBe('comments');
  });

  it('should default relatedNamespace to public when mappedNamespace is missing', () => {
    const meta = makeMeta({
      relationMap: new Map([
        [
          'items',
          {
            name: 'items',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'Item',
            mappedProperty: 'parent'
          } as EntityRelationMetadata
        ]
      ])
    });

    const tabs = buildDetailTabs(meta);
    expect((tabs[1] as DetailTableTab).relatedNamespace).toBe('public');
  });
});
