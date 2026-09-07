import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStatus } from '../../entity/entity-status.js';
import { ENTITY_STATIC_TYPES, type UUID } from '../../entity/entity.interface.js';
import { setSafeObjectKey } from '../../entity/entity.utils.js';
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

const asEntityUpdate = (update: Partial<TestEntity>): TestEntity => update as TestEntity;

/**
 * 挂一个**真实**的 {@link EntityStatus}。
 *
 * 这里不能用手搓的假 status：`updateEntity` 的正确性全在「脏实体走 mergeExternal、
 * 净实体走 replace」这条分流上，假对象把分流本身也一起假掉了，测试只能验证
 * 「某个方法被调过」而验证不了「本地编辑有没有丢」。
 *
 * `proxyTarget` 平时由 `entity-manager` 在建代理时回填，单测里不经代理，直接指向实体本身
 * （`patch` getter 比较的是 proxyTarget 与 origin，指向同一对象即可正确算出差异）。
 */
const attachStatus = <T extends TestEntity>(
  rxdb: RxDB,
  entity: T
): T & { [STATUS]: EntityStatus<typeof TestEntity> } => {
  const status = new EntityStatus<typeof TestEntity>(rxdb, {
    target: entity
  } as unknown as ConstructorParameters<typeof EntityStatus<typeof TestEntity>>[1]);
  setSafeObjectKey(status, 'proxyTarget', entity);
  return Object.assign(entity, { [STATUS]: status });
};

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
    it('净实体：整行覆盖并把基线推到新值', () => {
      const entity = attachStatus(mockRxDB, createEntity({ name: 'Old Name' }));

      repository.updateEntity(entity, asEntityUpdate({ name: 'New Name' }));

      const status = entity[STATUS];
      expect(entity.name).toBe('New Name');
      expect(status.origin).toMatchObject({ id: TEST_ID, name: 'New Name' });
      expect(status.modified).toBe(false);
      expect(status.patch).toEqual({});
    });

    it('脏实体：保留本地未保存的编辑，只把基线前移', () => {
      // 回归：以前这里无条件 replace，用户改了一半的字段会被写进基线后清空，
      // UI 看起来没变，下一次 save() 静默 no-op，编辑永久丢失。
      const entity = attachStatus(mockRxDB, createEntity({ name: 'Old Name', value: 1 }));
      // 模拟 proxy set 陷阱走过一遍：写值 + 标脏（单测不经代理，两步得自己做）
      entity.name = '用户改到一半';
      entity[STATUS].markChanged('name');
      entity[STATUS].modified = true;

      repository.updateEntity(entity, asEntityUpdate({ name: '远端新值', value: 2 }));

      const status = entity[STATUS];
      expect(entity.name).toBe('用户改到一半'); // 本地编辑不被覆盖
      expect(entity.value).toBe(2); // 没有本地编辑的字段照常同步
      expect(status.origin).toMatchObject({ name: '远端新值', value: 2 }); // 基线前移
      expect(status.modified).toBe(true);
      expect(status.patch).toEqual({ name: '用户改到一半' });
    });

    it('应处理部分更新：未出现在 update 里的字段保持不变', () => {
      const entity = attachStatus(mockRxDB, createEntity({ name: 'Old', value: 100 }));

      repository.updateEntity(entity, asEntityUpdate({ name: 'Updated' }));

      expect(entity.name).toBe('Updated');
      expect(entity.value).toBe(100);
      expect(entity[STATUS].origin).toMatchObject({ name: 'Updated', value: 100 });
    });

    it('应将更新属性展开到实体（含 update 带来的新字段）', () => {
      const entity = attachStatus(mockRxDB, createEntity({ name: 'Original' }));
      const update = asEntityUpdate({ id: TEST_ID, name: 'Modified', extra: 'field' });

      repository.updateEntity(entity, update);

      expect(entity).toMatchObject(update);
      expect(entity.extra).toBe('field');
    });

    it('应清空上一轮的本地 patch 历史', () => {
      const entity = attachStatus(mockRxDB, createEntity({ name: 'Name' }));
      entity[STATUS].checkChange();
      expect(entity[STATUS].patches).toHaveLength(1);

      repository.updateEntity(entity, asEntityUpdate({ name: 'New Name' }));

      expect(entity[STATUS].patches).toEqual([]);
    });
  });
});
