vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** mock 下的实体实例就是普通记录对象 */
type MutationRecord = Record<string, unknown>;

/** entityManager.mutations 的入参形状 */
type MutationsArg = {
  create: Map<unknown, Set<MutationRecord>>;
  update: Map<unknown, Set<MutationRecord>>;
  remove: Map<unknown, Set<MutationRecord>>;
};

const mockState = vi.hoisted(() => ({
  relations: [] as Array<Record<string, unknown>>,
  entities: [] as Array<Record<string, unknown>>,
  mutationsSpy: vi.fn<(options: MutationsArg) => Promise<unknown[]>>()
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
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      const idx = mockState.relations.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.relations[idx], this);
      else mockState.relations.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.relations.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.relations.splice(idx, 1);
    }
  },
  TreeAdjacencyListEntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      const idx = mockState.relations.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.relations[idx], this);
      else mockState.relations.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.relations.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.relations.splice(idx, 1);
    }
  },
  PropertyType: { string: 'string' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: () => mockState.relations })
}));

import { RxDB } from '@aiao/rxdb';
import { DesignEntityService } from '../../services/design-entity.service';
import { DesignRelationService } from '../../services/design-relation.service';

/** 实体 ID fixture：服务签名要求 UUID，测试数据必须是真实 UUID 形状 */
const E1 = '00000000-0000-4000-8000-000000000001';
const E2 = '00000000-0000-4000-8000-000000000002';
const E3 = '00000000-0000-4000-8000-000000000003';
const E4 = '00000000-0000-4000-8000-000000000004';
const E5 = '00000000-0000-4000-8000-000000000005';
const E_ORPHAN = '00000000-0000-4000-8000-000000000099';
const E_ORPHAN_TARGET = '00000000-0000-4000-8000-000000000100';
const E_MISSING = '00000000-0000-4000-8000-0000000000ff';

describe('DesignRelationService', () => {
  let service: DesignRelationService;

  beforeEach(() => {
    mockState.relations.length = 0;
    mockState.entities.length = 0;
    mockState.mutationsSpy.mockReset();

    TestBed.configureTestingModule({
      providers: [
        DesignRelationService,
        {
          provide: RxDB,
          useValue: { entityManager: { mutations: mockState.mutationsSpy } }
        },
        {
          provide: DesignEntityService,
          useValue: {
            entities: () => mockState.entities
          }
        }
      ]
    });

    service = TestBed.inject(DesignRelationService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('MUST be defined', () => {
    expect(service).toBeDefined();
  });

  describe('allRelations', () => {
    it('MUST filter to relations for current entities', () => {
      mockState.entities.push({ id: E1, name: 'User' });
      mockState.relations.push(
        {
          id: 'r1',
          designEntityId: E1,
          name: 'posts',
          relationKind: 'ONE_TO_MANY',
          mappedEntityId: E2,
          sortOrder: 'a0'
        },
        {
          id: 'r2',
          designEntityId: E_ORPHAN,
          name: 'orphan',
          relationKind: 'ONE_TO_MANY',
          mappedEntityId: E_ORPHAN_TARGET,
          sortOrder: 'a0'
        }
      );

      const result = service.allRelations();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('posts');
    });
  });

  describe('relationsOf', () => {
    it('MUST return relations for specific entity', () => {
      mockState.relations.push(
        {
          id: 'r1',
          designEntityId: E1,
          name: 'a',
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: E3,
          sortOrder: 'a1'
        },
        {
          id: 'r2',
          designEntityId: E1,
          name: 'b',
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: E4,
          sortOrder: 'a0'
        },
        {
          id: 'r3',
          designEntityId: E2,
          name: 'c',
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: E5,
          sortOrder: 'a0'
        }
      );

      const result = service.relationsOf(E1)();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('b');
      expect(result[1].name).toBe('a');
    });
  });

  describe('create', () => {
    it('MUST create relation with auto-generated name', async () => {
      mockState.entities.push({ id: E1, name: 'User' }, { id: E2, name: 'Post' });
      const rel = await service.create(E1, E2, 'MANY_TO_ONE');
      expect(rel.name).toBe('post');
      expect(rel.mappedEntityId).toBe(E2);
      expect(rel.relationKind).toBe('MANY_TO_ONE');
    });

    it('MUST NOT create inverse relation', async () => {
      mockState.entities.push({ id: E1, name: 'User' }, { id: E2, name: 'Post' });
      await service.create(E1, E2, 'ONE_TO_MANY');
      const e2Rels = mockState.relations.filter(r => r['designEntityId'] === E2);
      expect(e2Rels).toHaveLength(0);
    });

    it('MUST set sortOrder based on existing count', async () => {
      mockState.entities.push({ id: E1, name: 'User' }, { id: E3, name: 'Tag' });
      mockState.relations.push({ id: 'r1', designEntityId: E1, name: 'a', sortOrder: 'a0' });
      const rel = await service.create(E1, E3, 'ONE_TO_MANY');
      expect(rel.sortOrder).toBe('a1');
    });

    it('MUST allow creating draft relation without target entity', async () => {
      mockState.entities.push({ id: E1, name: 'User' });
      const rel = await service.create(E1, null, 'ONE_TO_MANY');
      expect(rel.name).toBe('newRelation');
      expect(rel.mappedEntityId).toBeNull();
    });
  });

  describe('createLinkedPair', () => {
    it('MUST create bidirectional pair with inverse kind and mappedPropertyId', async () => {
      mockState.entities.push({ id: E1, name: 'Post' }, { id: E2, name: 'User' });

      const { source, inverse } = await service.createLinkedPair(E1, E2, 'MANY_TO_ONE');

      expect(source.designEntityId).toBe(E1);
      expect(source.mappedEntityId).toBe(E2);
      expect(source.relationKind).toBe('MANY_TO_ONE');
      expect(inverse.designEntityId).toBe(E2);
      expect(inverse.mappedEntityId).toBe(E1);
      expect(inverse.relationKind).toBe('ONE_TO_MANY');
      expect(source.mappedPropertyId).toBe(inverse.id);
      expect(inverse.mappedPropertyId).toBe(source.id);
    });

    it('MUST reject self-relation pair', async () => {
      mockState.entities.push({ id: E1, name: 'User' });
      await expect(service.createLinkedPair(E1, E1, 'ONE_TO_ONE')).rejects.toThrow('same entity');
    });

    it('MUST throw when source entity missing', async () => {
      mockState.entities.push({ id: E2, name: 'Post' });
      await expect(service.createLinkedPair(E_MISSING, E2, 'MANY_TO_ONE')).rejects.toThrow('Source entity not found');
    });
  });

  describe('update', () => {
    it('MUST assign changes and save', async () => {
      const saveSpy = vi.fn();
      mockState.relations.push({
        id: 'r1',
        designEntityId: E1,
        name: 'old',
        relationKind: 'MANY_TO_ONE',
        mappedEntityId: E2,
        save: saveSpy,
        sortOrder: 'a0'
      });

      await service.update('r1', { name: 'renamed' });
      expect(mockState.relations[0]['name']).toBe('renamed');
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST throw when not found', async () => {
      await expect(service.update('nope', { name: 'x' })).rejects.toThrow('not found');
    });
  });

  describe('updateBatch', () => {
    it('MUST do nothing for empty array', async () => {
      await service.updateBatch([]);
      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });

    it('MUST batch update multiple relations', async () => {
      mockState.relations.push(
        {
          id: 'r1',
          designEntityId: E1,
          name: 'posts',
          relationKind: 'ONE_TO_MANY',
          mappedEntityId: E2,
          sortOrder: 'a0'
        },
        {
          id: 'r2',
          designEntityId: E1,
          name: 'profile',
          relationKind: 'ONE_TO_ONE',
          mappedEntityId: E3,
          sortOrder: 'a1'
        }
      );

      await service.updateBatch([
        { id: 'r1', changes: { name: 'articles' } },
        { id: 'r2', changes: { columnName: 'profile_id' } }
      ]);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      expect(mockState.relations[0]['name']).toBe('articles');
      expect(mockState.relations[1]['columnName']).toBe('profile_id');
    });

    it('MUST skip non-existent ids', async () => {
      mockState.relations.push({ id: 'r1', designEntityId: E1, name: 'posts', sortOrder: 'a0' });

      await service.updateBatch([
        { id: 'r1', changes: { name: 'articles' } },
        { id: 'nope', changes: { name: 'x' } }
      ]);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
    });

    it('MUST not call mutations when all ids nonexistent', async () => {
      await service.updateBatch([{ id: 'nope', changes: { name: 'x' } }]);
      expect(mockState.mutationsSpy).not.toHaveBeenCalled();
    });

    it('MUST rollback on mutations failure', async () => {
      mockState.relations.push({ id: 'r1', designEntityId: E1, name: 'posts', sortOrder: 'a0' });
      mockState.mutationsSpy.mockRejectedValueOnce(new Error('tx failed'));

      await expect(service.updateBatch([{ id: 'r1', changes: { name: 'articles' } }])).rejects.toThrow('tx failed');

      expect(mockState.relations[0]['name']).toBe('posts');
    });
  });

  describe('evictCache', () => {
    it('MUST clear cached signal for entityId', () => {
      mockState.relations.push({
        id: 'r1',
        designEntityId: E1,
        name: 'a',
        relationKind: 'MANY_TO_ONE',
        mappedEntityId: E2,
        sortOrder: 'a0'
      });

      const sig1 = service.relationsOf(E1);
      service.evictCache(E1);
      const sig2 = service.relationsOf(E1);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('remove', () => {
    it('MUST remove only the target relation', async () => {
      const removeSpy = vi.fn();
      const otherRemoveSpy = vi.fn();
      mockState.relations.push(
        {
          id: 'r1',
          designEntityId: E1,
          name: 'posts',
          relationKind: 'ONE_TO_MANY',
          mappedEntityId: E2,
          remove: removeSpy,
          sortOrder: 'a0'
        },
        {
          id: 'r2',
          designEntityId: E2,
          name: 'user',
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: E1,
          remove: otherRemoveSpy,
          sortOrder: 'a0'
        }
      );

      await service.remove('r1');
      expect(removeSpy).toHaveBeenCalled();
      expect(otherRemoveSpy).not.toHaveBeenCalled();
    });
  });

  describe('removeByTargetEntity', () => {
    it('MUST remove all relations targeting entity id', async () => {
      mockState.relations.push(
        { id: 'r1', designEntityId: E1, name: 'a', mappedEntityId: E3, sortOrder: 'a0' },
        { id: 'r2', designEntityId: E2, name: 'b', mappedEntityId: E3, sortOrder: 'a0' },
        { id: 'r3', designEntityId: E1, name: 'c', mappedEntityId: E4, sortOrder: 'a0' }
      );

      await service.removeByTargetEntity(E3);

      expect(mockState.mutationsSpy).toHaveBeenCalledOnce();
      const arg = mockState.mutationsSpy.mock.calls[0][0];
      const allRemoved = [...arg.remove.values()].flatMap(s => [...s]);
      expect(allRemoved).toHaveLength(2);
      expect(allRemoved.map(r => r['id'])).toContain('r1');
      expect(allRemoved.map(r => r['id'])).toContain('r2');
    });
  });
});
