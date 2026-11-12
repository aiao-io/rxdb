vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  entities: [] as Array<Record<string, unknown>>
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
      const idx = mockState.entities.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.entities[idx], this);
      else mockState.entities.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.entities.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.entities.splice(idx, 1);
    }
  },
  TreeAdjacencyListEntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      const idx = mockState.entities.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) Object.assign(mockState.entities[idx], this);
      else mockState.entities.push(this as Record<string, unknown>);
    }
    async remove() {
      const idx = mockState.entities.findIndex(e => e['id'] === this['id']);
      if (idx >= 0) mockState.entities.splice(idx, 1);
    }
  },
  PropertyType: { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: () => mockState.entities })
}));

import { RxDB } from '@aiao/rxdb';
import { DesignEntityService, resolveInitialNodePosition } from '../../services/design-entity.service';
import { DesignIndexService } from '../../services/design-index.service';
import { DesignPropertyService } from '../../services/design-property.service';
import { DesignRelationService } from '../../services/design-relation.service';
import { ModelDesignService } from '../../services/model-design.service';
import { ModelValidatorService } from '../../services/model-validator.service';

describe('DesignEntityService', () => {
  let service: DesignEntityService;
  let activeDesignIdSignal: WritableSignal<string | null>;
  let mockRelationService: {
    findByTargetEntity: ReturnType<typeof vi.fn>;
    removeByTargetEntity: ReturnType<typeof vi.fn>;
    evictCache: ReturnType<typeof vi.fn>;
  };
  let mockMutations: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockState.entities.length = 0;
    activeDesignIdSignal = signal<string | null>('design-1');
    mockMutations = vi.fn().mockResolvedValue([]);
    mockRelationService = {
      findByTargetEntity: vi.fn().mockReturnValue([]),
      removeByTargetEntity: vi.fn().mockResolvedValue(undefined),
      evictCache: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        DesignEntityService,
        ModelValidatorService,
        { provide: RxDB, useValue: { entityManager: { mutations: mockMutations } } },
        { provide: DesignRelationService, useValue: mockRelationService },
        { provide: DesignPropertyService, useValue: { evictCache: vi.fn() } },
        { provide: DesignIndexService, useValue: { evictCache: vi.fn() } },
        {
          provide: ModelDesignService,
          useValue: {
            activeDesignId: activeDesignIdSignal,
            activeDesign: () => (activeDesignIdSignal() ? { id: activeDesignIdSignal() } : null)
          }
        }
      ]
    });

    service = TestBed.inject(DesignEntityService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('MUST be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('MUST generate default name "NewEntity" when no name provided', async () => {
      const entity = await service.create();
      expect(entity.name).toBe('NewEntity');
    });

    it('MUST auto-increment name when "NewEntity" exists', async () => {
      mockState.entities.push({ id: 'e1', name: 'NewEntity', modelDesignId: 'design-1', sortOrder: 'a0' });
      const entity = await service.create();
      expect(entity.name).toBe('NewEntity2');
    });

    it('MUST auto-increment to "NewEntity3" when NewEntity and NewEntity2 exist', async () => {
      mockState.entities.push(
        { id: 'e1', name: 'NewEntity', modelDesignId: 'design-1', sortOrder: 'a0' },
        { id: 'e2', name: 'NewEntity2', modelDesignId: 'design-1', sortOrder: 'a1' }
      );
      const entity = await service.create();
      expect(entity.name).toBe('NewEntity3');
    });

    it('MUST use provided name when specified', async () => {
      const entity = await service.create('UserProfile');
      expect(entity.name).toBe('UserProfile');
    });

    it('MUST set correct modelDesignId', async () => {
      const entity = await service.create('Test');
      expect(entity.modelDesignId).toBe('design-1');
    });

    it('MUST throw when no active design', async () => {
      activeDesignIdSignal.set(null);
      await expect(service.create()).rejects.toThrow('No active model design');
    });

    it('MUST set sortOrder based on current entity count', async () => {
      mockState.entities.push(
        { id: 'e1', name: 'A', modelDesignId: 'design-1', sortOrder: 'a0' },
        { id: 'e2', name: 'B', modelDesignId: 'design-1', sortOrder: 'a1' }
      );
      const entity = await service.create('C');
      expect(entity.sortOrder).toBe('a2');
    });

    it('MUST set node position based on entity count', async () => {
      // ⚠️ 此前这条断言复刻了旧的对角线公式 `(n % 5) * 40`，把一个真实缺陷钉死了：
      // 取模让第 6 个实体与第 1 个坐标完全相同（US-220 AC#1「5+ 实体」正踩中）。
      // 现在改由 `resolveInitialNodePosition` 做二维网格排布，
      // 不重叠性的完整回归见 `services/design-entity-position.spec.ts`。
      mockState.entities.push({ id: 'e1', name: 'A', modelDesignId: 'design-1', sortOrder: 'a0' });
      const entity = await service.create('B');
      const expected = resolveInitialNodePosition(1);
      expect(entity.nodeX).toBe(expected.nodeX);
      expect(entity.nodeY).toBe(expected.nodeY);
    });
  });

  describe('update', () => {
    it('MUST assign changes and save', async () => {
      const saveSpy = vi.fn();
      mockState.entities.push({ id: 'e1', name: 'OldName', modelDesignId: 'design-1', sortOrder: 'a0', save: saveSpy });

      await service.update('e1', { name: 'NewName', displayName: 'New Display' });
      expect(mockState.entities[0]['name']).toBe('NewName');
      expect(mockState.entities[0]['displayName']).toBe('New Display');
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST throw when entity not found', async () => {
      await expect(service.update('nonexistent', { name: 'Foo' })).rejects.toThrow('not found');
    });

    it('MUST reject a duplicate entity name before persistence', async () => {
      mockState.entities.push(
        { id: 'e1', name: 'User', modelDesignId: 'design-1', save: vi.fn() },
        { id: 'e2', name: 'Order', modelDesignId: 'design-1', save: vi.fn() }
      );

      await expect(service.update('e2', { name: 'User' })).rejects.toThrow('validation.entityNameAlreadyExists');
      expect(mockState.entities[1]['name']).toBe('Order');
    });

    it('MUST reject a duplicate resolved SQL table name before persistence', async () => {
      mockState.entities.push(
        { id: 'e1', name: 'UserProfile', modelDesignId: 'design-1', save: vi.fn() },
        { id: 'e2', name: 'Order', modelDesignId: 'design-1', save: vi.fn() }
      );

      await expect(service.update('e2', { tableName: 'user_profile' })).rejects.toThrow(
        'validation.tableNameAlreadyExists'
      );
      expect(mockState.entities[1]['tableName']).toBeUndefined();
    });
  });

  describe('updatePosition', () => {
    it('MUST update nodeX and nodeY', async () => {
      const saveSpy = vi.fn();
      mockState.entities.push({ id: 'e1', name: 'A', modelDesignId: 'design-1', nodeX: 0, nodeY: 0, save: saveSpy });

      await service.updatePosition('e1', 500, 300);
      expect(mockState.entities[0]['nodeX']).toBe(500);
      expect(mockState.entities[0]['nodeY']).toBe(300);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST throw for nonexistent entity', async () => {
      await expect(service.updatePosition('nope', 0, 0)).rejects.toThrow('not found');
    });
  });

  describe('selectOne / toggleSelect / selectMany / clearSelection', () => {
    it('MUST selectOne sets a single id', () => {
      service.selectOne('e1');
      expect(service.selectedEntityIds()).toEqual(new Set(['e1']));
    });

    it('MUST toggleSelect add unselected id', () => {
      service.selectOne('e1');
      service.toggleSelect('e2');
      expect(service.selectedEntityIds()).toEqual(new Set(['e1', 'e2']));
    });

    it('MUST toggleSelect remove already selected id', () => {
      service.selectOne('e1');
      service.toggleSelect('e1');
      expect(service.selectedEntityIds().size).toBe(0);
    });

    it('MUST selectMany set multiple ids', () => {
      service.selectMany(['e1', 'e2', 'e3']);
      expect(service.selectedEntityIds()).toEqual(new Set(['e1', 'e2', 'e3']));
    });

    it('MUST clearSelection empty the set', () => {
      service.selectMany(['e1', 'e2']);
      service.clearSelection();
      expect(service.selectedEntityIds().size).toBe(0);
    });
  });

  describe('updatePositionsBatch', () => {
    it('MUST do nothing for empty array', async () => {
      await service.updatePositionsBatch([]);
      // No saves should happen
      expect(mockState.entities).toHaveLength(0);
    });

    it('MUST update all entity positions in a single mutations call', async () => {
      const saveSpy1 = vi.fn();
      const saveSpy2 = vi.fn();
      mockState.entities.push(
        { id: 'e1', name: 'A', modelDesignId: 'design-1', nodeX: 0, nodeY: 0, sortOrder: 'a0', save: saveSpy1 },
        { id: 'e2', name: 'B', modelDesignId: 'design-1', nodeX: 0, nodeY: 0, sortOrder: 'a1', save: saveSpy2 }
      );

      await service.updatePositionsBatch([
        { id: 'e1', x: 100, y: 200 },
        { id: 'e2', x: 300, y: 400 }
      ]);

      expect(mockState.entities[0]['nodeX']).toBe(100);
      expect(mockState.entities[0]['nodeY']).toBe(200);
      expect(mockState.entities[1]['nodeX']).toBe(300);
      expect(mockState.entities[1]['nodeY']).toBe(400);
      expect(saveSpy1).not.toHaveBeenCalled();
      expect(saveSpy2).not.toHaveBeenCalled();
      expect(mockMutations).toHaveBeenCalledOnce();

      const arg = mockMutations.mock.calls[0][0];
      const updates = [...arg.update.values()][0] as Set<unknown> | undefined;
      expect(arg.create.size).toBe(0);
      expect(arg.remove.size).toBe(0);
      expect(arg.update.size).toBe(1);
      expect(updates?.size).toBe(2);
    });

    it('MUST throw when entity not found', async () => {
      mockState.entities.push({
        id: 'e1',
        name: 'A',
        modelDesignId: 'design-1',
        nodeX: 0,
        nodeY: 0,
        sortOrder: 'a0',
        save: vi.fn()
      });

      await expect(
        service.updatePositionsBatch([
          { id: 'e1', x: 100, y: 100 },
          { id: 'nonexistent', x: 0, y: 0 }
        ])
      ).rejects.toThrow('not found');
    });
  });

  describe('updateWidth', () => {
    it('MUST update nodeWidth', async () => {
      const saveSpy = vi.fn();
      mockState.entities.push({ id: 'e1', name: 'A', modelDesignId: 'design-1', nodeWidth: 240, save: saveSpy });

      await service.updateWidth('e1', 320);
      expect(mockState.entities[0]['nodeWidth']).toBe(320);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('MUST throw when entity not found', async () => {
      await expect(service.updateWidth('nonexistent', 320)).rejects.toThrow('not found');
    });
  });

  describe('removeMany', () => {
    it('MUST do nothing for empty array', async () => {
      await service.removeMany([]);
      expect(mockMutations).not.toHaveBeenCalled();
    });

    it('MUST remove multiple entities in single mutations call', async () => {
      mockState.entities.push(
        { id: 'e1', name: 'A', modelDesignId: 'design-1', sortOrder: 'a0' },
        { id: 'e2', name: 'B', modelDesignId: 'design-1', sortOrder: 'a1' }
      );

      await service.removeMany(['e1', 'e2']);
      expect(mockMutations).toHaveBeenCalledOnce();
    });

    it('MUST throw when any entity not found', async () => {
      mockState.entities.push({ id: 'e1', name: 'A', modelDesignId: 'design-1', sortOrder: 'a0' });
      await expect(service.removeMany(['e1', 'nonexistent'])).rejects.toThrow('not found');
    });
  });

  describe('update', () => {
    it('MUST call mutations to batch delete entity and target relations', async () => {
      const entity = { id: 'e1', name: 'A', modelDesignId: 'design-1' };
      mockState.entities.push(entity);

      await service.remove('e1');
      expect(mockMutations).toHaveBeenCalledTimes(1);
      const arg = mockMutations.mock.calls[0][0];
      expect(arg.remove.size).toBeGreaterThanOrEqual(1);
    });

    it('MUST include target relations in batch delete', async () => {
      const entity = { id: 'e1', name: 'User', modelDesignId: 'design-1' };
      const targetRel = { id: 'r1', designEntityId: 'e2', mappedEntityId: 'e1', name: 'user' };
      mockState.entities.push(entity);
      mockRelationService.findByTargetEntity.mockReturnValue([targetRel]);

      await service.remove('e1');
      const arg = mockMutations.mock.calls[0][0];
      expect(arg.remove.size).toBe(2);
    });

    it('MUST clear selectedEntityIds when removing selected', async () => {
      const entity = { id: 'e1', name: 'A', modelDesignId: 'design-1' };
      mockState.entities.push(entity);
      service.selectOne('e1');

      await service.remove('e1');
      expect(service.selectedEntityIds().size).toBe(0);
    });

    it('MUST throw when entity not found', async () => {
      await expect(service.remove('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('reorder', () => {
    it('MUST update sortOrder for each id', async () => {
      const saveSpy = vi.fn();
      mockState.entities.push(
        { id: 'e1', name: 'A', modelDesignId: 'design-1', sortOrder: 'a0', save: saveSpy },
        { id: 'e2', name: 'B', modelDesignId: 'design-1', sortOrder: 'a1', save: saveSpy },
        { id: 'e3', name: 'C', modelDesignId: 'design-1', sortOrder: 'a2', save: saveSpy }
      );

      await service.reorder(['e3', 'e1', 'e2']);
      expect(mockState.entities.find(e => e['id'] === 'e1')?.['sortOrder']).toBe('a1');
      expect(mockState.entities.find(e => e['id'] === 'e2')?.['sortOrder']).toBe('a2');
      expect(mockState.entities.find(e => e['id'] === 'e3')?.['sortOrder']).toBe('a0');
    });

    it('MUST skip save when sortOrder unchanged', async () => {
      const saveSpy = vi.fn();
      mockState.entities.push(
        { id: 'e1', name: 'A', modelDesignId: 'design-1', sortOrder: 'a0', save: saveSpy },
        { id: 'e2', name: 'B', modelDesignId: 'design-1', sortOrder: 'a1', save: saveSpy }
      );

      await service.reorder(['e1', 'e2']);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
});
