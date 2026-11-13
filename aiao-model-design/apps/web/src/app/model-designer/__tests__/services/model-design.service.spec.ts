vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  designs: [] as Array<Record<string, unknown>>,
  entities: [] as Array<Record<string, unknown>>,
  properties: [] as Array<Record<string, unknown>>,
  relations: [] as Array<Record<string, unknown>>,
  indexes: [] as Array<Record<string, unknown>>
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
      const idx = mockState.designs.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.designs[idx], this);
      else mockState.designs.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.designs.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.designs.splice(idx, 1);
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
  useFindAll: (EntityClass: { name: string }) => {
    const stateKey = (
      {
        ModelDesign: 'designs',
        DesignEntity: 'entities',
        DesignProperty: 'properties',
        DesignRelation: 'relations',
        DesignIndex: 'indexes'
      } as const
    )[EntityClass.name as 'ModelDesign' | 'DesignEntity' | 'DesignProperty' | 'DesignRelation' | 'DesignIndex'];
    // ⚠️ 必须同时提供 hasValue：真实 useFindAll 返回的 value 是 lazy signal，
    // 首读拿的是 initialValue: []。copy 靠 hasValue 判断首帧是否到达，
    // 只 mock value 会让「复制出空设计」这类缺陷在单测里根本不可能暴露。
    return { value: () => mockState[stateKey ?? 'designs'], hasValue: () => true };
  }
}));

import { RxDB } from '@aiao/rxdb';
import { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import { ModelDesignService } from '../../services/model-design.service';

describe('ModelDesignService', () => {
  let service: ModelDesignService;
  let mockCreateEntityRef: ReturnType<typeof vi.fn>;
  let mockMutations: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockState.designs.length = 0;
    mockState.entities.length = 0;
    mockState.properties.length = 0;
    mockState.relations.length = 0;
    mockState.indexes.length = 0;

    mockCreateEntityRef = vi.fn((_EntityType: unknown, data: Record<string, unknown>) => data);
    mockMutations = vi.fn().mockResolvedValue([]);

    TestBed.configureTestingModule({
      providers: [
        ModelDesignService,
        {
          provide: RxDB,
          useValue: { entityManager: { createEntityRef: mockCreateEntityRef, mutations: mockMutations } }
        }
      ]
    });
    service = TestBed.inject(ModelDesignService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('create', () => {
    it('should create a design and set it active', async () => {
      const design = await service.create('TestModel');
      expect(design).toBeDefined();
      expect(design.id).toBeTruthy();
      expect(service.activeDesignId()).toBe(design.id);
      expect(mockState.designs).toHaveLength(1);
      expect(mockState.designs[0]['name']).toBe('TestModel');
    });

    it('should use provided namespace', async () => {
      await service.create('TestModel', 'custom');
      expect(mockState.designs[0]['namespace']).toBe('custom');
    });

    it('should default namespace to public', async () => {
      await service.create('TestModel');
      expect(mockState.designs[0]['namespace']).toBe('public');
    });
  });

  describe('load', () => {
    it('should set activeDesignId', () => {
      service.load('design-123');
      expect(service.activeDesignId()).toBe('design-123');
    });
  });

  describe('activeDesign', () => {
    it('should return null when no active id', () => {
      expect(service.activeDesign()).toBeNull();
    });

    it('should return null when id does not match', () => {
      service.load('nonexistent');
      expect(service.activeDesign()).toBeNull();
    });

    it('should return the matching design', async () => {
      await service.create('Test');
      const active = service.activeDesign();
      expect(active).toBeTruthy();
      expect(active?.['name']).toBe('Test');
    });
  });

  describe('update', () => {
    it('should update design properties', async () => {
      const design = await service.create('Original');
      await service.update(design.id, { name: 'Updated' });
      expect(mockState.designs[0]['name']).toBe('Updated');
    });

    it('should throw for non-existent design', async () => {
      await expect(service.update('bad-id', { name: 'x' })).rejects.toThrow('ModelDesign not found');
    });
  });

  describe('remove', () => {
    it('should remove the design', async () => {
      const design = await service.create('ToRemove');
      expect(mockState.designs).toHaveLength(1);
      await service.remove(design.id);
      expect(mockState.designs).toHaveLength(0);
    });

    it('should clear activeDesignId when removing the active design', async () => {
      const design = await service.create('Active');
      expect(service.activeDesignId()).toBe(design.id);
      await service.remove(design.id);
      expect(service.activeDesignId()).toBeNull();
    });

    it('should not clear activeDesignId when removing a non-active design', async () => {
      const d1 = await service.create('First');
      const d2 = await service.create('Second');
      expect(service.activeDesignId()).toBe(d2.id);
      await service.remove(d1.id);
      expect(service.activeDesignId()).toBe(d2.id);
    });

    it('should throw for non-existent design', async () => {
      await expect(service.remove('bad-id')).rejects.toThrow('ModelDesign not found');
    });
  });

  describe('copy', () => {
    beforeEach(() => {
      mockState.designs.push({ id: 'd1', name: 'Blog', namespace: 'public', description: null });
    });

    it('MUST create a new ModelDesign named "${source} 副本"', async () => {
      const copy = await service.copy('d1');
      expect(copy.name).toBe('Blog 副本');
      expect(copy.id).not.toBe('d1');
      expect(mockState.designs).toHaveLength(2);
    });

    it('MUST append numbered suffix when a copy already exists', async () => {
      mockState.designs.push({ id: 'd2', name: 'Blog 副本', namespace: 'public', description: null });
      const copy = await service.copy('d1');
      expect(copy.name).toBe('Blog 副本 (2)');
    });

    it('MUST NOT switch activeDesignId', async () => {
      service.load('d1');
      await service.copy('d1');
      expect(service.activeDesignId()).toBe('d1');
    });

    it('MUST clone entities/properties/relations/indexes with regenerated ids under the new design', async () => {
      mockState.entities.push({ id: 'e1', name: 'Post', modelDesignId: 'd1', sortOrder: 'a0' });
      mockState.properties.push({ id: 'p1', designEntityId: 'e1', name: 'title', parentId: null, sortOrder: 'a0' });
      mockState.relations.push({
        id: 'r1',
        designEntityId: 'e1',
        name: 'self',
        mappedEntityId: 'e1',
        mappedPropertyId: null,
        sortOrder: 'a0'
      });
      mockState.indexes.push({ id: 'i1', designEntityId: 'e1', propertyIds: ['p1'], sortOrder: 'a0' });

      const copy = await service.copy('d1');

      expect(mockMutations).toHaveBeenCalledOnce();
      const arg = mockMutations.mock.calls[0][0] as { create: Map<unknown, Set<Record<string, unknown>>> };
      const clonedEntities = [...(arg.create.get(DesignEntity) ?? [])];
      const clonedProperties = [...(arg.create.get(DesignProperty) ?? [])];
      const clonedRelations = [...(arg.create.get(DesignRelation) ?? [])];
      const clonedIndexes = [...(arg.create.get(DesignIndex) ?? [])];

      expect(clonedEntities).toHaveLength(1);
      expect(clonedEntities[0]['id']).not.toBe('e1');
      expect(clonedEntities[0]['modelDesignId']).toBe(copy.id);

      expect(clonedProperties).toHaveLength(1);
      expect(clonedProperties[0]['id']).not.toBe('p1');
      expect(clonedProperties[0]['designEntityId']).toBe(clonedEntities[0]['id']);

      expect(clonedRelations).toHaveLength(1);
      expect(clonedRelations[0]['designEntityId']).toBe(clonedEntities[0]['id']);
      expect(clonedRelations[0]['mappedEntityId']).toBe(clonedEntities[0]['id']);

      expect(clonedIndexes).toHaveLength(1);
      expect(clonedIndexes[0]['designEntityId']).toBe(clonedEntities[0]['id']);
      expect(clonedIndexes[0]['propertyIds']).toEqual([clonedProperties[0]['id']]);
    });

    it('MUST throw for non-existent source design', async () => {
      await expect(service.copy('missing')).rejects.toThrow('ModelDesign not found');
    });
  });

  describe('ensureDefaultDesign', () => {
    it('creates a default design named "schema" and activates it when none exists', async () => {
      const design = await service.ensureDefaultDesign();

      expect(design?.name).toBe('schema');
      expect(mockState.designs).toHaveLength(1);
      expect(service.activeDesignId()).toBe(design?.id);
    });

    it('does nothing when designs already exist', async () => {
      mockState.designs.push({ id: 'existing', name: 'Blog' });

      const design = await service.ensureDefaultDesign();

      expect(design).toBeNull();
      expect(mockState.designs).toHaveLength(1);
      expect(service.activeDesignId()).toBeNull();
    });

    it('dedupes concurrent calls into a single create', async () => {
      const [a, b] = await Promise.all([service.ensureDefaultDesign(), service.ensureDefaultDesign()]);

      expect(mockState.designs).toHaveLength(1);
      expect(a?.name).toBe('schema');
      expect(a?.id).toBe(b?.id);
    });
  });
});

describe('ModelDesignService providedIn root singleton (AC6: /model-designer 与 /er 路由共享)', () => {
  beforeEach(() => {
    mockState.designs.length = 0;

    TestBed.configureTestingModule({
      providers: [
        {
          provide: RxDB,
          useValue: { entityManager: { createEntityRef: vi.fn(), mutations: vi.fn().mockResolvedValue([]) } }
        }
      ]
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('MUST resolve to the same instance for independent injection points without an explicit provider (relies purely on providedIn: root)', () => {
    const instanceA = TestBed.inject(ModelDesignService);
    const instanceB = TestBed.inject(ModelDesignService);

    expect(instanceA).toBe(instanceB);
  });

  it('MUST reflect activeDesignId changes made via one injection point in another (cross-route state sharing)', () => {
    const fromModelDesignerRoute = TestBed.inject(ModelDesignService);
    const fromErRoute = TestBed.inject(ModelDesignService);

    fromModelDesignerRoute.load('design-shared');

    expect(fromErRoute.activeDesignId()).toBe('design-shared');
  });
});
