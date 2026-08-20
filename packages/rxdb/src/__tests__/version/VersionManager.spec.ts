import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { ENTITY_LOCAL_CREATE_EVENT, TRANSACTION_BEGIN, TRANSACTION_COMMIT } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import { HistoryManager } from '../../version/HistoryManager.js';
import type { PullRepositoryResult } from '../../version/pull-repository.js';
import type { PullResult } from '../../version/VersionManager.interface.js';
import { VersionManager } from '../../version/VersionManager.js';
import { createTransactionStub } from '../fixtures/transaction-executor-stub.js';

type VersionManagerHistoryManagerTestBridge = Pick<
  HistoryManager,
  | 'invalidateRedoStack'
  | 'isExecutingUndoRedo'
  | 'clearRedoStack'
  | 'destroy'
  | 'history'
  | 'syncing'
  | 'resetSyncCleared'
  | 'resetPullableCount'
  | 'clearUndoHistory'
  | 'setUndoBranch'
  | 'undoSessionGeneration'
  | 'pushableCount$'
  | 'pullableCount$'
>;

type BranchRepositoryMock = {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type ChangeRepositoryMock = {
  count: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
};

type AdapterMock = {
  switchBranch: ReturnType<typeof vi.fn>;
  getRxDBChangeSequence: ReturnType<typeof vi.fn>;
  getRepository: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof createTransactionStub>;
};

/** 只取按查询内容分派所需的那一层。 */
type BranchFindQuery = { where: { rules: Array<{ field: string; value?: unknown }> } };

type LocalCreateEventStub = {
  entities: Array<{ namespace: string; entity: string; id?: number }>;
};

type LocalCreateHandler = (event: LocalCreateEventStub) => void;

type SwitchBranchInvocation = {
  actions: {
    updates: Map<string, { patch: { revertChangeId?: number | null } }>;
  };
};

const createAddEventListenerMock = () => vi.fn<(type: string, listener: LocalCreateHandler) => void>();
type AddEventListenerMock = ReturnType<typeof createAddEventListenerMock>;

function getLocalCreateHandler(addEventListener: AddEventListenerMock): LocalCreateHandler {
  const call = addEventListener.mock.calls.find(([type]) => type === ENTITY_LOCAL_CREATE_EVENT);
  if (!call) throw new Error('ENTITY_LOCAL_CREATE_EVENT listener was not registered');
  return call[1];
}

const createRxDBChangeEvent = (id: number): LocalCreateEventStub => ({
  entities: [{ namespace: 'rxdb', entity: 'RxDBChange', id }]
});

const createChange = (id: number, entityId: string): RxDBChange =>
  ({
    id,
    namespace: 'public',
    entity: 'User',
    entityId,
    branchId: 'main',
    type: 'INSERT',
    patch: { name: entityId },
    inversePatch: null,
    transactionId: null,
    remoteId: null,
    revertChangeId: null,
    redoInvalidatedAt: null,
    createdAt: new Date('2099-01-01T00:00:00.000Z'),
    updatedAt: new Date('2099-01-01T00:00:00.000Z')
  }) as unknown as RxDBChange;

// RXD-028：用真实装饰实体而不是裸类——restoreEntity 需要读实体元数据来校验
// change 的身份（namespace/entity）与传入实体一致
@Entity({
  name: 'TestEntity',
  tableName: 'test_entity',
  namespace: 'public',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class RestoreTestEntity extends EntityBase {
  name!: string;
}

@Entity({
  name: 'OtherEntity',
  tableName: 'other_entity',
  namespace: 'public',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class RestoreOtherEntity extends EntityBase {
  name!: string;
}

function getHistoryManagerForTest(manager: VersionManager): VersionManagerHistoryManagerTestBridge {
  return (manager as unknown as { historyManager: VersionManagerHistoryManagerTestBridge }).historyManager;
}

describe('VersionManager', () => {
  let mockRxDB: RxDB;
  let mockBranchRepository: BranchRepositoryMock;
  let mockChangeRepository: ChangeRepositoryMock;
  let mockAdapter: AdapterMock;
  let addEventListenerMock: AddEventListenerMock;
  let versionManager: VersionManager;
  let historyManagerForTest: VersionManagerHistoryManagerTestBridge;

  beforeEach(() => {
    addEventListenerMock = createAddEventListenerMock();

    mockBranchRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockReturnValue(of(null)),
      create: vi.fn().mockImplementation(async (entity: object) => entity),
      update: vi.fn().mockImplementation(async (entity: object, patch: object) => Object.assign(entity, patch))
    };

    mockChangeRepository = {
      count: vi.fn().mockReturnValue(of(0)),
      find: vi.fn().mockResolvedValue([]),
      findAll: vi.fn().mockReturnValue(of([]))
    };

    const getRepository = vi.fn(entity => {
      if (entity === RxDBBranch) return mockBranchRepository;
      if (entity === RxDBChange) return mockChangeRepository;
      return null;
    });
    mockAdapter = {
      switchBranch: vi.fn().mockResolvedValue(undefined),
      getRxDBChangeSequence: vi.fn().mockResolvedValue(100),
      getRepository,
      // `getCurrentBranch` 的冷路径（查不到激活分支）现在开事务；事务内的仓库转发回同一组 mock。
      transaction: createTransactionStub({ getRepository })
    };

    mockRxDB = {
      options: {
        sync: {
          local: {
            adapter: 'local-adapter'
          }
        }
      },
      config: {
        // RXD-034：pushableCount 的仓库集合来自 config.entities × syncType。
        // 少了这份注册表，HistoryManager 每次刷新都会掉进 catch 降级为 0 —— 本文件测的是
        // VersionManager，不该顺带把计数路径变成常错分支。
        entities: [],
        sync: {
          local: {
            adapter: 'local-adapter'
          }
        }
      },
      localAdapter$: of(mockAdapter),
      connected$: of(true),
      firstConnectedAt: new Date(),
      entityManager: {
        instantiate: vi.fn(EntityType => Object.create(EntityType.prototype)),
        getRepository: vi.fn(entity => {
          if (entity === RxDBBranch) return mockBranchRepository;
          if (entity === RxDBChange) return mockChangeRepository;
          return null;
        })
      },
      getAdapter: vi.fn().mockReturnValue(of(mockAdapter)),
      addEventListener: addEventListenerMock,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    versionManager = new VersionManager(mockRxDB);
    (mockRxDB as unknown as { versionManager: VersionManager }).versionManager = versionManager;
    historyManagerForTest = getHistoryManagerForTest(versionManager);
  });

  describe('init', () => {
    it('should register ENTITY_LOCAL_CREATE_EVENT event listener', async () => {
      versionManager.init();

      expect(mockRxDB.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));
    });

    it('should invalidate redo stack on RxDBChange creation', async () => {
      versionManager.init();

      // 找到正确的事件处理器。
      const eventHandler = getLocalCreateHandler(addEventListenerMock);

      const invalidateSpy = vi.spyOn(historyManagerForTest, 'invalidateRedoStack');
      const isExecutingSpy = vi.spyOn(historyManagerForTest, 'isExecutingUndoRedo').mockReturnValue(false);

      const event = {
        entities: [
          {
            namespace: 'rxdb',
            entity: 'RxDBChange'
          }
        ]
      };

      await eventHandler(event);

      expect(invalidateSpy).toHaveBeenCalled();

      invalidateSpy.mockRestore();
      isExecutingSpy.mockRestore();
    });

    it('should not invalidate redo stack during undo/redo', async () => {
      await versionManager.init();

      const eventHandler = getLocalCreateHandler(addEventListenerMock);
      const invalidateSpy = vi.spyOn(historyManagerForTest, 'invalidateRedoStack');
      const isExecutingSpy = vi.spyOn(historyManagerForTest, 'isExecutingUndoRedo').mockReturnValue(true);

      const event = {
        entities: [
          {
            namespace: 'rxdb',
            entity: 'RxDBChange'
          }
        ]
      };

      await eventHandler(event);

      expect(invalidateSpy).not.toHaveBeenCalled();

      invalidateSpy.mockRestore();
      isExecutingSpy.mockRestore();
    });

    it('should not invalidate redo stack for non-RxDBChange entities', async () => {
      await versionManager.init();

      const eventHandler = getLocalCreateHandler(addEventListenerMock);
      const invalidateSpy = vi.spyOn(historyManagerForTest, 'invalidateRedoStack');

      const event = {
        entities: [
          {
            namespace: 'public',
            entity: 'User'
          }
        ]
      };

      await eventHandler(event);

      expect(invalidateSpy).not.toHaveBeenCalled();

      invalidateSpy.mockRestore();
    });

    it('clear 后连续 undo 只能撤销 clear 后创建的本地变更', async () => {
      const changes = [
        createChange(50, 'before-clear'),
        createChange(51, 'after-clear-1'),
        createChange(52, 'after-clear-2')
      ];
      const syncRepository = { find: vi.fn().mockResolvedValue([]) };

      mockBranchRepository.find.mockResolvedValue([{ id: 'main', activated: true }]);
      mockChangeRepository.find.mockImplementation(async () =>
        changes.filter(change => change.revertChangeId == null).sort((a, b) => b.id - a.id)
      );
      mockAdapter.getRepository.mockImplementation(entity => {
        if (entity === RxDBBranch) return mockBranchRepository;
        if (entity === RxDBChange) return mockChangeRepository;
        if (entity === RxDBSync) return syncRepository;
        return null;
      });
      mockAdapter.switchBranch.mockImplementation(async ({ actions }: SwitchBranchInvocation) => {
        for (const [key, update] of actions.updates) {
          if (!key.startsWith('rxdb:RxDBChange:')) continue;
          const change = changes.find(item => item.id === Number(key.slice('rxdb:RxDBChange:'.length)));
          if (change) change.revertChangeId = update.patch.revertChangeId ?? null;
        }
      });

      versionManager.init();
      const eventHandler = getLocalCreateHandler(addEventListenerMock);
      vi.spyOn(historyManagerForTest, 'invalidateRedoStack').mockResolvedValue(undefined);
      historyManagerForTest.clearUndoHistory();

      eventHandler(createRxDBChangeEvent(51));
      eventHandler(createRxDBChangeEvent(52));

      await versionManager.history().undo();
      await versionManager.history().undo();
      await versionManager.history().undo();

      expect(mockAdapter.switchBranch).toHaveBeenCalledTimes(2);
      expect(changes.find(change => change.id === 50)?.revertChangeId).toBeNull();
    });

    it('destroy 后 init 重建 HistoryManager 并恢复 history 与事务监听状态', async () => {
      const change = createChange(101, 'after-reconnect');
      const syncRepository = { find: vi.fn().mockResolvedValue([]) };
      mockBranchRepository.findOne.mockReturnValue(of({ id: 'main', activated: true }));
      mockAdapter.getRepository.mockImplementation(entity => {
        if (entity === RxDBBranch) return mockBranchRepository;
        if (entity === RxDBChange) return mockChangeRepository;
        if (entity === RxDBSync) return syncRepository;
        return null;
      });
      mockChangeRepository.findAll.mockReturnValue(of([change]));

      const originalHistoryManager = getHistoryManagerForTest(versionManager);
      const originalHistory = versionManager.history();
      const originalDestroy = vi.spyOn(originalHistoryManager, 'destroy');
      versionManager.init();
      originalHistoryManager.clearUndoHistory();
      const firstTransactionBegin = addEventListenerMock.mock.calls.find(
        ([type]) => type === TRANSACTION_BEGIN
      )?.[1] as unknown as (() => void) | undefined;
      if (!firstTransactionBegin) throw new Error('TRANSACTION_BEGIN listener was not registered');
      firstTransactionBegin();

      versionManager.destroy();
      versionManager.destroy();
      versionManager.init();

      const reinitializedHistoryManager = getHistoryManagerForTest(versionManager);
      const reinitializedHistory = versionManager.history();
      const transactionBeginListeners = addEventListenerMock.mock.calls.filter(([type]) => type === TRANSACTION_BEGIN);
      const reinitializedTransactionBegin = transactionBeginListeners.at(-1)?.[1] as unknown as
        (() => void) | undefined;
      if (!reinitializedTransactionBegin)
        throw new Error('reinitialized TRANSACTION_BEGIN listener was not registered');
      reinitializedTransactionBegin();

      const resetSyncCleared = vi.spyOn(reinitializedHistoryManager, 'resetSyncCleared');
      const localCreateListeners = addEventListenerMock.mock.calls.filter(
        ([type]) => type === ENTITY_LOCAL_CREATE_EVENT
      );
      const reinitializedLocalCreate = localCreateListeners.at(-1)?.[1];
      if (!reinitializedLocalCreate)
        throw new Error('reinitialized ENTITY_LOCAL_CREATE_EVENT listener was not registered');
      reinitializedLocalCreate(createRxDBChangeEvent(change.id));

      await expect(firstValueFrom(reinitializedHistory.histories$)).resolves.toEqual([
        expect.objectContaining({ changeId: change.id })
      ]);
      expect(reinitializedHistoryManager).not.toBe(originalHistoryManager);
      expect(reinitializedHistory).not.toBe(originalHistory);
      expect(originalDestroy).toHaveBeenCalledTimes(1);
      expect(resetSyncCleared).toHaveBeenCalledWith([change.id], { generation: 0, recordAt: null });
      expect(addEventListenerMock.mock.calls.filter(([type]) => type === TRANSACTION_COMMIT)).toHaveLength(2);
    });
  });

  describe('getLocalRepositories', () => {
    it('should return local repositories', async () => {
      const repos = await versionManager.getLocalRepositories();

      expect(repos.branchRepository).toBe(mockBranchRepository);
      expect(repos.changeRepository).toBe(mockChangeRepository);
      expect(repos.adapter).toBe(mockAdapter);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current activated branch', async () => {
      const mockBranch = { id: 'main', activated: true };
      mockBranchRepository.find.mockResolvedValue([mockBranch]);

      const branch = await versionManager.getCurrentBranch();

      expect(branch).toBe(mockBranch);
      expect(mockBranchRepository.find).toHaveBeenCalledWith({
        where: {
          combinator: 'and',
          rules: [{ field: 'activated', operator: '=', value: true }]
        },
        limit: 1
      });
    });

    it('should create main branch when no activated branch exists', async () => {
      mockBranchRepository.find.mockResolvedValue([]);

      const branch = await versionManager.getCurrentBranch();

      expect(branch).toEqual(
        expect.objectContaining({
          id: 'main',
          activated: true,
          local: true,
          remote: false
        })
      );
      expect(mockBranchRepository.create).toHaveBeenCalledTimes(1);
    });

    /**
     * 按查询内容打桩，而不是按调用次序（`mockResolvedValueOnce` 链）。
     *
     * 冷路径进事务后会**重做一遍**激活分支检查（双重检查锁），次序链会因此错位 ——
     * 第二次「查激活分支」拿到本该给「查 main」的返回值。按查询内容分派则与次数无关。
     */
    it('should reactivate main branch when main exists but is not activated', async () => {
      const mainBranch = { id: 'main', activated: false, local: true, remote: false };
      mockBranchRepository.find.mockImplementation((query: BranchFindQuery) =>
        Promise.resolve(
          query.where.rules.some(rule => rule.field === 'id' && rule.value === 'main') ? [mainBranch] : []
        )
      );

      const branch = await versionManager.getCurrentBranch();

      expect(branch).toBe(mainBranch);
      expect(mainBranch.activated).toBe(true);
      expect(mockBranchRepository.update).toHaveBeenCalledWith(mainBranch, { activated: true });
      expect(mockBranchRepository.create).not.toHaveBeenCalled();
    });

    it('should create main branch when there is no active branch and no main branch', async () => {
      mockBranchRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const branch = await versionManager.getCurrentBranch();

      expect(branch).toEqual(
        expect.objectContaining({
          id: 'main',
          activated: true,
          local: true,
          remote: false
        })
      );
      expect(mockBranchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'main',
          activated: true,
          local: true,
          remote: false
        })
      );
    });
  });

  describe('switchBranch', () => {
    it('should skip switching to the same branch', async () => {
      const currentBranch = { id: 'main', activated: true };
      mockBranchRepository.find.mockResolvedValue([currentBranch]);

      await versionManager.switchBranch('main');

      expect(mockAdapter.switchBranch).not.toHaveBeenCalled();
    });

    it('should dispatch events during branch switch', async () => {
      mockBranchRepository.find
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([
          { id: 'main', activated: true },
          { id: 'feature', activated: false }
        ])
        .mockResolvedValue([]);

      mockChangeRepository.find.mockResolvedValue([]);

      await versionManager.switchBranch('feature');

      expect(mockRxDB.dispatchEvent).toHaveBeenCalledTimes(2);
      expect(mockRxDB.dispatchEvent).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: 'SWITCH_BRANCH_BEGIN' })
      );
      expect(mockRxDB.dispatchEvent).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: 'SWITCH_BRANCH_COMMIT' })
      );
    });

    it('should clear redo stack after switching', async () => {
      mockBranchRepository.find
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([
          { id: 'main', activated: true },
          { id: 'feature', activated: false }
        ])
        .mockResolvedValue([]);

      mockChangeRepository.find.mockResolvedValue([]);

      const clearSpy = vi.spyOn(historyManagerForTest, 'clearRedoStack');

      await versionManager.switchBranch('feature');

      expect(clearSpy).toHaveBeenCalled();

      clearSpy.mockRestore();
    });

    it('should dispatch rollback event on error', async () => {
      mockBranchRepository.find
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([
          { id: 'main', activated: true },
          { id: 'feature', activated: false }
        ]);

      mockAdapter.switchBranch.mockRejectedValue(new Error('Switch failed'));

      await expect(versionManager.switchBranch('feature')).rejects.toThrow('Switch failed');

      expect(mockRxDB.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'SWITCH_BRANCH_ROLLBACK' }));
    });

    // RXD-026：undo session 按分支存放后，视图曾只跟着 current_branch$ 这条响应式查询走。
    // 该查询在 switchBranch() resolve 之后才补发，切完分支立刻 undo() 会在 await 中间
    // 被换掉 session 对象，`#isUndoSessionCurrent` 的引用比对失配，undo 静默变成 no-op。
    it('switchBranch resolve 时 undo session 视图必须已经落到目标分支', async () => {
      const branches = [
        { id: 'main', activated: true, parentId: null, fromChangeId: null },
        { id: 'feature', activated: false, parentId: 'main', fromChangeId: null }
      ];
      type BranchQuery = { where?: { rules?: Array<{ field: string; value?: unknown }> } };
      mockBranchRepository.find.mockImplementation(async (options: BranchQuery = {}) => {
        const rules = options.where?.rules ?? [];
        const activated = rules.find(rule => rule.field === 'activated');
        if (activated) return branches.filter(branch => branch.activated === activated.value);
        return branches;
      });
      mockAdapter.switchBranch.mockImplementation(async ({ branchId }: { branchId: string }) => {
        for (const branch of branches) branch.activated = branch.id === branchId;
      });
      // 活跃分支订阅在构造时就取值，必须在建 VersionManager 之前备好 main
      mockBranchRepository.findOne.mockReturnValue(of(branches[0]));
      const manager = new VersionManager(mockRxDB);
      (mockRxDB as unknown as { versionManager: VersionManager }).versionManager = manager;
      const historyManager = getHistoryManagerForTest(manager);

      const mainGeneration = historyManager.undoSessionGeneration;

      await manager.switchBranch('feature');
      // feature 第一次被访问，会新建自己的 session —— 代次必然不同于 main 的那一份
      expect(historyManager.undoSessionGeneration).not.toBe(mainGeneration);

      await manager.switchBranch('main');
      // 切回来必须拿回 main 原来那一份，而不是再新建一份或停在 feature 上
      expect(historyManager.undoSessionGeneration).toBe(mainGeneration);
    });
  });

  describe('history', () => {
    it('should return database scope history API', () => {
      const api = versionManager.history();

      expect(api.type).toBe('database');
      expect(api.histories$).toBeDefined();
      expect(api.undoHistories$).toBeDefined();
      expect(api.redoHistories$).toBeDefined();
      expect(api.undo).toBeDefined();
      expect(api.redo).toBeDefined();
    });

    it('should delegate to HistoryManager', () => {
      const historySpy = vi.spyOn(historyManagerForTest, 'history');

      versionManager.history();

      expect(historySpy).toHaveBeenCalledWith(undefined);

      historySpy.mockRestore();
    });
  });

  // 装饰实体的构造函数要求已初始化的 EntityManager；单测用 mock 的 instantiate
  // 走与生产同一个入口，避免直接 Object.create 制造非法运行时对象
  const instantiate = <T>(Ctor: new () => T): T =>
    (mockRxDB.entityManager as unknown as { instantiate: (c: unknown) => T }).instantiate(Ctor);

  describe('restoreEntity', () => {
    it('should restore a deleted entity from RxDBChange inversePatch', async () => {
      const mockDeleteChange = {
        id: 42,
        type: 'DELETE',
        namespace: 'public',
        entity: 'TestEntity',
        entityId: 'entity-1',
        inversePatch: { id: 'entity-1', name: 'restored' },
        patch: null
      };

      mockChangeRepository.find.mockResolvedValue([mockDeleteChange]);
      mockBranchRepository.find.mockResolvedValue([{ id: 'main' }]);

      const mockEntityRepo = {
        find: vi.fn().mockResolvedValue([{ id: 'entity-1', name: 'restored' }])
      };
      mockAdapter.getRepository.mockImplementation((entity: unknown) => {
        if (entity === RxDBBranch) return mockBranchRepository;
        if (entity === RxDBChange) return mockChangeRepository;
        return mockEntityRepo;
      });

      const entity = instantiate(RestoreTestEntity);
      const result = await versionManager.restoreEntity<typeof RestoreTestEntity>(entity, { changeId: '42' });

      expect(result).toEqual({ id: 'entity-1', name: 'restored' });
      expect(mockAdapter.switchBranch).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'main',
          actions: expect.objectContaining({
            inserts: expect.any(Map)
          })
        })
      );
    });

    it('should throw if changeId not found', async () => {
      mockChangeRepository.find.mockResolvedValue([]);

      await expect(
        versionManager.restoreEntity<typeof RestoreTestEntity>(instantiate(RestoreTestEntity), { changeId: '999' })
      ).rejects.toThrow('RxDBChange not found: 999');
    });

    it('should throw if change type is not DELETE', async () => {
      mockChangeRepository.find.mockResolvedValue([{ id: 10, type: 'UPDATE', inversePatch: {} }]);

      await expect(
        versionManager.restoreEntity<typeof RestoreTestEntity>(instantiate(RestoreTestEntity), { changeId: '10' })
      ).rejects.toThrow('Cannot restore from non-DELETE change');
    });

    it('should throw if inversePatch is missing', async () => {
      mockChangeRepository.find.mockResolvedValue([{ id: 10, type: 'DELETE', inversePatch: null }]);

      await expect(
        versionManager.restoreEntity<typeof RestoreTestEntity>(instantiate(RestoreTestEntity), { changeId: '10' })
      ).rejects.toThrow('has no inversePatch');
    });

    // RXD-028：只校验 changeId/type/inversePatch，不校验 change 的身份与传入实体一致。
    // 传 A 的实体配 B 的 changeId 会真的恢复 B，再用 A 的 constructor 去查 → 返回 undefined，
    // 而返回类型声明是非空的 InstanceType<T>。
    it('should throw when the change belongs to a different entity', async () => {
      mockChangeRepository.find.mockResolvedValue([
        {
          id: 42,
          type: 'DELETE',
          namespace: 'public',
          entity: 'TestEntity',
          entityId: 'entity-1',
          inversePatch: { id: 'entity-1', name: 'restored' },
          patch: null
        }
      ]);
      mockBranchRepository.find.mockResolvedValue([{ id: 'main' }]);

      await expect(
        versionManager.restoreEntity<typeof RestoreOtherEntity>(instantiate(RestoreOtherEntity), { changeId: '42' })
      ).rejects.toThrow(/OtherEntity/);

      // 身份不符时不得触碰数据
      expect(mockAdapter.switchBranch).not.toHaveBeenCalled();
    });

    it('should throw when the restore produced no row instead of returning undefined', async () => {
      mockChangeRepository.find.mockResolvedValue([
        {
          id: 42,
          type: 'DELETE',
          namespace: 'public',
          entity: 'TestEntity',
          entityId: 'entity-1',
          inversePatch: { id: 'entity-1', name: 'restored' },
          patch: null
        }
      ]);
      mockBranchRepository.find.mockResolvedValue([{ id: 'main' }]);
      const emptyRepo = { find: vi.fn().mockResolvedValue([]) };
      mockAdapter.getRepository.mockImplementation((entity: unknown) => {
        if (entity === RxDBBranch) return mockBranchRepository;
        if (entity === RxDBChange) return mockChangeRepository;
        return emptyRepo;
      });

      await expect(
        versionManager.restoreEntity<typeof RestoreTestEntity>(instantiate(RestoreTestEntity), { changeId: '42' })
      ).rejects.toThrow(/entity-1/);
    });
  });

  describe('pushableCount$ and pullableCount$', () => {
    // RXD-041：原来这里是两条 `toBeDefined()`——只要属性存在就绿，哪怕转发到了别的流、
    // 或者每次访问都新建一份（订阅者各拿各的，计数永远对不上）。断言身份才测得到这些。
    it('直接转发 HistoryManager 的同一个流实例，不另建一份', () => {
      expect(versionManager.pushableCount$).toBe(historyManagerForTest.pushableCount$);
      expect(versionManager.pullableCount$).toBe(historyManagerForTest.pullableCount$);
    });
  });

  describe('pull', () => {
    beforeEach(() => {
      vi.spyOn(historyManagerForTest, 'syncing').mockImplementation(async fn => fn());
      vi.spyOn(historyManagerForTest, 'resetPullableCount').mockImplementation(() => {
        //
      });
      vi.spyOn(historyManagerForTest, 'clearUndoHistory').mockImplementation(() => {
        //
      });
    });

    // RXD-031 D：repositoryFilter 逐仓拉取部分失败时，前面的仓库可能已经真实落库；
    // undo 边界此前从未按已提交的部分推进
    it('RxDBPartialSyncError 且 historyInvalidated 时清空 undo 历史并原样重新抛出', async () => {
      const partialResult: PullResult = {
        pulled: 5,
        compacted: 0,
        applied: 3,
        hasMore: false,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated: true,
        failures: []
      };
      const partialError = new RxDBPartialSyncError<PullResult>(partialResult, new Error('repo pull failed'));
      vi.spyOn(historyManagerForTest, 'syncing').mockRejectedValue(partialError);

      await expect(versionManager.pull()).rejects.toBe(partialError);
      expect(historyManagerForTest.clearUndoHistory).toHaveBeenCalledTimes(1);
    });

    it('RxDBPartialSyncError 但只推进了水位线（historyInvalidated=false）时不清空 undo 历史', async () => {
      const emptyResult: PullResult = {
        pulled: 2,
        compacted: 2,
        applied: 0,
        hasMore: false,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated: false,
        failures: []
      };
      const partialError = new RxDBPartialSyncError<PullResult>(emptyResult, new Error('repo pull failed'));
      vi.spyOn(historyManagerForTest, 'syncing').mockRejectedValue(partialError);

      await expect(versionManager.pull()).rejects.toBe(partialError);
      expect(historyManagerForTest.clearUndoHistory).not.toHaveBeenCalled();
    });

    it('普通错误（非 RxDBPartialSyncError）不清空 undo 历史', async () => {
      const plainError = new Error('network down');
      vi.spyOn(historyManagerForTest, 'syncing').mockRejectedValue(plainError);

      await expect(versionManager.pull()).rejects.toBe(plainError);
      expect(historyManagerForTest.clearUndoHistory).not.toHaveBeenCalled();
    });
  });

  // RXD-041：这两组原本是 `try { await ... } catch {} expect(true).toBe(true)` ——
  // 无论委托到哪、无论抛什么都绿。改成断言错误**原样冒泡**：既证明确实走进了
  // create_branch / remove_branch，也固定「包装层不吞异常」这条真实契约。
  describe('createBranch', () => {
    it('委托给 create_branch，其重名校验的错误原样冒泡', async () => {
      // find 对任何查询都返回一条记录 ⇒ create_branch 的「分支已存在」校验必然命中，
      // 错误文案来自生产代码本身，包装层没做任何加工才能对上
      mockBranchRepository.find.mockResolvedValue([{ id: 'feature', activated: true }]);

      await expect(versionManager.createBranch('feature', 1)).rejects.toThrow(/Branch id \(feature\) already exists/);
    });
  });

  describe('removeBranch', () => {
    it('把 remove_branch 的失败原样抛给调用方，不吞不包', async () => {
      const failure = new Error('remove_branch exploded');
      mockBranchRepository.find.mockRejectedValue(failure);

      await expect(versionManager.removeBranch('feature')).rejects.toBe(failure);
    });
  });

  describe('Repository level sync', () => {
    beforeEach(() => {
      vi.spyOn(historyManagerForTest, 'syncing').mockImplementation(async fn => fn());
      vi.spyOn(historyManagerForTest, 'clearUndoHistory').mockImplementation(() => {
        //
      });
    });

    // RXD-031 D：fetchAll 多轮拉取中途失败时，前面几轮的事务已经真实提交；
    // undo 边界此前从未按已提交的部分推进
    it('pullRepository 遇到 RxDBPartialSyncError 且 historyInvalidated 时清空 undo 历史并原样重新抛出', async () => {
      const partialResult: PullRepositoryResult = {
        repository: { namespace: 'public', entity: 'Todo' },
        pulled: 4,
        compacted: 0,
        applied: 2,
        hasMore: true,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated: true,
        failures: []
      };
      const partialError = new RxDBPartialSyncError<PullRepositoryResult>(partialResult, new Error('round 2 failed'));
      vi.spyOn(historyManagerForTest, 'syncing').mockRejectedValue(partialError);

      await expect(versionManager.pullRepository('public', 'Todo')).rejects.toBe(partialError);
      expect(historyManagerForTest.clearUndoHistory).toHaveBeenCalledTimes(1);
    });

    it('pullRepository 遇到 RxDBPartialSyncError 但只推进了水位线时不清空 undo 历史', async () => {
      const emptyResult: PullRepositoryResult = {
        repository: { namespace: 'public', entity: 'Todo' },
        pulled: 2,
        compacted: 2,
        applied: 0,
        hasMore: true,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated: false,
        failures: []
      };
      const partialError = new RxDBPartialSyncError<PullRepositoryResult>(emptyResult, new Error('round 1 failed'));
      vi.spyOn(historyManagerForTest, 'syncing').mockRejectedValue(partialError);

      await expect(versionManager.pullRepository('public', 'Todo')).rejects.toBe(partialError);
      expect(historyManagerForTest.clearUndoHistory).not.toHaveBeenCalled();
    });
  });

  describe('Other methods', () => {
    // RXD-068：`hasChanges` 只看成功项的 `item.result`。失败仓库自己已提交的部分进度
    // 位于 `item.error.result`（RxDBPartialSyncError），被完全忽略 —— 远端数据已落库，
    // 用户却仍能 undo 回同步前状态，重新制造本地/远端分叉。
    it('失败仓库携带的 partial 进度也必须推进 undo 边界', async () => {
      const clearSpy = vi.spyOn(historyManagerForTest, 'clearUndoHistory').mockImplementation(() => {
        //
      });
      const partialError = new RxDBPartialSyncError(
        {
          pullResult: { pulled: 4, compacted: 0, applied: 4, hasMore: false },
          persistedProgress: true,
          historyInvalidated: true
        },
        new Error('second page failed')
      );
      vi.spyOn(historyManagerForTest, 'syncing').mockResolvedValue({
        succeeded: 0,
        failed: 1,
        results: [{ repository: { namespace: 'public', entity: 'User' }, success: false, error: partialError }]
      } as never);

      await versionManager.bulkSync();

      expect(clearSpy).toHaveBeenCalledTimes(1);
    });
  });
});
