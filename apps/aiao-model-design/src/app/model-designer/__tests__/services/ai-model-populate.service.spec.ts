import { describe, expect, it, vi } from 'vitest';
import type { PopulateEntityManager } from '../../services/ai-model-populate.service';
import { AiModelPopulateService } from '../../services/ai-model-populate.service';
import type { DesignEntityService } from '../../services/design-entity.service';
import type { DesignIndexService } from '../../services/design-index.service';
import type { DesignPropertyService } from '../../services/design-property.service';
import type { DesignRelationService } from '../../services/design-relation.service';
import type { AiEntityContext } from '../../types/ai-schemas';

/** 信号中的已有实体行：字段取自 DesignEntity 中 populate 会读取的部分 */
interface ExistingEntityRow {
  id: string;
  name: string;
  displayName?: string | null;
  nodeX: number;
  nodeY: number;
  nodeWidth?: number;
  sortOrder: string;
}

/** 信号中的已有属性行：DesignProperty 的可读子集 */
interface ExistingPropertyRow {
  id: string;
  name: string;
  sortOrder: string;
}

/** 信号中的已有关系行：DesignRelation 的可读子集 */
interface ExistingRelationRow {
  id: string;
  name: string;
  mappedPropertyId?: string | null;
  sortOrder: string;
}

function expectDefined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  if (value === undefined) throw new Error('Expected value to be defined');
  return value;
}

describe('AiModelPopulateService', () => {
  function createMockEntityService(existingEntities: ExistingEntityRow[] = []) {
    let idCounter = 0;
    return {
      entities: vi.fn().mockReturnValue(existingEntities),
      create: vi.fn().mockImplementation((name: string) => {
        idCounter++;
        const entity = {
          id: `entity-${idCounter}`,
          name,
          displayName: null,
          nodeX: 100,
          nodeY: 100,
          sortOrder: 'a0',
          save: vi.fn().mockResolvedValue(undefined)
        };
        return Promise.resolve(entity);
      }),
      update: vi.fn().mockResolvedValue(undefined),
      findByName: vi.fn().mockResolvedValue(null),
      getAll: vi.fn().mockReturnValue(existingEntities)
    };
  }

  function createMockPropertyService(existingPropsMap: Record<string, ExistingPropertyRow[]> = {}) {
    let idCounter = 0;
    return {
      create: vi.fn().mockImplementation(() => {
        idCounter++;
        return Promise.resolve({ id: `prop-${idCounter}` });
      }),
      update: vi.fn<DesignPropertyService['update']>().mockResolvedValue(undefined),
      propertiesOf: vi.fn().mockImplementation((entityId: string) => {
        return () => existingPropsMap[entityId] ?? [];
      }),
      findByName: vi.fn().mockResolvedValue(null)
    };
  }

  function createMockRelationService(existingRelsMap: Record<string, ExistingRelationRow[]> = {}) {
    let idCounter = 0;
    return {
      create: vi.fn().mockImplementation(() => {
        idCounter++;
        return Promise.resolve({ id: `rel-${idCounter}` });
      }),
      update: vi.fn<DesignRelationService['update']>().mockResolvedValue(undefined),
      updateBatch: vi.fn<DesignRelationService['updateBatch']>().mockResolvedValue(undefined),
      relationsOf: vi.fn().mockImplementation((entityId: string) => {
        return () => existingRelsMap[entityId] ?? [];
      })
    };
  }

  function createMockIndexService() {
    return {
      create: vi.fn().mockResolvedValue({ id: 'idx-1' }),
      indexesOf: vi.fn().mockImplementation(() => {
        return () => [];
      })
    };
  }

  function createServiceWithMocks(
    entityService: unknown,
    propertyService: unknown,
    relationService: unknown,
    indexService: unknown,
    entityManager?: unknown
  ): AiModelPopulateService {
    return new AiModelPopulateService(
      entityService as DesignEntityService,
      propertyService as DesignPropertyService,
      relationService as DesignRelationService,
      indexService as DesignIndexService,
      entityManager as PopulateEntityManager | undefined
    );
  }

  function createService() {
    return createServiceWithMocks(
      createMockEntityService(),
      createMockPropertyService(),
      createMockRelationService(),
      createMockIndexService()
    );
  }

  describe('mapEntityToRxDB', () => {
    it('should map ModelGenerationOutput entity to RxDB entity params', () => {
      const service = createService();
      const entity = {
        name: 'User',
        displayName: '用户',
        properties: [
          { name: 'username', propertyType: 'string' as const, isRequired: true, isNullable: false, isUnique: true }
        ],
        relations: [],
        indexes: []
      };
      const result = service.mapEntityToRxDB(entity, 100, 100, 240);
      expect(result.name).toBe('User');
      expect(result.displayName).toBe('用户');
      expect(result.nodeX).toBe(100);
      expect(result.nodeY).toBe(100);
    });
  });

  describe('resolveEntityNameConflicts', () => {
    it('should append number suffix on conflict with existing entities', () => {
      const service = createService();
      const existing = ['User', 'Order'];
      const newNames = ['User', 'Product'];
      const resolved = service.resolveEntityNameConflicts(newNames, existing);
      expect(resolved[0]).toBe('User2');
      expect(resolved[1]).toBe('Product');
    });

    it('should handle batch-internal conflicts', () => {
      const service = createService();
      const existing: string[] = [];
      const newNames = ['User', 'User'];
      const resolved = service.resolveEntityNameConflicts(newNames, existing);
      expect(resolved[0]).toBe('User');
      expect(resolved[1]).toBe('User2');
    });

    it('should increment suffix when already taken', () => {
      const service = createService();
      const existing = ['User', 'User2'];
      const newNames = ['User'];
      const resolved = service.resolveEntityNameConflicts(newNames, existing);
      expect(resolved[0]).toBe('User3');
    });
  });

  describe('calculateLayout', () => {
    it('should place first entity at (100, 100) for empty canvas', () => {
      const service = createService();
      const positions = service.calculateLayout(3, []);
      expect(positions[0]).toEqual({ x: 100, y: 100 });
    });

    it('should offset from existing entities', () => {
      const service = createService();
      const existingEntities = [{ nodeX: 200, nodeY: 100, nodeWidth: 240 }];
      const positions = service.calculateLayout(1, existingEntities);
      // 新实体的 X 应在现有实体右侧
      expect(positions[0].x).toBeGreaterThan(200);
    });

    it('should arrange in grid: 3 per row', () => {
      const service = createService();
      const positions = service.calculateLayout(6, []);
      // 第一行 3 个, 第二行 3 个
      expect(positions[3].y).toBeGreaterThan(positions[0].y);
      expect(positions[0].y).toBe(positions[1].y);
    });
  });

  describe('filterIncompleteEntities', () => {
    it('should reject entities without name', () => {
      const service = createService();
      const entities = [
        { name: 'User', properties: [], relations: [], indexes: [] },
        { name: '', properties: [], relations: [], indexes: [] }
      ];
      const filtered = service.filterIncompleteEntities(entities as unknown as AiEntityContext[]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('User');
    });
  });

  describe('retainCompleteEntities', () => {
    it('should keep entities with name and properties array', () => {
      const service = createService();
      const entities = [
        { name: 'User', properties: [{ name: 'id', propertyType: 'uuid' }], relations: [], indexes: [] },
        { name: 'Order', properties: [{ name: 'total', propertyType: 'number' }] }
      ];
      const retained = service.retainCompleteEntities(entities as unknown as Partial<AiEntityContext>[]);
      expect(retained).toHaveLength(2);
      expect(retained[0].name).toBe('User');
      expect(retained[0].id).toBeDefined();
      expect(retained[1].relations).toEqual([]);
    });

    it('should discard entities without name', () => {
      const service = createService();
      const entities = [
        { name: 'User', properties: [] },
        { properties: [{ name: 'x' }] },
        { name: '', properties: [] }
      ];
      const retained = service.retainCompleteEntities(entities as unknown as Partial<AiEntityContext>[]);
      expect(retained).toHaveLength(1);
      expect(retained[0].name).toBe('User');
    });

    it('should discard entities without properties array', () => {
      const service = createService();
      const entities = [{ name: 'User', properties: [] }, { name: 'Partial' }];
      const retained = service.retainCompleteEntities(entities as unknown as Partial<AiEntityContext>[]);
      expect(retained).toHaveLength(1);
    });

    it('should return empty for all incomplete', () => {
      const service = createService();
      const entities = [{ name: '' }, {}];
      const retained = service.retainCompleteEntities(entities as unknown as Partial<AiEntityContext>[]);
      expect(retained).toHaveLength(0);
    });
  });

  describe('normalizePropertyType', () => {
    it('should pass through valid types unchanged', () => {
      const service = createService();
      expect(service.normalizePropertyType('string')).toBe('string');
      expect(service.normalizePropertyType('number')).toBe('number');
      expect(service.normalizePropertyType('uuid')).toBe('uuid');
      expect(service.normalizePropertyType('json')).toBe('json');
    });

    it('should map common non-standard types', () => {
      const service = createService();
      expect(service.normalizePropertyType('text')).toBe('string');
      expect(service.normalizePropertyType('varchar')).toBe('string');
      expect(service.normalizePropertyType('float')).toBe('number');
      expect(service.normalizePropertyType('double')).toBe('number');
      expect(service.normalizePropertyType('decimal')).toBe('number');
      expect(service.normalizePropertyType('bigint')).toBe('integer');
      expect(service.normalizePropertyType('timestamp')).toBe('date');
      expect(service.normalizePropertyType('datetime')).toBe('date');
      expect(service.normalizePropertyType('object')).toBe('json');
      expect(service.normalizePropertyType('bool')).toBe('boolean');
    });

    it('should fallback to string for unknown types', () => {
      const service = createService();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
      expect(service.normalizePropertyType('foobar')).toBe('string');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('foobar'));
      warnSpy.mockRestore();
    });

    it('should be case-insensitive', () => {
      const service = createService();
      expect(service.normalizePropertyType('String')).toBe('string');
      expect(service.normalizePropertyType('TEXT')).toBe('string');
      expect(service.normalizePropertyType('Boolean')).toBe('boolean');
    });
  });

  describe('normalizeEntityName', () => {
    it('should convert snake_case to PascalCase', () => {
      const service = createService();
      expect(service.normalizeEntityName('user_info')).toBe('UserInfo');
      expect(service.normalizeEntityName('order_detail_item')).toBe('OrderDetailItem');
    });

    it('should convert kebab-case to PascalCase', () => {
      const service = createService();
      expect(service.normalizeEntityName('order-detail')).toBe('OrderDetail');
    });

    it('should leave PascalCase unchanged', () => {
      const service = createService();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
      expect(service.normalizeEntityName('UserInfo')).toBe('UserInfo');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should capitalize first letter of camelCase', () => {
      const service = createService();
      expect(service.normalizeEntityName('userInfo')).toBe('UserInfo');
    });

    it('should warn when name was normalized', () => {
      const service = createService();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
      service.normalizeEntityName('user_info');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('user_info'));
      warnSpy.mockRestore();
    });
  });

  describe('populate', () => {
    it('should update existing entity by name instead of creating new', async () => {
      const existingEntities = [
        { id: 'existing-user', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user-1',
          name: 'User',
          displayName: '用户',
          properties: [
            { id: 'ai-p1', name: 'email', propertyType: 'string', isRequired: true, isNullable: false, isUnique: true }
          ],
          relations: [],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // 不应创建新实体
      expect(entityService.create).not.toHaveBeenCalled();
      // 应为已有实体创建属性
      expect(propertyService.create).toHaveBeenCalledWith('existing-user', 'email', 'string');
    });

    it('should create new entity when name does not match existing', async () => {
      const existingEntities = [
        { id: 'existing-user', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-addr-1',
          name: 'Address',
          displayName: '地址',
          properties: [
            {
              id: 'ai-p1',
              name: 'detail',
              propertyType: 'string',
              isRequired: true,
              isNullable: false,
              isUnique: false
            }
          ],
          relations: [],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // 应创建新实体
      expect(entityService.create).toHaveBeenCalledWith('Address');
    });

    it('should handle mixed update and create in same batch', async () => {
      const existingEntities = [
        { id: 'existing-user', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user-1',
          name: 'User',
          displayName: '用户更新',
          properties: [
            { id: 'ai-p1', name: 'email', propertyType: 'string', isRequired: true, isNullable: false, isUnique: true }
          ],
          relations: [
            {
              id: 'ai-r1',
              name: 'addresses',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'ai-addr-1',
              mappedPropertyId: 'ai-r2'
            }
          ],
          indexes: []
        },
        {
          id: 'ai-addr-1',
          name: 'Address',
          displayName: '地址',
          properties: [
            {
              id: 'ai-p2',
              name: 'detail',
              propertyType: 'string',
              isRequired: true,
              isNullable: false,
              isUnique: false
            }
          ],
          relations: [
            {
              id: 'ai-r2',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'ai-user-1',
              mappedPropertyId: 'ai-r1'
            }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // User 已存在不应创建，Address 是新的应创建
      expect(entityService.create).toHaveBeenCalledTimes(1);
      expect(entityService.create).toHaveBeenCalledWith('Address');
      // User 的 displayName 变了应更新
      expect(entityService.update).toHaveBeenCalledWith('existing-user', { displayName: '用户更新' });
    });

    it('should skip existing properties when updating entity', async () => {
      const existingEntities = [
        { id: 'existing-user', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService({
        'existing-user': [{ id: 'prop-existing', name: 'email', sortOrder: 'a0' }]
      });
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user-1',
          name: 'User',
          properties: [
            { id: 'ai-p1', name: 'email', propertyType: 'string', isRequired: true, isNullable: false, isUnique: true },
            { id: 'ai-p2', name: 'phone', propertyType: 'string', isRequired: false, isNullable: true, isUnique: false }
          ],
          relations: [],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // email 已存在应跳过，只创建 phone
      expect(propertyService.create).toHaveBeenCalledTimes(1);
      expect(propertyService.create).toHaveBeenCalledWith('existing-user', 'phone', 'string');
    });

    it('should skip existing relations when updating entity', async () => {
      const existingEntities = [
        { id: 'existing-user', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService({
        'existing-user': [{ id: 'rel-existing', name: 'addresses', mappedPropertyId: null, sortOrder: 'a0' }]
      });
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user-1',
          name: 'User',
          properties: [],
          relations: [
            { id: 'ai-r1', name: 'addresses', relationKind: 'ONE_TO_MANY', mappedEntityId: 'ai-addr-1' },
            { id: 'ai-r2', name: 'profile', relationKind: 'ONE_TO_ONE', mappedEntityId: 'ai-profile-1' }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // addresses 已存在应跳过，只创建 profile
      expect(relationService.create).toHaveBeenCalledTimes(1);
    });

    it('should link existing relations via AI UUID mappedPropertyId', async () => {
      // 场景：User/Order 已存在，上次创建了 orders/user 关系但未设 mappedPropertyId
      // AI 再次返回含 mappedPropertyId 的关系 → 应补链，不重复创建
      const existingEntities = [
        { id: 'user-id', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' },
        { id: 'order-id', name: 'Order', displayName: '订单', nodeX: 400, nodeY: 100, sortOrder: 'a1' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService({
        'user-id': [{ id: 'rel-orders', name: 'orders', mappedPropertyId: null, sortOrder: 'a0' }],
        'order-id': [{ id: 'rel-user', name: 'user', mappedPropertyId: null, sortOrder: 'a0' }]
      });
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user',
          name: 'User',
          properties: [],
          relations: [
            {
              id: 'ai-rel-orders',
              name: 'orders',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'ai-order',
              mappedPropertyId: 'ai-rel-user'
            }
          ],
          indexes: []
        },
        {
          id: 'ai-order',
          name: 'Order',
          properties: [],
          relations: [
            {
              id: 'ai-rel-user',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'ai-user',
              mappedPropertyId: 'ai-rel-orders'
            }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // 不应新建关系（两者都已存在）
      expect(relationService.create).not.toHaveBeenCalled();
      // 应补链：互设 mappedPropertyId（通过 idMap 映射 AI UUID → 真实 ID）
      expect(relationService.update).toHaveBeenCalledWith('rel-orders', { mappedPropertyId: 'rel-user' });
      expect(relationService.update).toHaveBeenCalledWith('rel-user', { mappedPropertyId: 'rel-orders' });
    });

    it('should not re-link existing relations that already have mappedPropertyId', async () => {
      const existingEntities = [
        { id: 'user-id', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' },
        { id: 'order-id', name: 'Order', displayName: '订单', nodeX: 400, nodeY: 100, sortOrder: 'a1' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService({
        'user-id': [{ id: 'rel-orders', name: 'orders', mappedPropertyId: 'rel-user', sortOrder: 'a0' }],
        'order-id': [{ id: 'rel-user', name: 'user', mappedPropertyId: 'rel-orders', sortOrder: 'a0' }]
      });
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user',
          name: 'User',
          properties: [],
          relations: [
            {
              id: 'ai-rel-orders',
              name: 'orders',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'ai-order',
              mappedPropertyId: 'ai-rel-user'
            }
          ],
          indexes: []
        },
        {
          id: 'ai-order',
          name: 'Order',
          properties: [],
          relations: [
            {
              id: 'ai-rel-user',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'ai-user',
              mappedPropertyId: 'ai-rel-orders'
            }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities);

      // 已正确链接，不应再次更新
      expect(relationService.create).not.toHaveBeenCalled();
      expect(relationService.update).not.toHaveBeenCalled();
    });

    it('should populate full AI output with displayName, relations, and indexes via UUID mapping', async () => {
      const entityService = createMockEntityService();
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      // 来自真实 AI 输出的完整数据
      const aiEntities: AiEntityContext[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'User',
          displayName: '用户',
          properties: [
            {
              id: '550e8400-e29b-41d4-a716-446655440002',
              name: 'name',
              propertyType: 'string',
              displayName: '姓名',
              isRequired: true,
              isNullable: false,
              isUnique: false
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440003',
              name: 'email',
              propertyType: 'string',
              displayName: '邮箱',
              isRequired: true,
              isNullable: false,
              isUnique: true
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440004',
              name: 'phone',
              propertyType: 'string',
              displayName: '手机号',
              isRequired: false,
              isNullable: true,
              isUnique: false
            }
          ],
          relations: [
            {
              id: '550e8400-e29b-41d4-a716-446655440006',
              name: 'orders',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: '550e8400-e29b-41d4-a716-446655440007',
              mappedPropertyId: '550e8400-e29b-41d4-a716-446655440011',
              onDeleteAction: 'CASCADE'
            }
          ],
          indexes: [
            {
              id: '550e8400-e29b-41d4-a716-446655440012',
              propertyIds: ['550e8400-e29b-41d4-a716-446655440003'],
              isUnique: true
            }
          ]
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440007',
          name: 'Order',
          displayName: '订单',
          properties: [
            {
              id: '550e8400-e29b-41d4-a716-446655440008',
              name: 'orderNumber',
              propertyType: 'string',
              displayName: '订单号',
              isRequired: true,
              isNullable: false,
              isUnique: true
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440009',
              name: 'totalAmount',
              propertyType: 'number',
              displayName: '总金额',
              isRequired: true,
              isNullable: false,
              isUnique: false
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440010',
              name: 'status',
              propertyType: 'enum',
              displayName: '状态',
              isRequired: true,
              isNullable: false,
              isUnique: false,
              defaultValue: 'PENDING',
              enumValues: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']
            }
          ],
          relations: [
            {
              id: '550e8400-e29b-41d4-a716-446655440011',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: '550e8400-e29b-41d4-a716-446655440001',
              mappedPropertyId: '550e8400-e29b-41d4-a716-446655440006',
              onDeleteAction: 'NO_ACTION'
            }
          ],
          indexes: [
            {
              id: '550e8400-e29b-41d4-a716-446655440013',
              propertyIds: ['550e8400-e29b-41d4-a716-446655440008'],
              isUnique: true
            }
          ]
        }
      ];

      await service.populate(aiEntities);

      // 应创建 2 个实体
      expect(entityService.create).toHaveBeenCalledTimes(2);
      expect(entityService.create).toHaveBeenCalledWith('User');
      expect(entityService.create).toHaveBeenCalledWith('Order');

      // 应创建 6 个属性（User 3 + Order 3）
      expect(propertyService.create).toHaveBeenCalledTimes(6);

      // 应通过 update 设置 displayName
      const propUpdateCalls = propertyService.update.mock.calls;
      const displayNames = propUpdateCalls.map(c => c[1].displayName).filter(Boolean);
      expect(displayNames).toContain('姓名');
      expect(displayNames).toContain('邮箱');
      expect(displayNames).toContain('手机号');
      expect(displayNames).toContain('订单号');
      expect(displayNames).toContain('总金额');
      expect(displayNames).toContain('状态');

      // 应通过 update 设置 enum 属性的 defaultValue 和 enumValues
      const statusUpdate = propUpdateCalls.find(c => c[1].enumValues);
      const statusChanges = expectDefined(statusUpdate)[1];
      expect(statusChanges.defaultValue).toBe('PENDING');
      expect(statusChanges.enumValues).toEqual(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED']);

      // 应创建 2 个关系
      expect(relationService.create).toHaveBeenCalledTimes(2);

      // 应设置关系 name 和 onDeleteAction
      const relUpdateCalls = relationService.update.mock.calls;
      const relNames = relUpdateCalls.map(c => c[1].name).filter(Boolean);
      expect(relNames).toContain('orders');
      expect(relNames).toContain('user');

      // 应通过 mappedPropertyId UUID 映射互设逆关系
      const mappedPropertyIdCalls = relUpdateCalls.filter(c => c[1].mappedPropertyId);
      expect(mappedPropertyIdCalls).toHaveLength(2);

      // 应创建 2 个索引
      expect(indexService.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('populate with entityManager (createEntityRef path)', () => {
    function createMockEntityManager() {
      const refs: { type: unknown; data: Record<string, unknown> }[] = [];
      let mutationsCalled = false;
      let mutationsArg: unknown = null;

      return {
        createEntityRef: vi.fn().mockImplementation((_type: unknown, data: Record<string, unknown>) => {
          refs.push({ type: _type, data });
          return data; // 返回 data 自身作为 ref
        }),
        mutations: vi.fn().mockImplementation((arg: unknown) => {
          mutationsCalled = true;
          mutationsArg = arg;
          return Promise.resolve();
        }),
        get refs() {
          return refs;
        },
        get mutationsCalled() {
          return mutationsCalled;
        },
        get mutationsArg() {
          return mutationsArg;
        }
      };
    }

    it('should use createEntityRef for new entities with AI UUID as real ID', async () => {
      const entityService = createMockEntityService();
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createMockEntityManager();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-uuid-1',
          name: 'User',
          displayName: '用户',
          properties: [
            {
              id: 'ai-prop-1',
              name: 'email',
              propertyType: 'string',
              isRequired: true,
              isNullable: false,
              isUnique: true
            }
          ],
          relations: [],
          indexes: []
        }
      ];

      await service.populate(aiEntities, 'design-123');

      // 不走 service.create，走 createEntityRef
      expect(entityService.create).not.toHaveBeenCalled();
      expect(em.createEntityRef).toHaveBeenCalled();

      // 验证实体 ref 使用了 AI UUID
      const entityRef = em.createEntityRef.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['name'] === 'User'
      );
      const entityData = expectDefined(entityRef)[1] as Record<string, unknown>;
      expect(entityData['id']).toBe('ai-uuid-1');
      expect(entityData['displayName']).toBe('用户');
      expect(entityData['modelDesignId']).toBe('design-123');

      // 属性也使用 createEntityRef
      const propRef = em.createEntityRef.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['name'] === 'email'
      );
      const propertyData = expectDefined(propRef)[1] as Record<string, unknown>;
      expect(propertyData['id']).toBe('ai-prop-1');
      expect(propertyData['designEntityId']).toBe('ai-uuid-1');

      // 最终调用 mutations 批量持久化
      expect(em.mutations).toHaveBeenCalledTimes(1);
    });

    it('should create relations with correct mappedEntityId using AI UUID', async () => {
      const entityService = createMockEntityService();
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createMockEntityManager();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'entity-user',
          name: 'User',
          displayName: '用户',
          properties: [],
          relations: [
            {
              id: 'rel-orders',
              name: 'orders',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'entity-order',
              mappedPropertyId: 'rel-user',
              onDeleteAction: 'CASCADE'
            }
          ],
          indexes: []
        },
        {
          id: 'entity-order',
          name: 'Order',
          displayName: '订单',
          properties: [],
          relations: [
            {
              id: 'rel-user',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'entity-user',
              mappedPropertyId: 'rel-orders'
            }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities, 'design-123');

      // 不走 relationService.create
      expect(relationService.create).not.toHaveBeenCalled();

      // 查找关系 createEntityRef 调用
      const relCalls = em.createEntityRef.mock.calls.filter(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['relationKind'] !== undefined
      );
      expect(relCalls).toHaveLength(2);

      // User.orders → mappedEntityId 应为 entity-order（AI UUID = 真实 ID）
      const ordersRel = relCalls.find((c: unknown[]) => (c[1] as Record<string, unknown>)['name'] === 'orders');
      const ordersData = expectDefined(ordersRel)[1] as Record<string, unknown>;
      expect(ordersData['mappedEntityId']).toBe('entity-order');
      expect(ordersData['designEntityId']).toBe('entity-user');
      expect(ordersData['onDeleteAction']).toBe('CASCADE');
      // mappedPropertyId 应在 createEntityRef 时直接设置，无需 updateBatch
      expect(ordersData['mappedPropertyId']).toBe('rel-user');

      // Order.user → mappedEntityId 应为 entity-user
      const userRel = relCalls.find((c: unknown[]) => (c[1] as Record<string, unknown>)['name'] === 'user');
      const userData = expectDefined(userRel)[1] as Record<string, unknown>;
      expect(userData['mappedEntityId']).toBe('entity-user');
      expect(userData['mappedPropertyId']).toBe('rel-orders');

      // 新关系 mappedPropertyId 已在 createEntityRef 中设置，不应调用 updateBatch
      expect(relationService.updateBatch).not.toHaveBeenCalled();
    });

    it('should handle mixed existing and new entities with createEntityRef', async () => {
      const existingEntities = [
        { id: 'existing-user', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createMockEntityManager();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user',
          name: 'User',
          displayName: '用户更新',
          properties: [
            { id: 'ai-p1', name: 'email', propertyType: 'string', isRequired: true, isNullable: false, isUnique: true }
          ],
          relations: [
            {
              id: 'ai-r1',
              name: 'orders',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'ai-order',
              mappedPropertyId: 'ai-r2'
            }
          ],
          indexes: []
        },
        {
          id: 'ai-order',
          name: 'Order',
          displayName: '订单',
          properties: [
            { id: 'ai-p2', name: 'total', propertyType: 'number', isRequired: true, isNullable: false, isUnique: false }
          ],
          relations: [
            {
              id: 'ai-r2',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'ai-user',
              mappedPropertyId: 'ai-r1'
            }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities, 'design-123');

      // User 存在 → 不通过 createEntityRef 创建实体
      // Order 是新的 → 通过 createEntityRef 创建
      expect(entityService.update).toHaveBeenCalledWith('existing-user', { displayName: '用户更新' });

      // 实体只创建 Order
      const entityCalls = em.createEntityRef.mock.calls.filter(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['modelDesignId'] !== undefined
      );
      expect(entityCalls).toHaveLength(1);
      expect((entityCalls[0][1] as Record<string, unknown>)['name']).toBe('Order');

      // User.orders 的 mappedEntityId 应解析为 ai-order（新实体的 AI UUID = 真实 ID）
      const ordersRel = em.createEntityRef.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['name'] === 'orders'
      );
      const ordersData = expectDefined(ordersRel)[1] as Record<string, unknown>;
      expect(ordersData['mappedEntityId']).toBe('ai-order');
      expect(ordersData['designEntityId']).toBe('existing-user');
      // mappedPropertyId 在 createEntityRef 中直接设置
      expect(ordersData['mappedPropertyId']).toBe('ai-r2');

      // Order.user 的 mappedEntityId 应解析为 existing-user（通过 idMap 映射）
      const userRel = em.createEntityRef.mock.calls.find(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['name'] === 'user'
      );
      const userData = expectDefined(userRel)[1] as Record<string, unknown>;
      expect(userData['mappedEntityId']).toBe('existing-user');
      // mappedPropertyId 应解析为 existing-user 的已有关系 AI UUID ai-r1
      expect(userData['mappedPropertyId']).toBe('ai-r1');
    });

    it('should use updateBatch only for pre-existing relations needing mappedPropertyId', async () => {
      // 场景：User.orders / Order.user 已存在，但 mappedPropertyId 未设置，AI 再次下发补链
      const existingEntities = [
        { id: 'user-id', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' },
        { id: 'order-id', name: 'Order', displayName: '订单', nodeX: 400, nodeY: 100, sortOrder: 'a1' }
      ];
      const entityService = createMockEntityService(existingEntities);
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService({
        'user-id': [{ id: 'real-rel-orders', name: 'orders', mappedPropertyId: null, sortOrder: 'a0' }],
        'order-id': [{ id: 'real-rel-user', name: 'user', mappedPropertyId: null, sortOrder: 'a0' }]
      });
      const indexService = createMockIndexService();
      const em = createMockEntityManager();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'ai-user',
          name: 'User',
          properties: [],
          relations: [
            {
              id: 'ai-rel-orders',
              name: 'orders',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'ai-order',
              mappedPropertyId: 'ai-rel-user'
            }
          ],
          indexes: []
        },
        {
          id: 'ai-order',
          name: 'Order',
          properties: [],
          relations: [
            {
              id: 'ai-rel-user',
              name: 'user',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'ai-user',
              mappedPropertyId: 'ai-rel-orders'
            }
          ],
          indexes: []
        }
      ];

      await service.populate(aiEntities, 'design-123');

      // 不应创建新关系（两者已存在）
      expect(em.createEntityRef).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ relationKind: expect.anything() })
      );

      // 应通过 updateBatch 补链（已有关系通过 idMap 解析 mappedPropertyId）
      expect(relationService.updateBatch).toHaveBeenCalledTimes(1);
      const batchArg = relationService.updateBatch.mock.calls[0][0];
      expect(batchArg).toHaveLength(2);
      const ordersUpdate = batchArg.find(u => u.id === 'real-rel-orders');
      const userUpdate = batchArg.find(u => u.id === 'real-rel-user');
      expect(ordersUpdate?.changes.mappedPropertyId).toBe('real-rel-user');
      expect(userUpdate?.changes.mappedPropertyId).toBe('real-rel-orders');
    });

    it('should create indexes with resolved property IDs', async () => {
      const entityService = createMockEntityService();
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createMockEntityManager();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const aiEntities: AiEntityContext[] = [
        {
          id: 'entity-1',
          name: 'User',
          properties: [
            {
              id: 'prop-email',
              name: 'email',
              propertyType: 'string',
              isRequired: true,
              isNullable: false,
              isUnique: true
            }
          ],
          relations: [],
          indexes: [{ id: 'idx-1', propertyIds: ['prop-email'], isUnique: true }]
        }
      ];

      await service.populate(aiEntities, 'design-123');

      // 索引的 propertyIds 应为 AI UUID（新属性的 AI UUID = 真实 ID）
      const idxCalls = em.createEntityRef.mock.calls.filter(
        (c: unknown[]) => (c[1] as Record<string, unknown>)['propertyIds'] !== undefined
      );
      expect(idxCalls).toHaveLength(1);
      expect((idxCalls[0][1] as Record<string, unknown>)['propertyIds']).toEqual(['prop-email']);
      expect((idxCalls[0][1] as Record<string, unknown>)['designEntityId']).toBe('entity-1');
    });

    it('should fallback to legacy path when no entityManager', async () => {
      const entityService = createMockEntityService();
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      // 无 entityManager
      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService);

      const aiEntities: AiEntityContext[] = [{ id: 'ai-1', name: 'User', properties: [], relations: [], indexes: [] }];

      await service.populate(aiEntities, 'design-123');

      // 应走 legacy path，使用 entityService.create
      expect(entityService.create).toHaveBeenCalledWith('User');
    });
  });

  describe('two-phase populate (streaming: shell → properties)', () => {
    /**
     * 模拟流式生成的两步写入：
     * 1. onEntityProgress 触发 populate([shell])  → 空实体节点立即出现在画布
     * 2. onEntityComplete 触发 populate([full])   → 属性/关系/索引补入
     *
     * 验证两次 populate 的幂等性和正确组合结果。
     */

    function createEntityServiceWithState() {
      // 可变状态：模拟 RxDB signal 在 mutations 后更新
      let entities: {
        id: string;
        name: string;
        displayName?: string | null;
        nodeX: number;
        nodeY: number;
        sortOrder: string;
      }[] = [];
      return {
        entities: vi.fn().mockImplementation(() => entities),
        create: vi.fn().mockImplementation((name: string) => {
          const entity = {
            id: `entity-${name}`,
            name,
            displayName: null,
            nodeX: 100,
            nodeY: 100,
            sortOrder: 'a0',
            save: vi.fn().mockResolvedValue(undefined)
          };
          entities = [...entities, entity];
          return Promise.resolve(entity);
        }),
        update: vi.fn().mockResolvedValue(undefined),
        _state: () => entities
      };
    }

    function createEmWithState() {
      const createdEntities: Record<string, unknown>[] = [];
      const createdProperties: Record<string, unknown>[] = [];
      let mutationsCallCount = 0;
      return {
        createEntityRef: vi.fn().mockImplementation((_type: unknown, data: Record<string, unknown>) => {
          return data;
        }),
        mutations: vi
          .fn()
          .mockImplementation(
            async (arg: {
              create: Map<unknown, Set<unknown>>;
              update: Map<unknown, Set<unknown>>;
              remove: Map<unknown, Set<unknown>>;
            }) => {
              mutationsCallCount++;
              for (const [, items] of arg.create) {
                for (const item of items) {
                  const data = item as Record<string, unknown>;
                  if ('modelDesignId' in data) createdEntities.push(data);
                  else if ('designEntityId' in data && 'propertyType' in data) createdProperties.push(data);
                }
              }
            }
          ),
        get createdEntities() {
          return createdEntities;
        },
        get createdProperties() {
          return createdProperties;
        },
        get mutationsCallCount() {
          return mutationsCallCount;
        }
      };
    }

    it('phase 1: shell populate creates entity with no properties', async () => {
      const entityService = createMockEntityService();
      const propertyService = createMockPropertyService();
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createEmWithState();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const shell: AiEntityContext = {
        id: 'ai-user-1',
        name: 'User',
        displayName: '用户',
        properties: [],
        relations: [],
        indexes: []
      };

      await service.populate([shell], 'design-1');

      // 创建了 1 个实体，0 个属性
      expect(em.createdEntities).toHaveLength(1);
      expect(em.createdEntities[0]['name']).toBe('User');
      expect(em.createdEntities[0]['id']).toBe('ai-user-1');
      expect(em.createdProperties).toHaveLength(0);
      // mutations 被调用一次
      expect(em.mutationsCallCount).toBe(1);
    });

    it('phase 2: full populate on existing shell adds properties only', async () => {
      // 模拟 phase 1 已创建 User shell
      const existingEntities = [
        { id: 'ai-user-1', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const entityService = createMockEntityService(existingEntities);
      // shell 无属性
      const propertyService = createMockPropertyService({ 'ai-user-1': [] });
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createEmWithState();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const fullEntity: AiEntityContext = {
        id: 'ai-user-1',
        name: 'User',
        displayName: '用户',
        properties: [
          { id: 'ai-p1', name: 'email', propertyType: 'string', isRequired: true, isNullable: false, isUnique: true },
          { id: 'ai-p2', name: 'phone', propertyType: 'string', isRequired: false, isNullable: true, isUnique: false }
        ],
        relations: [],
        indexes: [{ id: 'ai-idx1', propertyIds: ['ai-p1'], isUnique: true }]
      };

      await service.populate([fullEntity], 'design-1');

      // 不应新建实体（已存在）
      expect(em.createdEntities).toHaveLength(0);
      // 应创建 2 个属性
      expect(em.createdProperties).toHaveLength(2);
      expect(em.createdProperties.find((p: Record<string, unknown>) => p['name'] === 'email')).toBeDefined();
      expect(em.createdProperties.find((p: Record<string, unknown>) => p['name'] === 'phone')).toBeDefined();
    });

    it('two-phase combined: entity visible after phase 1, complete after phase 2', async () => {
      // 模拟 entityService.entities 在 phase 1 后返回新实体（signal 更新）
      const entityService = createEntityServiceWithState();
      const propertyService = createMockPropertyService({});
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createEmWithState();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const phase1Shell: AiEntityContext = {
        id: 'ai-e1',
        name: 'Product',
        displayName: '商品',
        properties: [],
        relations: [],
        indexes: []
      };
      const phase2Full: AiEntityContext = {
        id: 'ai-e1',
        name: 'Product',
        displayName: '商品',
        properties: [
          { id: 'ai-p1', name: 'title', propertyType: 'string', isRequired: true, isNullable: false, isUnique: false },
          { id: 'ai-p2', name: 'price', propertyType: 'number', isRequired: true, isNullable: false, isUnique: false },
          { id: 'ai-p3', name: 'stock', propertyType: 'integer', isRequired: true, isNullable: false, isUnique: false }
        ],
        relations: [],
        indexes: [{ id: 'ai-idx1', propertyIds: ['ai-p1'], isUnique: false }]
      };

      // Phase 1: shell
      await service.populate([phase1Shell], 'design-1');
      expect(em.createdEntities).toHaveLength(1);
      expect(em.createdEntities[0]['name']).toBe('Product');
      expect(em.createdProperties).toHaveLength(0);

      // 模拟 signal 更新：entityService.entities() 现在返回 Product
      (entityService.entities as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'ai-e1', name: 'Product', displayName: '商品', nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ]);
      // 属性也现在可以被查询（仍为空，因为 phase 1 没有属性）
      (propertyService.propertiesOf as ReturnType<typeof vi.fn>).mockImplementation((entityId: string) => {
        if (entityId === 'ai-e1') return () => [];
        return () => [];
      });

      // Phase 2: full (属性补入)
      await service.populate([phase2Full], 'design-1');
      expect(em.createdEntities).toHaveLength(1); // 不重复创建实体
      expect(em.createdProperties).toHaveLength(3); // 3 个属性被创建
    });

    it('two-phase should not duplicate properties if phase 2 runs twice (idempotent)', async () => {
      // 模拟 phase 2 因安全网再次调用（onComplete 中的 fallback populate）
      const existingEntities = [
        { id: 'ai-e1', name: 'User', displayName: null, nodeX: 100, nodeY: 100, sortOrder: 'a0' }
      ];
      const existingProps = [
        { id: 'ai-p1', name: 'email', sortOrder: 'a0' },
        { id: 'ai-p2', name: 'phone', sortOrder: 'a1' }
      ];
      const entityService = createMockEntityService(existingEntities);
      // 第二次 phase 2：属性已存在（由第一次 phase 2 创建）
      const propertyService = createMockPropertyService({ 'ai-e1': existingProps });
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();
      const em = createEmWithState();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      const fullEntity: AiEntityContext = {
        id: 'ai-e1',
        name: 'User',
        properties: [
          { id: 'ai-p1', name: 'email', propertyType: 'string', isRequired: true, isNullable: false, isUnique: true },
          { id: 'ai-p2', name: 'phone', propertyType: 'string', isRequired: false, isNullable: true, isUnique: false }
        ],
        relations: [],
        indexes: []
      };

      // 第二次 populate: email 和 phone 均已存在
      await service.populate([fullEntity], 'design-1');

      // 不新建实体（已存在）
      expect(em.createdEntities).toHaveLength(0);
      // 不新建属性（已存在）
      expect(em.createdProperties).toHaveLength(0);
      // mutations 不应被调用（createMap 为空）
      expect(em.mutationsCallCount).toBe(0);
    });

    it('two-phase with multiple entities: each entity shell appears independently', async () => {
      const em = createEmWithState();
      let currentEntities: {
        id: string;
        name: string;
        displayName?: string | null;
        nodeX: number;
        nodeY: number;
        sortOrder: string;
      }[] = [];
      const entityService = {
        entities: vi.fn().mockImplementation(() => currentEntities),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined)
      };
      const propertyService = createMockPropertyService({});
      const relationService = createMockRelationService();
      const indexService = createMockIndexService();

      const service = createServiceWithMocks(entityService, propertyService, relationService, indexService, em);

      // Phase 1: User shell
      await service.populate(
        [{ id: 'ai-u', name: 'User', displayName: '用户', properties: [], relations: [], indexes: [] }],
        'design-1'
      );
      expect(em.createdEntities).toHaveLength(1);
      expect(em.createdEntities[0]['name']).toBe('User');

      // RxDB signal 更新：User 现在可见
      currentEntities = [{ id: 'ai-u', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' }];

      // Phase 1: Order shell (下一个实体的名称出现)
      await service.populate(
        [{ id: 'ai-o', name: 'Order', displayName: '订单', properties: [], relations: [], indexes: [] }],
        'design-1'
      );
      expect(em.createdEntities).toHaveLength(2); // User + Order 各一次
      expect(em.createdEntities[1]['name']).toBe('Order');

      // RxDB signal 更新：Order 也现在可见
      currentEntities = [
        { id: 'ai-u', name: 'User', displayName: '用户', nodeX: 100, nodeY: 100, sortOrder: 'a0' },
        { id: 'ai-o', name: 'Order', displayName: '订单', nodeX: 540, nodeY: 100, sortOrder: 'a1' }
      ];

      // Phase 2: User full
      (propertyService.propertiesOf as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
        id === 'ai-u' ? () => [] : () => []
      );
      await service.populate(
        [
          {
            id: 'ai-u',
            name: 'User',
            displayName: '用户',
            properties: [
              {
                id: 'ai-p1',
                name: 'name',
                propertyType: 'string',
                isRequired: true,
                isNullable: false,
                isUnique: false
              }
            ],
            relations: [
              {
                id: 'ai-r1',
                name: 'orders',
                relationKind: 'ONE_TO_MANY',
                mappedEntityId: 'ai-o',
                mappedPropertyId: 'ai-r2'
              }
            ],
            indexes: []
          }
        ],
        'design-1'
      );
      expect(em.createdProperties).toHaveLength(1);
      expect(em.createdProperties[0]['name']).toBe('name');

      // Phase 2: Order full
      (propertyService.propertiesOf as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
        id === 'ai-o' ? () => [] : () => []
      );
      await service.populate(
        [
          {
            id: 'ai-o',
            name: 'Order',
            displayName: '订单',
            properties: [
              {
                id: 'ai-p2',
                name: 'total',
                propertyType: 'number',
                isRequired: true,
                isNullable: false,
                isUnique: false
              }
            ],
            relations: [
              {
                id: 'ai-r2',
                name: 'user',
                relationKind: 'MANY_TO_ONE',
                mappedEntityId: 'ai-u',
                mappedPropertyId: 'ai-r1'
              }
            ],
            indexes: []
          }
        ],
        'design-1'
      );
      expect(em.createdProperties).toHaveLength(2);
      expect(em.createdProperties[1]['name']).toBe('total');
    });
  });
});
