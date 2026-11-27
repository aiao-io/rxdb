vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  indexes: [] as Array<Record<string, unknown>>,
  mutationsSpy: vi.fn()
}));

vi.mock('@aiao/rxdb', () => ({
  __decorateClass: (_d: unknown[], target: unknown) => target,
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  EntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      const idx = mockState.indexes.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.indexes[idx], this);
      else mockState.indexes.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.indexes.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.indexes.splice(idx, 1);
    }
  },
  PropertyType: { string: 'string' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  TreeEntity: () => (target: unknown) => target,
  TreeAdjacencyListEntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      //
    }
    async remove() {
      //
    }
  },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: () => mockState.indexes })
}));

import { RxDB } from '@aiao/rxdb';
import { DesignIndexService } from '../../services/design-index.service';

describe('DesignIndexService', () => {
  let service: DesignIndexService;

  beforeEach(() => {
    mockState.indexes.length = 0;
    mockState.mutationsSpy.mockReset();

    TestBed.configureTestingModule({
      providers: [
        DesignIndexService,
        { provide: RxDB, useValue: { entityManager: { mutations: mockState.mutationsSpy } } }
      ]
    });

    service = TestBed.inject(DesignIndexService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('MUST be defined', () => {
    expect(service).toBeDefined();
  });

  describe('indexesOf', () => {
    it('MUST filter by entityId and sort by sortOrder', () => {
      mockState.indexes.push(
        { id: 'i1', designEntityId: 'e1', propertyIds: ['name'], isUnique: false, sortOrder: 'a1' },
        { id: 'i2', designEntityId: 'e1', propertyIds: ['email'], isUnique: true, sortOrder: 'a0' },
        { id: 'i3', designEntityId: 'e2', propertyIds: ['code'], isUnique: false, sortOrder: 'a0' }
      );

      const result = service.indexesOf('e1')();
      expect(result).toHaveLength(2);
      expect(result[0].propertyIds).toEqual(['email']);
      expect(result[1].propertyIds).toEqual(['name']);
    });

    it('MUST return empty for unknown entity', () => {
      expect(service.indexesOf('unknown')()).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('MUST create index with propertyIds', async () => {
      const idx = await service.create('e1', ['name', 'email'], true);
      expect(idx.propertyIds).toEqual(['name', 'email']);
      expect(idx.isUnique).toBe(true);
    });

    it('MUST set sortOrder based on existing count', async () => {
      mockState.indexes.push({ id: 'i1', designEntityId: 'e1', propertyIds: ['a'], sortOrder: 'a0' });
      const idx = await service.create('e1', ['b'], false);
      expect(idx.sortOrder).toBe('a1');
    });
  });

  describe('update', () => {
    it('MUST assign isUnique change and save directly', async () => {
      const saveSpy = vi.fn();
      mockState.indexes.push({
        id: 'i1',
        designEntityId: 'e1',
        propertyIds: ['a'],
        isUnique: false,
        save: saveSpy,
        sortOrder: 'a0'
      });

      await service.update('i1', { isUnique: true });
      expect(mockState.indexes[0]['isUnique']).toBe(true);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST update propertyIds via optimisticUpdate when propertyIds changes', async () => {
      const saveSpy = vi.fn();
      mockState.indexes.push({
        id: 'i1',
        designEntityId: 'e1',
        propertyIds: ['a'],
        isUnique: false,
        displayName: null,
        sortOrder: 'a0',
        save: saveSpy
      });

      await service.update('i1', { propertyIds: ['a', 'b'] });

      expect(mockState.indexes[0]['propertyIds']).toEqual(['a', 'b']);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST merge isUnique when propertyIds also changes', async () => {
      const saveSpy = vi.fn();
      mockState.indexes.push({
        id: 'i1',
        designEntityId: 'e1',
        propertyIds: ['a'],
        isUnique: false,
        displayName: 'test',
        sortOrder: 'a0',
        save: saveSpy
      });

      await service.update('i1', { propertyIds: ['a', 'b'], isUnique: true });

      expect(mockState.indexes[0]['propertyIds']).toEqual(['a', 'b']);
      expect(mockState.indexes[0]['isUnique']).toBe(true);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST throw when not found', async () => {
      await expect(service.update('nope', { isUnique: true })).rejects.toThrow('not found');
    });
  });

  describe('updateBatch', () => {
    it('MUST do nothing for empty array', async () => {
      await service.updateBatch([]);
      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });

    it('MUST batch update multiple indexes in one mutations call', async () => {
      mockState.indexes.push(
        { id: 'i1', designEntityId: 'e1', propertyIds: ['a'], isUnique: false, sortOrder: 'a0' },
        { id: 'i2', designEntityId: 'e1', propertyIds: ['b'], isUnique: false, sortOrder: 'a1' }
      );

      await service.updateBatch([
        { id: 'i1', changes: { isUnique: true } },
        { id: 'i2', changes: { displayName: 'Idx2' } }
      ]);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      expect(mockState.indexes[0]['isUnique']).toBe(true);
      expect(mockState.indexes[1]['displayName']).toBe('Idx2');
    });

    it('MUST skip non-existent ids', async () => {
      mockState.indexes.push({ id: 'i1', designEntityId: 'e1', propertyIds: ['a'], isUnique: false, sortOrder: 'a0' });

      await service.updateBatch([
        { id: 'i1', changes: { isUnique: true } },
        { id: 'nonexistent', changes: { isUnique: true } }
      ]);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
    });

    it('MUST not call mutations when all ids are nonexistent', async () => {
      await service.updateBatch([{ id: 'nope', changes: { isUnique: true } }]);
      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });

    it('MUST rollback on mutations failure', async () => {
      mockState.indexes.push({ id: 'i1', designEntityId: 'e1', propertyIds: ['a'], isUnique: false, sortOrder: 'a0' });
      mockState.mutationsSpy.mockRejectedValueOnce(new Error('tx failed'));

      await expect(service.updateBatch([{ id: 'i1', changes: { isUnique: true } }])).rejects.toThrow('tx failed');

      expect(mockState.indexes[0]['isUnique']).toBe(false);
    });
  });

  describe('evictCache', () => {
    it('MUST clear cached signal for entityId', () => {
      mockState.indexes.push({ id: 'i1', designEntityId: 'e1', propertyIds: ['a'], isUnique: false, sortOrder: 'a0' });

      const sig1 = service.indexesOf('e1');
      service.evictCache('e1');
      const sig2 = service.indexesOf('e1');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('remove', () => {
    it('MUST remove index', async () => {
      const removeSpy = vi.fn();
      mockState.indexes.push({
        id: 'i1',
        designEntityId: 'e1',
        propertyIds: ['a'],
        remove: removeSpy,
        sortOrder: 'a0'
      });

      await service.remove('i1');
      expect(removeSpy).toHaveBeenCalled();
    });

    it('MUST throw when not found', async () => {
      await expect(service.remove('nope')).rejects.toThrow('not found');
    });
  });
});
