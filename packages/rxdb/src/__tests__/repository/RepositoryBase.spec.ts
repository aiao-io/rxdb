import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES, type UUID } from '../../entity/entity.interface.js';
import { RepositoryBase } from '../../repository/RepositoryBase.js';
import { RxDB } from '../../RxDB.js';
import { STATUS } from '../../rxdb.private.js';

class TestEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  static entityName = 'TestEntity';
  id!: UUID;
  createdAt!: Date;
  updatedAt!: Date;
  name!: string;
  value?: number;
  extra?: string;
}

class TestRepository extends RepositoryBase<typeof TestEntity> {
  constructor(rxdb: RxDB) {
    super(rxdb, TestEntity);
  }
}

type TestStatus = {
  origin: Record<string, unknown>;
  replace?: (update: TestEntity) => void;
};

const TEST_ID = '00000000-0000-0000-0000-000000000001' as UUID;
const SECOND_TEST_ID = '00000000-0000-0000-0000-000000000002' as UUID;

const createEntity = (overrides: Partial<TestEntity> = {}): TestEntity =>
  Object.assign(new TestEntity(), {
    id: TEST_ID,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    name: 'Test Entity',
    ...overrides
  });

const withStatus = <T extends TestEntity, S extends TestStatus>(entity: T, status: S): T & { [STATUS]: S } =>
  Object.assign(entity, { [STATUS]: status });

const asEntityUpdate = (update: Partial<TestEntity>): TestEntity => update as TestEntity;

const createMockEntityManager = () => ({
  createEntityRef: vi.fn(),
  getEntityRef: vi.fn(),
  hasEntityRef: vi.fn()
});

type MockEntityManager = ReturnType<typeof createMockEntityManager>;

describe('RepositoryBase', () => {
  let mockRxDB: RxDB;
  let mockEntityManager: MockEntityManager;
  let repository: TestRepository;

  beforeEach(() => {
    mockEntityManager = createMockEntityManager();

    mockRxDB = {
      entityManager: mockEntityManager
    } as unknown as RxDB;

    repository = new TestRepository(mockRxDB);
  });

  describe('构造函数', () => {
    it('应使用 rxdb 和 EntityType 初始化', () => {
      expect(repository.EntityType).toBe(TestEntity);
    });
  });

  describe('createEntityRef', () => {
    it('应使用 EntityType 和 data 调用 entityManager.createEntityRef', () => {
      const data = { id: TEST_ID, name: 'Test Entity' };
      const mockEntity = { ...data };
      mockEntityManager.createEntityRef.mockReturnValue(mockEntity);

      const result = repository.createEntityRef(data);

      expect(mockEntityManager.createEntityRef).toHaveBeenCalledWith(TestEntity, data);
      expect(result).toBe(mockEntity);
    });

    it('应处理除 id 外的部分数据', () => {
      const data = { id: SECOND_TEST_ID, name: 'Partial' };
      mockEntityManager.createEntityRef.mockReturnValue(data);

      const result = repository.createEntityRef(data);

      expect(mockEntityManager.createEntityRef).toHaveBeenCalledWith(TestEntity, data);
      expect(result).toBe(data);
    });
  });

  describe('getEntityRef', () => {
    it('应使用 EntityType 和 id 调用 entityManager.getEntityRef', () => {
      const id = 'test-1';
      const mockEntity = { id, name: 'Test' };
      mockEntityManager.getEntityRef.mockReturnValue(mockEntity);

      const result = repository.getEntityRef(id);

      expect(mockEntityManager.getEntityRef).toHaveBeenCalledWith(TestEntity, id);
      expect(result).toBe(mockEntity);
    });

    it('应在未找到实体时返回 undefined', () => {
      mockEntityManager.getEntityRef.mockReturnValue(undefined);

      const result = repository.getEntityRef('non-existent');

      expect(mockEntityManager.getEntityRef).toHaveBeenCalledWith(TestEntity, 'non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('hasEntityRef', () => {
    it('应调用 entityManager.hasEntityRef 并在存在时返回 true', () => {
      const id = 'test-1';
      mockEntityManager.hasEntityRef.mockReturnValue(true);

      const result = repository.hasEntityRef(id);

      expect(mockEntityManager.hasEntityRef).toHaveBeenCalledWith(TestEntity, id);
      expect(result).toBe(true);
    });

    it('应在实体不存在时返回 false', () => {
      const id = 'non-existent';
      mockEntityManager.hasEntityRef.mockReturnValue(false);

      const result = repository.hasEntityRef(id);

      expect(mockEntityManager.hasEntityRef).toHaveBeenCalledWith(TestEntity, id);
      expect(result).toBe(false);
    });
  });

  describe('updateEntity', () => {
    it('应优先使用状态对象的 replace 接口', () => {
      const replace = vi.fn();
      const entity = withStatus(createEntity({ name: 'Old Name' }), { replace, origin: {} });
      const update = createEntity({ name: 'New Name' });

      repository.updateEntity(entity, update);

      expect(replace).toHaveBeenCalledWith(update);
    });

    it('应更新实体属性并设置 origin', () => {
      const entity = withStatus(createEntity({ name: 'Old Name' }), { origin: {} });
      const update = createEntity({ name: 'New Name' });

      repository.updateEntity(entity, update);

      expect(entity.name).toBe('New Name');
      expect(entity[STATUS].origin).toEqual(update);
    });

    it('应处理部分更新', () => {
      const entity = withStatus(createEntity({ name: 'Old', value: 100 }), { origin: {} });
      const update = asEntityUpdate({ name: 'Updated' });

      repository.updateEntity(entity, update);

      expect(entity.name).toBe('Updated');
      expect(entity.value).toBe(100); // 应保持不变
      expect(entity[STATUS].origin).toEqual(update);
    });

    it('应将更新属性展开到实体', () => {
      const entity = withStatus(createEntity({ name: 'Original' }), { origin: {} });
      const update = asEntityUpdate({ id: TEST_ID, name: 'Modified', extra: 'field' });

      repository.updateEntity(entity, update);

      expect(entity).toMatchObject(update);
      expect(entity.extra).toBe('field');
    });

    it('应覆盖之前的 origin 状态', () => {
      const entity = withStatus(createEntity({ name: 'Name' }), { origin: { oldField: 'old' } });
      const update = asEntityUpdate({ name: 'New Name' });

      repository.updateEntity(entity, update);

      expect(entity[STATUS].origin).toEqual(update);
      expect(entity[STATUS].origin).not.toHaveProperty('oldField');
    });
  });
});
