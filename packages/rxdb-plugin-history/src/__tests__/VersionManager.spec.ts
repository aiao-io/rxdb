import {
  ACTIVE_BRANCH_KEY,
  Entity,
  ENTITY_LOCAL_CREATE_EVENT,
  EntityBase,
  PropertyType,
  RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  takeDeclaredWrite,
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  type EntityType,
  type SwitchBranchOptions
} from '@aiao/rxdb';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { HistoryManager } from '../HistoryManager.js';
import { VersionManager } from '../VersionManager.js';
import {
  createSwitchBranchStub,
  createTransactionExecutorStub,
  createTransactionStub
} from './fixtures/transaction-executor-stub.js';

type VersionManagerHistoryManagerTestBridge = Pick<
  HistoryManager,
  | 'invalidateRedoStack'
  | 'isExecutingUndoRedo'
  | 'clearRedoStack'
  | 'destroy'
  | 'history'
  | 'resetSyncCleared'
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
  mergeChanges: ReturnType<typeof vi.fn>;
  getRxDBChangeSequence: ReturnType<typeof vi.fn>;
  // 这一格不能用裸 `vi.fn`：它要被原样交给 `createSwitchBranchStub` / `createTransactionExecutorStub`
  // 当仓库宿主用，宿主那边要的是一个可调用签名，而 `ReturnType<typeof vi.fn>` 是不可调用的联合。
  getRepository: Mock<(EntityType: EntityType) => unknown>;
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
    const mergeChanges = vi.fn().mockResolvedValue(undefined);
    mockAdapter = {
      switchBranch: vi.fn(createSwitchBranchStub({ getRepository })),
      mergeChanges,
      getRxDBChangeSequence: vi.fn().mockResolvedValue(100),
      getRepository,
      // `getCurrentBranch` 的冷路径（查不到激活分支）现在开事务；事务内的仓库转发回同一组 mock。
      // `mergeChanges` 也要转发：`restore_entity` 自己开事务、按执行器声明受信意图
      // （否则并发的适配器级写会互相顶掉声明），于是那次写是从执行器上发出的。
      transaction: createTransactionStub({ getRepository, mergeChanges: mergeChanges as never })
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
      // 一个能力插件都没装：`prepare` 回调因此会跑完一个空的贡献方列表，
      // 本文件测的编排顺序与今天逐字节一致。需要看前置校验本身的用例自己往这里放贡献方。
      systemContributions: [],
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
          activeKey: ACTIVE_BRANCH_KEY,
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
      // 两列同进同出：`activeKey` 的可空唯一列只管得住非 NULL 的行，漏写它
      // 就等于让这一行退出「至多一个 active」的管辖，而且不报任何错。
      expect(mockBranchRepository.update).toHaveBeenCalledWith(mainBranch, {
        activated: true,
        activeKey: ACTIVE_BRANCH_KEY
      });
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
    /**
     * main 已激活、feature 存在；`switch_branch_actions` 取到空变更集。
     *
     * @remarks
     * 挂在 `switchBranch` 这一层而不是各内层 describe 各抄一份：两个内层 describe（前置校验、
     * 接管）验的是同一条入口的两段，分支查询序列一旦在一处被改，另一处测的就是另一个库了。
     */
    const stubMainToFeature = () => {
      mockBranchRepository.find
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([{ id: 'main', activated: true }])
        .mockResolvedValueOnce([
          { id: 'main', activated: true },
          { id: 'feature', activated: false }
        ])
        .mockResolvedValue([]);
      mockChangeRepository.find.mockResolvedValue([]);
    };

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
      mockAdapter.switchBranch.mockImplementation(
        createSwitchBranchStub({ getRepository: mockAdapter.getRepository }, branchId => {
          for (const branch of branches) branch.activated = branch.id === branchId;
        })
      );
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

    // 前置校验以前跑在**另一个只读事务**里：它提交之后、切换事务开始之前留着一个窗口，
    // 窗口里的一次写能让刚判过的「工作树干净」变成假的，而切换照样完成。校验搬进
    // `SwitchBranchOptions.prepare` 之后，「校验通过」与「切换完成」不再是两件可以分开发生的事。
    describe('前置校验跑在切换事务内部', () => {
      /**
       * 只实现 switchBranch 会问到的那三个贡献点；其余六个在这条路径上一次都不会被调到。
       *
       * `takeOverBranchSwitch` 必须答 `'not_applicable'`：答 `'switched'` 等于宣布 active 已经
       * 由贡献方切过去了，普通路径整段跳过，于是下面每一条断言的都是一次没发生的切换。
       */
      const contributePrepare = () => {
        const prepareBranchSwitch = vi.fn().mockResolvedValue(undefined);
        (mockRxDB as unknown as { systemContributions: unknown[] }).systemContributions = [
          {
            prepareBranchSwitch,
            takeOverBranchSwitch: vi.fn().mockResolvedValue('not_applicable'),
            settleBranchSwitchFailure: vi.fn().mockResolvedValue(undefined)
          }
        ];
        return prepareBranchSwitch;
      };

      it('贡献方拿到的是切换事务自己的 executor，而不是另开一个事务', async () => {
        const prepareBranchSwitch = contributePrepare();
        stubMainToFeature();
        const switchExecutor = createTransactionExecutorStub({ getRepository: mockAdapter.getRepository });
        mockAdapter.switchBranch.mockImplementation(async ({ branchId, prepare }: SwitchBranchOptions) => {
          await prepare({ executor: switchExecutor, targetBranchId: branchId as string });
        });

        await versionManager.switchBranch('feature');

        expect(prepareBranchSwitch).toHaveBeenCalledTimes(1);
        expect(prepareBranchSwitch).toHaveBeenCalledWith({
          executor: switchExecutor,
          currentBranchId: 'main',
          targetBranchId: 'feature',
          preconditions: undefined
        });
        // 自己开事务就又造出一个窗口，所以这条路径上一个事务都不该开。
        expect(mockAdapter.transaction).not.toHaveBeenCalled();
      });

      it('调用方提的 preconditions 原样转交给贡献方', async () => {
        const prepareBranchSwitch = contributePrepare();
        stubMainToFeature();

        await versionManager.switchBranch('feature', { requireClean: true });

        expect(prepareBranchSwitch).toHaveBeenCalledWith(
          expect.objectContaining({ preconditions: { requireClean: true }, targetBranchId: 'feature' })
        );
      });

      it('前置校验拒绝时，适配器上不能留下受信写声明', async () => {
        const prepareBranchSwitch = contributePrepare();
        prepareBranchSwitch.mockRejectedValue(new Error('工作树不干净'));
        stubMainToFeature();

        await expect(versionManager.switchBranch('feature', { requireClean: true })).rejects.toThrow('工作树不干净');

        // 声明挂在**适配器实例**上，取用即清除。校验拒绝时一个写原语都没跑，没人取用它；
        // 留着就会被这个适配器的下一次 `mergeChanges` 取走，那次合并于是按
        // `projection_rewrite` 判定——一个工作树单元都不产生，拉回来的远端改动凭空消失。
        expect(takeDeclaredWrite(mockAdapter)).toBeUndefined();
      });

      it('适配器没有调用 prepare 时必须炸，而不是当作校验通过', async () => {
        const prepareBranchSwitch = contributePrepare();
        stubMainToFeature();
        // 契约违背在其他任何地方都不显形：分支照切、事件照发、actions 照放。
        mockAdapter.switchBranch.mockResolvedValue(undefined);

        await expect(versionManager.switchBranch('feature')).rejects.toThrow(/prepare/);
        expect(prepareBranchSwitch).not.toHaveBeenCalled();
      });
    });

    /**
     * `takeOverBranchSwitch` 与 `settleBranchSwitchFailure` 这两个贡献点的编排。
     *
     * @remarks
     * 两个一起测而不是各起一个 describe：它们是同一条 `switchBranch()` 上的一进一出——
     * 「接管成立」这条路径上没有切换事务，于是「失败诊断落在事务之外」这句话在它身上
     * 才有意义，而分开写的话没有任何一条用例会同时走到这两处。
     */
    describe('接管与失败诊断（RxDBSystemContribution）', () => {
      /**
       * 装 n 个贡献方，第 i 个的 `takeOverBranchSwitch` 答 `verdicts[i]`。
       *
       * @param verdicts - 各贡献方的接管判词，按登记顺序
       * @returns 那几个贡献方，用于断言各自被调了几次、拿到了什么
       *
       * @remarks
       * 三个钩子都装上，哪怕某条用例只看其中一个：只装被看的那个，一次「实现顺手多调了
       * 一个钩子」的回归会以 `is not a function` 的形态炸在别处，而不是以断言失败的形态
       * 落在这里。
       */
      const contributeTakeover = (...verdicts: readonly ('switched' | 'not_applicable')[]) => {
        const contributions = verdicts.map(verdict => ({
          prepareBranchSwitch: vi.fn().mockResolvedValue(undefined),
          takeOverBranchSwitch: vi.fn().mockResolvedValue(verdict),
          settleBranchSwitchFailure: vi.fn().mockResolvedValue(undefined)
        }));
        (mockRxDB as unknown as { systemContributions: unknown[] }).systemContributions = contributions;
        return contributions;
      };

      it('接管成立时普通切换整段不跑', async () => {
        const [contribution] = contributeTakeover('switched');
        stubMainToFeature();

        await versionManager.switchBranch('feature');

        expect(contribution.takeOverBranchSwitch).toHaveBeenCalledTimes(1);
        // 接管方已经在**它自己的**事务里把 active 切过去了。普通路径再跑一遍不是幂等的：
        // `switch_branch_actions` 是在接管之前的现场上算出来的，套到已经切过去的库上
        // 等于拿一份过期的差异把目标分支的投影重写一次。
        expect(mockAdapter.switchBranch).not.toHaveBeenCalled();
        // `prepareBranchSwitch` 跑在切换事务**内部**，而接管路径上根本没有那个事务。
        // 仍然调它的实现只能是自己新开一个——那就又造出了一个「判过之后、切换之前」的窗口。
        expect(contribution.prepareBranchSwitch).not.toHaveBeenCalled();
      });

      it('接管方拿到的上下文里没有 executor——它自己开事务', async () => {
        const [contribution] = contributeTakeover('switched');
        stubMainToFeature();

        await versionManager.switchBranch('feature', { requireClean: true });

        // 全等而不是 `objectContaining`：多出一个 `executor` 键正是要挡的那件事。接管要做
        // 网络 I/O 和多笔事务，交一个执行器下去等于请它把一笔事务攥过整个分页过程。
        expect(contribution.takeOverBranchSwitch).toHaveBeenCalledWith({
          currentBranchId: 'main',
          targetBranchId: 'feature',
          preconditions: { requireClean: true }
        });
      });

      it('第一个答 switched 之后不再问第二个', async () => {
        const [first, second] = contributeTakeover('switched', 'not_applicable');
        stubMainToFeature();

        await versionManager.switchBranch('feature');

        expect(first.takeOverBranchSwitch).toHaveBeenCalledTimes(1);
        // 问完一圈再挑的话，第二个贡献方看到的现场已经是第一个接管的结果，而它会按
        // 「还没切」去判断——两个都答 switched 就等于 active 被切两次。
        expect(second.takeOverBranchSwitch).not.toHaveBeenCalled();
      });

      it('接管成立照样记账：redo 栈清空、undo 视图落到目标分支、COMMIT 事件照发', async () => {
        const [contribution] = contributeTakeover('switched');
        stubMainToFeature();
        const clearRedoStack = vi.spyOn(historyManagerForTest, 'clearRedoStack');
        const setUndoBranch = vi.spyOn(historyManagerForTest, 'setUndoBranch');

        await versionManager.switchBranch('feature');

        // 接管之后的库与普通切换之后的库处在同一个状态，所以收尾记账一格都不能少：
        // 少了的话 redo 栈里留着来源分支的项，而 undo 视图还停在来源分支上。
        expect(clearRedoStack).toHaveBeenCalled();
        expect(setUndoBranch).toHaveBeenCalledWith('feature');
        expect(mockRxDB.dispatchEvent).toHaveBeenCalledTimes(2);
        expect(mockRxDB.dispatchEvent).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ type: 'SWITCH_BRANCH_COMMIT' })
        );
        // 接管成立就是切成了，失败诊断这条路一步都不该走。
        expect(contribution.settleBranchSwitchFailure).not.toHaveBeenCalled();

        clearRedoStack.mockRestore();
        setUndoBranch.mockRestore();
      });

      it('全答 not_applicable 时普通路径照跑', async () => {
        const [contribution] = contributeTakeover('not_applicable');
        stubMainToFeature();

        await versionManager.switchBranch('feature');

        // 没人接管是**常态**（一个能力插件都没装的库上恒是它）。把「问过一圈」写成
        // 「问过就算接管」会让每一次普通切换都变成空操作。
        expect(mockAdapter.switchBranch).toHaveBeenCalledTimes(1);
        expect(contribution.prepareBranchSwitch).toHaveBeenCalledTimes(1);
      });

      it('切换没成时，失败诊断在回滚事件之后落盘，拿到的是原错误', async () => {
        const [contribution] = contributeTakeover('not_applicable');
        stubMainToFeature();
        const failure = new Error('Switch failed');
        mockAdapter.switchBranch.mockRejectedValue(failure);

        // 诊断落盘不吞错：调用方等的仍是让这次切换失败的那一个。
        await expect(versionManager.switchBranch('feature')).rejects.toBe(failure);

        expect(contribution.settleBranchSwitchFailure).toHaveBeenCalledWith({
          currentBranchId: 'main',
          targetBranchId: 'feature',
          error: failure
        });
        // 顺序是这条契约的全部：判定失败发生在那笔注定回滚的事务里，写在里面的标记会跟着
        // 一起消失，所以诊断只能在回滚之后、用自己的一笔事务落盘。
        const dispatchOrder = (mockRxDB.dispatchEvent as Mock).mock.invocationCallOrder.at(-1) as number;
        expect(contribution.settleBranchSwitchFailure.mock.invocationCallOrder[0]).toBeGreaterThan(dispatchOrder);
      });

      it('接管方自己抛出时，失败诊断照落', async () => {
        const [contribution] = contributeTakeover('switched');
        stubMainToFeature();
        const failure = new Error('物化中断');
        contribution.takeOverBranchSwitch.mockRejectedValue(failure);

        await expect(versionManager.switchBranch('feature')).rejects.toBe(failure);

        // 接管抛出时 active 还在来源分支上——这正是「没切成」，与普通路径的失败同一个处置。
        // 漏掉的话，恰恰是最需要留痕的那条路径（远端物化断在半路）一个字都不落盘。
        expect(contribution.settleBranchSwitchFailure).toHaveBeenCalledWith({
          currentBranchId: 'main',
          targetBranchId: 'feature',
          error: failure
        });
        expect(mockAdapter.switchBranch).not.toHaveBeenCalled();
      });

      it('切换已经成立之后的失败不算没切成——不落失败诊断', async () => {
        const [contribution] = contributeTakeover('not_applicable');
        stubMainToFeature();
        // 适配器吞掉 prepare：分支确实切过去了，`switchBranch()` 随后才抛契约违背。
        mockAdapter.switchBranch.mockResolvedValue(undefined);

        await expect(versionManager.switchBranch('feature')).rejects.toThrow(/prepare/);

        // 这条路径上 active 已经在目标分支上了。落一份「切换失败」的诊断等于把库标记成
        // 一个它并不处在的状态，而下一次启动会照着那份诊断去修一件没坏的事。
        expect(contribution.settleBranchSwitchFailure).not.toHaveBeenCalled();
      });
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
      // 必须走 mergeChanges 而不是 switchBranch：各适配器的 switch_branch 第一步就是
      // remove_all_triggers_sql，恢复出来的行不会产生任何 change 行，这条恢复无法被推送
      // 也无法被撤销。第三个参数 disableTriggers=false 正是"让触发器照常记账"。
      expect(mockAdapter.switchBranch).not.toHaveBeenCalled();
      expect(mockAdapter.mergeChanges).toHaveBeenCalledWith(
        expect.objectContaining({ inserts: expect.any(Map) }),
        undefined,
        false
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
      expect(mockAdapter.mergeChanges).not.toHaveBeenCalled();
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
});
