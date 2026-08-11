import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { classifyUpdates, getEntityId, UpdateDataCache } from '../../query/merge-update.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';

class TestEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id = '';
  status?: string;
  name?: string;
}

type TestEntityType = typeof TestEntity;
type UpdateEvent = RxDBEntityLocalUpdatedEventData<TestEntityType>;

const createUpdateEvent = (id: string, patch: Partial<TestEntity>, inversePatch: Partial<TestEntity>): UpdateEvent => ({
  type: 'UPDATE',
  namespace: 'test',
  entity: 'TestEntity',
  id,
  entityType: TestEntity,
  recordAt: new Date(0),
  patch,
  inversePatch
});

const serialize = (event: UpdateEvent): TestEntity => ({
  id: event.patch.id ?? event.id,
  ...event.patch
});

const activeWhere: RuleGroup<TestEntity> = {
  combinator: 'and',
  rules: [{ field: 'status', operator: '=', value: 'active' }]
};

const isActive = (entity: TestEntity | undefined): boolean => entity?.status === 'active';
const makeCache = (data: UpdateEvent[]) => new UpdateDataCache(data, serialize);

describe('merge-update.utils', () => {
  describe('getEntityId', () => {
    it('should return id from entity', () => {
      expect(getEntityId({ id: '123', name: 'test' })).toBe('123');
    });

    it('should return undefined for null', () => {
      expect(getEntityId(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(getEntityId(undefined)).toBeUndefined();
    });

    it('should return undefined for entity without id', () => {
      expect(getEntityId({ name: 'test' })).toBeUndefined();
    });
  });

  describe('UpdateDataCache', () => {
    const mockSerialize = vi.fn(serialize);

    beforeEach(() => {
      mockSerialize.mockClear();
    });

    it('should store and retrieve data by id', () => {
      const data = [createUpdateEvent('1', { id: '1', name: 'updated' }, { id: '1', name: 'original' })];
      const cache = new UpdateDataCache(data, mockSerialize);

      expect(cache.getData('1')).toEqual(data[0]);
      expect(cache.getData('nonexistent')).toBeUndefined();
    });

    it('should cache serialized update data', () => {
      const data = [createUpdateEvent('1', { id: '1', name: 'updated' }, { id: '1', name: 'original' })];
      const cache = new UpdateDataCache(data, mockSerialize);

      const result1 = cache.getSerializedUpdate('1');
      expect(result1).toEqual({ id: '1', name: 'updated' });
      expect(mockSerialize).toHaveBeenCalledTimes(1);

      const result2 = cache.getSerializedUpdate('1');
      expect(result2).toEqual({ id: '1', name: 'updated' });
      expect(mockSerialize).toHaveBeenCalledTimes(1);
    });

    it('should return undefined for nonexistent id in getSerializedUpdate', () => {
      const cache = new UpdateDataCache<TestEntityType>([], mockSerialize);
      expect(cache.getSerializedUpdate('nonexistent')).toBeUndefined();
    });

    it('should cache serialized before data', () => {
      const data = [createUpdateEvent('1', { id: '1', name: 'updated' }, { id: '1', name: 'original' })];
      const cache = new UpdateDataCache(data, mockSerialize);
      const inversePatch = { id: '1', name: 'original' };

      const result1 = cache.getSerializedBefore('1', inversePatch);
      expect(result1).toBeDefined();
      expect(mockSerialize).toHaveBeenCalledTimes(1);

      const result2 = cache.getSerializedBefore('1', inversePatch);
      expect(result2).toBeDefined();
      expect(mockSerialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('classifyUpdates', () => {
    it('should classify updates when no where condition', () => {
      const data = [
        createUpdateEvent('1', { id: '1', status: 'active' }, { id: '1', status: 'inactive' }),
        createUpdateEvent('2', { id: '2', status: 'inactive' }, { id: '2', status: 'active' })
      ];

      const result = classifyUpdates(data, null, isActive, makeCache(data));

      expect(result.updatedIds).toEqual(new Set(['1', '2']));
      expect(result.matchNowIds).toEqual(new Set(['1', '2']));
      expect(result.matchBeforeIds).toEqual(new Set(['1', '2']));
    });

    it('should identify newly matched entities', () => {
      const data = [createUpdateEvent('1', { id: '1', status: 'active' }, { id: '1', status: 'inactive' })];

      const result = classifyUpdates(data, activeWhere, isActive, makeCache(data));

      expect(result.newlyMatchedIds).toEqual(new Set(['1']));
      expect(result.newlyUnmatchedIds).toEqual(new Set());
      expect(result.stillMatchedIds).toEqual(new Set());
    });

    it('should identify newly unmatched entities', () => {
      const data = [createUpdateEvent('1', { id: '1', status: 'inactive' }, { id: '1', status: 'active' })];

      const result = classifyUpdates(data, activeWhere, isActive, makeCache(data));

      expect(result.newlyMatchedIds).toEqual(new Set());
      expect(result.newlyUnmatchedIds).toEqual(new Set(['1']));
      expect(result.stillMatchedIds).toEqual(new Set());
    });

    it('should identify still matched entities', () => {
      const data = [
        createUpdateEvent(
          '1',
          { id: '1', status: 'active', name: 'New Name' },
          { id: '1', status: 'active', name: 'Old Name' }
        )
      ];

      const result = classifyUpdates(data, activeWhere, isActive, makeCache(data));

      expect(result.newlyMatchedIds).toEqual(new Set());
      expect(result.newlyUnmatchedIds).toEqual(new Set());
      expect(result.stillMatchedIds).toEqual(new Set(['1']));
    });

    it('should handle mixed classification', () => {
      const data = [
        createUpdateEvent('1', { id: '1', status: 'active' }, { id: '1', status: 'inactive' }),
        createUpdateEvent('2', { id: '2', status: 'inactive' }, { id: '2', status: 'active' }),
        createUpdateEvent('3', { id: '3', status: 'active' }, { id: '3', status: 'active' })
      ];

      const result = classifyUpdates(data, activeWhere, isActive, makeCache(data));

      expect(result.updatedIds).toEqual(new Set(['1', '2', '3']));
      expect(result.newlyMatchedIds).toEqual(new Set(['1']));
      expect(result.newlyUnmatchedIds).toEqual(new Set(['2']));
      expect(result.stillMatchedIds).toEqual(new Set(['3']));
    });
  });
});
