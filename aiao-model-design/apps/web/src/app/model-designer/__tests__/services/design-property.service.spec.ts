vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  properties: [] as Array<Record<string, unknown>>,
  indexes: [] as Array<Record<string, unknown>>,
  entities: [] as Array<Record<string, unknown>>,
  mutationsSpy: vi.fn()
}));

vi.mock('@aiao/rxdb', () => {
  return {
    PropertyType: { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean' },
    RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
    ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
    __decorateClass: (_d: unknown[], target: unknown) => target,
    TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] },
    RxDB: class {},
    Entity: () => (target: unknown) => target,
    TreeEntity: () => (target: unknown) => target,
    EntityBase: class {
      [key: string]: unknown;
      constructor(data: Record<string, unknown> = {}) {
        Object.assign(this, data);
        if (!this['id']) this['id'] = crypto.randomUUID();
      }
      async save() {
        const idx = mockState.properties.findIndex(e => e['id'] === this['id']);
        if (idx >= 0) Object.assign(mockState.properties[idx], this);
        else mockState.properties.push(this as Record<string, unknown>);
      }
      async remove() {
        const idx = mockState.properties.findIndex(e => e['id'] === this['id']);
        if (idx >= 0) mockState.properties.splice(idx, 1);
      }
    },
    TreeAdjacencyListEntityBase: class {
      [key: string]: unknown;
      constructor(data: Record<string, unknown> = {}) {
        Object.assign(this, data);
        if (!this['id']) this['id'] = crypto.randomUUID();
      }
      async save() {
        const idx = mockState.properties.findIndex(e => e['id'] === this['id']);
        if (idx >= 0) Object.assign(mockState.properties[idx], this);
        else mockState.properties.push(this as Record<string, unknown>);
      }
      async remove() {
        const idx = mockState.properties.findIndex(e => e['id'] === this['id']);
        if (idx >= 0) mockState.properties.splice(idx, 1);
      }
    }
  };
});

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: () => mockState.properties })
}));

vi.mock('../../services/design-index.service', () => ({
  DesignIndexService: class {
    indexesOf() {
      return () => mockState.indexes;
    }
  }
}));

vi.mock('../../services/design-entity.service', () => ({
  DesignEntityService: class {
    entities = () => mockState.entities;
  }
}));

import { RxDB } from '@aiao/rxdb';
import { DesignEntityService } from '../../services/design-entity.service';
import { DesignIndexService } from '../../services/design-index.service';
import { DesignPropertyService } from '../../services/design-property.service';

describe('DesignPropertyService', () => {
  let service: DesignPropertyService;

  beforeEach(() => {
    mockState.properties.length = 0;
    mockState.indexes.length = 0;
    mockState.entities.length = 0;
    mockState.mutationsSpy.mockReset();

    TestBed.configureTestingModule({
      providers: [
        DesignPropertyService,
        DesignIndexService,
        DesignEntityService,
        {
          provide: RxDB,
          useValue: { entityManager: { mutations: mockState.mutationsSpy } }
        }
      ]
    });

    service = TestBed.inject(DesignPropertyService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('MUST be defined', () => {
    expect(service).toBeDefined();
  });

  describe('propertiesOf', () => {
    it('MUST filter by entityId', () => {
      mockState.properties.push(
        { id: 'p1', name: 'firstName', designEntityId: 'e1', sortOrder: 'a0' },
        { id: 'p2', name: 'email', designEntityId: 'e2', sortOrder: 'a0' },
        { id: 'p3', name: 'lastName', designEntityId: 'e1', sortOrder: 'a1' }
      );

      const props = service.propertiesOf('e1')();
      expect(props).toHaveLength(2);
      expect(props.map(p => p.name)).toEqual(['firstName', 'lastName']);
    });

    it('MUST sort by sortOrder', () => {
      mockState.properties.push(
        { id: 'p1', name: 'lastName', designEntityId: 'e1', sortOrder: 'a2' },
        { id: 'p2', name: 'email', designEntityId: 'e1', sortOrder: 'a1' },
        { id: 'p3', name: 'firstName', designEntityId: 'e1', sortOrder: 'a0' }
      );

      const props = service.propertiesOf('e1')();
      expect(props.map(p => p.name)).toEqual(['firstName', 'email', 'lastName']);
    });

    it('MUST return empty for unknown entityId', () => {
      mockState.properties.push({ id: 'p1', name: 'name', designEntityId: 'e1', sortOrder: 'a0' });
      expect(service.propertiesOf('unknown')()).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('MUST create property with correct fields', async () => {
      const prop = await service.create('e1', 'firstName', 'string');
      expect(prop.name).toBe('firstName');
      expect(prop.designEntityId).toBe('e1');
      expect(prop.propertyType).toBe('string');
    });

    it('MUST set sortOrder to existing property count', async () => {
      mockState.properties.push(
        { id: 'p1', name: 'a', designEntityId: 'e1', sortOrder: 'a0' },
        { id: 'p2', name: 'b', designEntityId: 'e1', sortOrder: 'a1' }
      );

      const prop = await service.create('e1', 'c', 'string');
      expect(prop.sortOrder).toBe('a2');
    });

    it('MUST call save', async () => {
      const before = mockState.properties.length;
      await service.create('e1', 'name', 'string');
      expect(mockState.properties.length).toBeGreaterThan(before);
    });

    it('MUST throw on duplicate child property name', async () => {
      mockState.properties.push(
        {
          id: 'p1',
          name: 'config',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a0',
          parentId: null
        },
        {
          id: 'c1',
          name: 'host',
          designEntityId: 'e1',
          propertyType: 'string',
          sortOrder: 'a0',
          parentId: 'p1'
        }
      );
      await expect(service.create('e1', 'host', 'string', 'p1')).rejects.toThrow('Duplicate child property name');
    });

    it('MUST throw on duplicate top-level property name', async () => {
      mockState.properties.push({
        id: 'p1',
        name: 'email',
        designEntityId: 'e1',
        sortOrder: 'a0',
        parentId: null
      });
      await expect(service.create('e1', 'email', 'string')).rejects.toThrow('Duplicate child property name');
    });

    it('MUST allow same name in different parents', async () => {
      mockState.properties.push(
        {
          id: 'p1',
          name: 'configA',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a0',
          parentId: null
        },
        {
          id: 'p2',
          name: 'configB',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a1',
          parentId: null
        },
        {
          id: 'c1',
          name: 'host',
          designEntityId: 'e1',
          propertyType: 'string',
          sortOrder: 'a0',
          parentId: 'p1'
        }
      );
      const prop = await service.create('e1', 'host', 'string', 'p2');
      expect(prop.name).toBe('host');
    });
  });

  describe('update', () => {
    it('MUST assign changes and save', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push({ id: 'p1', name: 'old', designEntityId: 'e1', sortOrder: 'a0', save: saveSpy });

      await service.update('p1', { name: 'new' });
      expect(mockState.properties[0]['name']).toBe('new');
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST throw when property not found', async () => {
      await expect(service.update('nonexistent', { name: 'x' })).rejects.toThrow('not found');
    });

    it('MUST throw on duplicate sibling name', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push(
        { id: 'p1', name: 'a', designEntityId: 'e1', sortOrder: 'a0', parentId: null, save: saveSpy },
        { id: 'p2', name: 'b', designEntityId: 'e1', sortOrder: 'a1', parentId: null, save: saveSpy }
      );
      await expect(service.update('p2', { name: 'a' })).rejects.toThrow('Duplicate property name');
    });

    it('MUST throw on duplicate child sibling name', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push(
        {
          id: 'p1',
          name: 'config',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a0',
          parentId: null,
          save: saveSpy
        },
        { id: 'c1', name: 'host', designEntityId: 'e1', sortOrder: 'a0', parentId: 'p1', save: saveSpy },
        { id: 'c2', name: 'port', designEntityId: 'e1', sortOrder: 'a1', parentId: 'p1', save: saveSpy }
      );
      await expect(service.update('c2', { name: 'host' })).rejects.toThrow('Duplicate property name');
    });

    it('MUST cascade delete children when type changes from keyValue', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push(
        {
          id: 'p1',
          name: 'config',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a0',
          parentId: null,
          save: saveSpy
        },
        { id: 'c1', name: 'host', designEntityId: 'e1', sortOrder: 'a0', parentId: 'p1', save: saveSpy },
        { id: 'c2', name: 'port', designEntityId: 'e1', sortOrder: 'a1', parentId: 'p1', save: saveSpy }
      );

      await service.update('p1', { propertyType: 'string' });

      // Single mutations call = single undo/redo record
      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];

      // Children removed
      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'c1' }));
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'c2' }));

      // Property type updated in the same transaction
      const allUpdated = [...arg.update.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allUpdated).toContainEqual(expect.objectContaining({ id: 'p1', propertyType: 'string' }));

      // save() NOT called separately — everything goes through mutations
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('MUST NOT cascade when type stays keyValue', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push(
        {
          id: 'p1',
          name: 'config',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a0',
          parentId: null,
          save: saveSpy
        },
        { id: 'c1', name: 'host', designEntityId: 'e1', sortOrder: 'a0', parentId: 'p1', save: saveSpy }
      );

      await service.update('p1', { name: 'settings' });

      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
      expect(mockState.properties[0]['name']).toBe('settings');
    });
  });

  describe('childPropertiesOf', () => {
    it('MUST filter by parentId and sort by sortOrder', () => {
      mockState.properties.push(
        { id: 'p1', name: 'config', designEntityId: 'e1', propertyType: 'keyValue', sortOrder: 'a0', parentId: null },
        { id: 'c1', name: 'port', designEntityId: 'e1', propertyType: 'number', sortOrder: 'a1', parentId: 'p1' },
        { id: 'c2', name: 'host', designEntityId: 'e1', propertyType: 'string', sortOrder: 'a0', parentId: 'p1' },
        { id: 'c3', name: 'other', designEntityId: 'e1', propertyType: 'string', sortOrder: 'a0', parentId: 'p2' }
      );

      const children = service.childPropertiesOf('p1')();
      expect(children).toHaveLength(2);
      expect(children[0].name).toBe('host');
      expect(children[1].name).toBe('port');
    });

    it('MUST cache the signal (same reference)', () => {
      const sig1 = service.childPropertiesOf('p1');
      const sig2 = service.childPropertiesOf('p1');
      expect(sig1).toBe(sig2);
    });

    it('MUST return empty for unknown parentId', () => {
      expect(service.childPropertiesOf('nonexistent')()).toHaveLength(0);
    });
  });

  describe('updateBatch', () => {
    it('MUST do nothing for empty array', async () => {
      await service.updateBatch([]);
      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });

    it('MUST batch update multiple properties', async () => {
      mockState.properties.push(
        { id: 'p1', name: 'firstName', designEntityId: 'e1', sortOrder: 'a0' },
        { id: 'p2', name: 'lastName', designEntityId: 'e1', sortOrder: 'a1' }
      );

      await service.updateBatch([
        { id: 'p1', changes: { displayName: 'First Name' } },
        { id: 'p2', changes: { displayName: 'Last Name' } }
      ]);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      expect(mockState.properties[0]['displayName']).toBe('First Name');
      expect(mockState.properties[1]['displayName']).toBe('Last Name');
    });

    it('MUST skip non-existent ids', async () => {
      mockState.properties.push({ id: 'p1', name: 'a', designEntityId: 'e1', sortOrder: 'a0' });

      await service.updateBatch([
        { id: 'p1', changes: { displayName: 'A' } },
        { id: 'nope', changes: { displayName: 'X' } }
      ]);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
    });

    it('MUST not call mutations when all ids nonexistent', async () => {
      await service.updateBatch([{ id: 'nope', changes: { displayName: 'X' } }]);
      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });

    it('MUST rollback on mutations failure', async () => {
      mockState.properties.push({ id: 'p1', name: 'a', designEntityId: 'e1', displayName: null, sortOrder: 'a0' });
      mockState.mutationsSpy.mockRejectedValueOnce(new Error('tx failed'));

      await expect(service.updateBatch([{ id: 'p1', changes: { displayName: 'New' } }])).rejects.toThrow('tx failed');

      expect(mockState.properties[0]['displayName']).toBeNull();
    });

    it('MUST reject propertyType changes', async () => {
      mockState.properties.push({ id: 'p1', name: 'a', designEntityId: 'e1', propertyType: 'string', sortOrder: 'a0' });

      await expect(
        service.updateBatch([{ id: 'p1', changes: { propertyType: 'number' } as Record<string, unknown> }])
      ).rejects.toThrow('updateBatch does not support propertyType changes');

      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });
  });

  describe('allProperties', () => {
    it('MUST only include properties whose entity belongs to the current design', () => {
      mockState.entities.push({ id: 'e1' }, { id: 'e2' });
      mockState.properties.push(
        { id: 'p1', designEntityId: 'e1', sortOrder: 'a0' },
        { id: 'p2', designEntityId: 'e2', sortOrder: 'a0' },
        { id: 'p3', designEntityId: 'e3', sortOrder: 'a0' }
      );

      expect(
        service
          .allProperties()
          .map(p => p.id)
          .sort()
      ).toEqual(['p1', 'p2']);
    });

    it('MUST return empty when there are no entities in the current design', () => {
      mockState.properties.push({ id: 'p1', designEntityId: 'e1', sortOrder: 'a0' });
      expect(service.allProperties()).toHaveLength(0);
    });
  });

  describe('evictCache', () => {
    it('MUST clear cached signal for entityId', () => {
      mockState.properties.push({ id: 'p1', name: 'a', designEntityId: 'e1', sortOrder: 'a0', parentId: null });

      const sig1 = service.propertiesOf('e1');
      service.evictCache('e1');
      const sig2 = service.propertiesOf('e1');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('update (keyValue cascade catch)', () => {
    it('MUST rollback on cascade mutations failure', async () => {
      mockState.properties.push(
        {
          id: 'p1',
          name: 'config',
          designEntityId: 'e1',
          propertyType: 'keyValue',
          sortOrder: 'a0',
          parentId: null
        },
        { id: 'c1', name: 'host', designEntityId: 'e1', sortOrder: 'a0', parentId: 'p1' }
      );
      mockState.mutationsSpy.mockRejectedValueOnce(new Error('tx failed'));

      await expect(service.update('p1', { propertyType: 'string' })).rejects.toThrow('tx failed');

      expect(mockState.properties[0]['propertyType']).toBe('keyValue');
    });
  });

  describe('remove', () => {
    it('MUST throw when property not found', async () => {
      await expect(service.remove('nonexistent')).rejects.toThrow('not found');
    });

    it('MUST call mutations with property in remove map', async () => {
      const prop = { id: 'p1', name: 'x', designEntityId: 'e1', sortOrder: 'a0' };
      mockState.properties.push(prop);

      await service.remove('p1');

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];
      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'p1' }));
    });

    it('MUST delete index when its only property is removed', async () => {
      const prop = { id: 'p1', name: 'x', designEntityId: 'e1', sortOrder: 'a0' };
      const idx = { id: 'idx1', propertyIds: ['p1'], designEntityId: 'e1', isUnique: false };
      mockState.properties.push(prop);
      mockState.indexes.push(idx);

      await service.remove('p1');

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];
      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'p1' }));
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'idx1' }));
    });

    it('MUST update index propertyIds when property is removed but others remain', async () => {
      const prop = { id: 'p1', name: 'x', designEntityId: 'e1', sortOrder: 'a0' };
      const idx = { id: 'idx1', propertyIds: ['p1', 'p2'], designEntityId: 'e1', isUnique: false, sortOrder: 'a0' };
      mockState.properties.push(prop);
      mockState.indexes.push(idx);

      await service.remove('p1');

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];

      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'p1' }));

      const allUpdated = [...arg.update.values()].flatMap((s: Set<Record<string, unknown>>) => [...s]);
      const updatedIdx = allUpdated.find(i => i['id'] === 'idx1') as Record<string, unknown>;
      expect(updatedIdx).toBeDefined();
      expect(updatedIdx['propertyIds']).toEqual(['p2']);
    });

    it('MUST handle mixed: some indexes removed, some updated, in one mutations call', async () => {
      const prop = { id: 'p1', name: 'x', designEntityId: 'e1', sortOrder: 'a0' };
      const idxToRemove = { id: 'idx1', propertyIds: ['p1'], designEntityId: 'e1', isUnique: false, sortOrder: 'a0' };
      const idxToUpdate = {
        id: 'idx2',
        propertyIds: ['p1', 'p2'],
        designEntityId: 'e1',
        isUnique: true,
        sortOrder: 'a1'
      };
      const idxUnrelated = { id: 'idx3', propertyIds: ['p3'], designEntityId: 'e1', isUnique: false, sortOrder: 'a2' };
      mockState.properties.push(prop);
      mockState.indexes.push(idxToRemove, idxToUpdate, idxUnrelated);

      await service.remove('p1');

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];

      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'p1' }));
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'idx1' }));
      expect(allRemoved).not.toContainEqual(expect.objectContaining({ id: 'idx3' }));

      const allUpdated = [...arg.update.values()].flatMap((s: Set<Record<string, unknown>>) => [...s]);
      const updatedIdx = allUpdated.find(i => i['id'] === 'idx2') as Record<string, unknown>;
      expect(updatedIdx).toBeDefined();
      expect(updatedIdx['propertyIds']).toEqual(['p2']);
    });

    it('MUST not touch indexes that do not reference the property', async () => {
      const prop = { id: 'p1', name: 'x', designEntityId: 'e1', sortOrder: 'a0' };
      const idx = { id: 'idx1', propertyIds: ['p2', 'p3'], designEntityId: 'e1', isUnique: false };
      mockState.properties.push(prop);
      mockState.indexes.push(idx);

      await service.remove('p1');

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];
      expect(arg.update.size).toBe(0);
      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).not.toContainEqual(expect.objectContaining({ id: 'idx1' }));
    });

    it('MUST cascade delete child properties when removing keyValue parent', async () => {
      const parent = {
        id: 'p1',
        name: 'config',
        designEntityId: 'e1',
        propertyType: 'keyValue',
        sortOrder: 'a0',
        parentId: null
      };
      const child1 = {
        id: 'c1',
        name: 'host',
        designEntityId: 'e1',
        sortOrder: 'a0',
        parentId: 'p1'
      };
      const child2 = {
        id: 'c2',
        name: 'port',
        designEntityId: 'e1',
        sortOrder: 'a1',
        parentId: 'p1'
      };
      mockState.properties.push(parent, child1, child2);

      await service.remove('p1');

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];
      const allRemoved = [...arg.remove.values()].flatMap((s: Set<unknown>) => [...s]);
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'p1' }));
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'c1' }));
      expect(allRemoved).toContainEqual(expect.objectContaining({ id: 'c2' }));
    });
  });

  describe('reorder', () => {
    it('MUST update sortOrder for each id', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push(
        { id: 'p1', name: 'a', designEntityId: 'e1', sortOrder: 'a0', save: saveSpy },
        { id: 'p2', name: 'b', designEntityId: 'e1', sortOrder: 'a1', save: saveSpy },
        { id: 'p3', name: 'c', designEntityId: 'e1', sortOrder: 'a2', save: saveSpy }
      );

      await service.reorder(['p3', 'p1', 'p2']);
      expect(mockState.properties.find(p => p['id'] === 'p1')?.['sortOrder']).toBe('a1');
      expect(mockState.properties.find(p => p['id'] === 'p2')?.['sortOrder']).toBe('a2');
      expect(mockState.properties.find(p => p['id'] === 'p3')?.['sortOrder']).toBe('a0');
    });

    it('MUST skip save when sortOrder unchanged', async () => {
      const saveSpy = vi.fn();
      mockState.properties.push(
        { id: 'p1', name: 'a', designEntityId: 'e1', sortOrder: 'a0', save: saveSpy },
        { id: 'p2', name: 'b', designEntityId: 'e1', sortOrder: 'a1', save: saveSpy }
      );

      await service.reorder(['p1', 'p2']);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
