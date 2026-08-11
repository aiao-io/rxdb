import { BehaviorSubject, NEVER, Observable, firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_STATIC_TYPES, type UUID } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { FindTreeOptions } from '../../repository/tree-repository.interface.js';
import { TreeRepository } from '../../repository/TreeRepository.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';

class TestTreeEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  static entityName = 'TestTreeEntity';
  id!: UUID;
  createdAt!: Date;
  updatedAt!: Date;
  name!: string;
  parentId!: UUID | null;
}

Object.assign(TestTreeEntity, {
  [METADATA]: {
    name: 'TestTreeEntity',
    namespace: 'public',
    sync: {
      type: SyncType.None,
      local: { adapter: 'local' }
    }
  }
});

const createMockLocal = () => ({
  findDescendants: vi.fn(),
  countDescendants: vi.fn(),
  findAncestors: vi.fn(),
  countAncestors: vi.fn()
});

type MockLocal = ReturnType<typeof createMockLocal>;
type QueryTaskConfig = { runner: () => Observable<unknown> };

const createMockQueryManager = () => ({
  createTask: vi.fn((config: QueryTaskConfig) => ({
    result$: config.runner()
  }))
});

type MockQueryManager = ReturnType<typeof createMockQueryManager>;

describe('TreeRepository', () => {
  let mockRxDB: RxDB;
  let mockQueryManager: MockQueryManager;
  let mockLocal: MockLocal;
  let repository: TreeRepository<typeof TestTreeEntity>;
  let localSubject: BehaviorSubject<MockLocal>;

  beforeEach(() => {
    mockLocal = createMockLocal();

    localSubject = new BehaviorSubject(mockLocal);

    mockQueryManager = createMockQueryManager();

    const localAdapter = {
      name: 'local',
      connect: vi.fn().mockResolvedValue(null),
      getRepository: vi.fn(() => mockLocal)
    };

    mockRxDB = {
      localAdapter$: of(localAdapter),
      remoteAdapter$: NEVER,
      entityManager: {
        createEntityRef: vi.fn(),
        getEntityRef: vi.fn(),
        hasEntityRef: vi.fn()
      },
      schemaManager: {
        getEntityMetadata: vi.fn().mockReturnValue({
          name: 'TestTreeEntity',
          namespace: 'public'
        }),
        getEntityType: vi.fn(() => TestTreeEntity)
      },
      options: {
        sync: {
          local: { adapter: 'local' },
          remote: null
        }
      },
      getAdapter: vi.fn(async () => localAdapter),
      addEventListener: vi.fn()
    } as unknown as RxDB;

    repository = new TreeRepository(mockRxDB, TestTreeEntity);
    Object.assign(repository, { queryManager: mockQueryManager, local$: localSubject, _setLocals: vi.fn() });
  });

  describe('查找后代', () => {
    it('应使用规范化选项查询后代（包含当前节点）', async () => {
      const descendants = [
        { id: 'child-1', name: 'Child 1', parentId: 'parent-1' },
        { id: 'child-2', name: 'Child 2', parentId: 'parent-1' }
      ];

      mockLocal.findDescendants.mockReturnValue(of(descendants));

      const result$ = repository.findDescendants({
        entityId: 'parent-1'
      });

      const result = await firstValueFrom(result$);

      expect(result).toEqual(descendants);
      expect(mockLocal.findDescendants).toHaveBeenCalled();
      expect(mockQueryManager.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: 'findDescendants'
          })
        })
      );
    });

    it('应在未提供时将 level 规范化为 0', async () => {
      mockLocal.findDescendants.mockReturnValue(of([]));

      const result$ = repository.findDescendants({
        entityId: 'parent-1'
      });

      await firstValueFrom(result$); // 等待 Observable 完成

      const callArgs = mockLocal.findDescendants.mock.calls[0][0];
      expect(callArgs.level).toBe(0); // 默认为 0
    });

    it('应将 level 限制为 TREE_MAX_LEVEL', async () => {
      mockLocal.findDescendants.mockReturnValue(of([]));

      const result$ = repository.findDescendants({
        entityId: 'parent-1',
        level: 200
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.findDescendants.mock.calls[0][0];
      expect(callArgs.level).toBe(100); // 应限制为 TREE_MAX_LEVEL
    });

    it('应允许有效的 level 值', async () => {
      mockLocal.findDescendants.mockReturnValue(of([]));

      const result$ = repository.findDescendants({
        entityId: 'parent-1',
        level: 5
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.findDescendants.mock.calls[0][0];
      expect(callArgs.level).toBe(5);
    });

    it('应在未提供时将 entityId 设置为 null', async () => {
      mockLocal.findDescendants.mockReturnValue(of([]));

      const result$ = repository.findDescendants({});

      await firstValueFrom(result$);

      const callArgs = mockLocal.findDescendants.mock.calls[0][0];
      expect(callArgs.entityId).toBeNull();
    });
  });

  describe('计数后代', () => {
    it('应使用规范化选项计数后代（不包含当前节点）', async () => {
      mockLocal.countDescendants.mockReturnValue(of(5));

      const result$ = repository.countDescendants({
        entityId: 'parent-1'
      });

      const result = await firstValueFrom(result$);

      expect(result).toBe(5);
      expect(mockLocal.countDescendants).toHaveBeenCalled();
      expect(mockQueryManager.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: 'countDescendants'
          })
        })
      );
    });

    it('应与 findDescendants 相同规范化选项', async () => {
      mockLocal.countDescendants.mockReturnValue(of(0));

      const result$ = repository.countDescendants({
        entityId: 'parent-1',
        level: 150
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.countDescendants.mock.calls[0][0];
      expect(callArgs.level).toBe(100); // 限制为 TREE_MAX_LEVEL
      expect(callArgs.entityId).toBe('parent-1');
    });
  });

  describe('查找祖先', () => {
    it('应使用规范化选项查询祖先（包含当前节点）', async () => {
      const ancestors = [
        { id: 'parent-1', name: 'Parent', parentId: 'grandparent-1' },
        { id: 'grandparent-1', name: 'Grandparent', parentId: null }
      ];

      mockLocal.findAncestors.mockReturnValue(of(ancestors));

      const result$ = repository.findAncestors({
        entityId: 'child-1'
      });

      const result = await firstValueFrom(result$);

      expect(result).toEqual(ancestors);
      expect(mockLocal.findAncestors).toHaveBeenCalled();
      expect(mockQueryManager.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: 'findAncestors'
          })
        })
      );
    });

    it('应在未提供时将 level 规范化为 0', async () => {
      mockLocal.findAncestors.mockReturnValue(of([]));

      const result$ = repository.findAncestors({
        entityId: 'child-1'
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.findAncestors.mock.calls[0][0];
      expect(callArgs.level).toBe(0); // 默认为 0
    });

    it('应将零或负的 level 值规范化为 0', async () => {
      mockLocal.findAncestors.mockReturnValue(of([]));

      const result$ = repository.findAncestors({
        entityId: 'child-1',
        level: 0
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.findAncestors.mock.calls[0][0];
      expect(callArgs.level).toBe(0); // 应保持为 0
    });
  });

  describe('计数祖先', () => {
    it('应使用规范化选项计数祖先（不包含当前节点）', async () => {
      mockLocal.countAncestors.mockReturnValue(of(3));

      const result$ = repository.countAncestors({
        entityId: 'child-1'
      });

      const result = await firstValueFrom(result$);

      expect(result).toBe(3);
      expect(mockLocal.countAncestors).toHaveBeenCalled();
      expect(mockQueryManager.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            type: 'countAncestors'
          })
        })
      );
    });

    it('应与 findAncestors 相同规范化选项', async () => {
      mockLocal.countAncestors.mockReturnValue(of(0));

      const result$ = repository.countAncestors({
        level: 200
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.countAncestors.mock.calls[0][0];
      expect(callArgs.level).toBe(100); // 限制为 TREE_MAX_LEVEL
      expect(callArgs.entityId).toBeNull(); // 未提供时使用默认值
    });
  });

  describe('选项规范化', () => {
    it('应保留原始选项对象', async () => {
      const originalOptions = {
        entityId: 'test-1',
        level: 5
      };

      mockLocal.findDescendants.mockReturnValue(of([]));

      const result$ = repository.findDescendants(originalOptions);

      await firstValueFrom(result$);

      // 原始 options 不应被修改。
      expect(originalOptions.level).toBe(5);
      expect(originalOptions.entityId).toBe('test-1');
    });

    it('应处理带有附加属性的选项', async () => {
      mockLocal.findDescendants.mockReturnValue(of([]));

      const options: FindTreeOptions<typeof TestTreeEntity> & { customProp: string } = {
        entityId: 'test-1',
        level: 10,
        customProp: 'custom'
      };

      const result$ = repository.findDescendants(options);

      await firstValueFrom(result$);

      const callArgs = mockLocal.findDescendants.mock.calls[0][0];
      expect(callArgs.entityId).toBe('test-1');
      expect(callArgs.level).toBe(10);
      expect(callArgs.customProp).toBe('custom'); // 应保留
    });

    it('应将负的 level 值规范化为 0', async () => {
      mockLocal.countDescendants.mockReturnValue(of(0));

      const result$ = repository.countDescendants({
        entityId: 'test-1',
        level: -5
      });

      await firstValueFrom(result$);

      const callArgs = mockLocal.countDescendants.mock.calls[0][0];
      expect(callArgs.level).toBe(0); // 负数应规范化为 0
    });
  });
});
