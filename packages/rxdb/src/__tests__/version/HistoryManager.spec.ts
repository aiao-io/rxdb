import { BehaviorSubject, config, filter, firstValueFrom, Observable, of, skip, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UUID } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import {
  filterHistoriesByScope,
  filterUndoableHistories,
  generateHistoryDescription,
  getScopeKey,
  HistoryManager
} from '../../version/HistoryManager.js';
import { HistoryItem, HistoryScope } from '../../version/VersionManager.interface.js';

describe('HistoryManager - Pure Functions', () => {
  describe('getScopeKey', () => {
    it('should return "database" for database scope', () => {
      const scope: HistoryScope = { type: 'database' };
      expect(getScopeKey(scope)).toBe('database');
    });

    it('should return "namespace:entity" for repository scope', () => {
      const scope: HistoryScope = {
        type: 'repository',
        namespace: 'public',
        entity: 'User'
      };
      expect(getScopeKey(scope)).toBe('public:User');
    });

    it('should return "namespace:entity:id" for entity scope', () => {
      const scope: HistoryScope = {
        type: 'entity',
        namespace: 'public',
        entity: 'User',
        entityId: 'user-123' as UUID
      };
      expect(getScopeKey(scope)).toContain('public:User:rxid1:');
    });

    it('does not collide number, bigint and string entity scopes', () => {
      const keys = [1, 1n, '1'].map(entityId =>
        getScopeKey({ type: 'entity', namespace: 'public', entity: 'User', entityId })
      );
      expect(new Set(keys).size).toBe(3);
    });
  });

  describe('generateHistoryDescription', () => {
    it('should generate description for single INSERT', () => {
      const changes = [
        {
          type: 'INSERT',
          entity: 'User'
        } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('创建 User');
    });

    it('should generate description for single UPDATE', () => {
      const changes = [
        {
          type: 'UPDATE',
          entity: 'Todo'
        } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('更新 Todo');
    });

    it('should generate description for single DELETE', () => {
      const changes = [
        {
          type: 'DELETE',
          entity: 'Post'
        } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('删除 Post');
    });

    it('should generate transaction description for multiple changes', () => {
      const changes = [
        { type: 'INSERT', entity: 'User' } as RxDBChange,
        { type: 'INSERT', entity: 'Post' } as RxDBChange,
        { type: 'UPDATE', entity: 'User' } as RxDBChange,
        { type: 'UPDATE', entity: 'Post' } as RxDBChange,
        { type: 'UPDATE', entity: 'Comment' } as RxDBChange,
        { type: 'DELETE', entity: 'Tag' } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('事务: 创建2条, 更新3条, 删除1条');
    });

    it('should handle transaction with only inserts', () => {
      const changes = [
        { type: 'INSERT', entity: 'User' } as RxDBChange,
        { type: 'INSERT', entity: 'Post' } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('事务: 创建2条');
    });

    it('should handle transaction with only updates', () => {
      const changes = [
        { type: 'UPDATE', entity: 'User' } as RxDBChange,
        { type: 'UPDATE', entity: 'Post' } as RxDBChange,
        { type: 'UPDATE', entity: 'Comment' } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('事务: 更新3条');
    });

    it('should handle transaction with only deletes', () => {
      const changes = [
        { type: 'DELETE', entity: 'User' } as RxDBChange,
        { type: 'DELETE', entity: 'Post' } as RxDBChange
      ];
      expect(generateHistoryDescription(changes)).toBe('事务: 删除2条');
    });
  });

  describe('filterUndoableHistories', () => {
    const createHistoryWithChanges = (changes: Partial<RxDBChange>[]): HistoryItem => ({
      transactionId: null,
      changeId: 1,
      fingerprint: 'test',
      changes: changes.map(change => ({ namespace: 'public', ...change }) as RxDBChange),
      type: 'INSERT',
      count: changes.length,
      createdAt: new Date(),
      description: 'test',
      namespace: 'public',
      entity: 'User',
      reverted: changes.some(change => change.revertChangeId != null),
      redoInvalidated: false
    });

    it('should exclude histories whose changes were pulled from remote (remoteId != null)', () => {
      const histories = [
        createHistoryWithChanges([{ id: 10, entity: 'User', revertChangeId: null, remoteId: 99 }]),
        createHistoryWithChanges([{ id: 11, entity: 'User', revertChangeId: null, remoteId: null }])
      ];
      const result = filterUndoableHistories(histories, new Map());
      expect(result).toHaveLength(1);
      expect(result[0].changes[0].id).toBe(11);
    });

    it('should exclude reverted histories (revertChangeId != null)', () => {
      const histories = [
        createHistoryWithChanges([{ id: 10, entity: 'User', revertChangeId: 20, remoteId: null }]),
        createHistoryWithChanges([{ id: 11, entity: 'User', revertChangeId: null, remoteId: null }])
      ];
      const result = filterUndoableHistories(histories, new Map());
      expect(result).toHaveLength(1);
      expect(result[0].changes[0].id).toBe(11);
    });

    it('should apply lastPushedChangeId watermark per repository, not globally', () => {
      // User 已 push 到 id=15，Post 只 push 到 id=5
      const lastPushedMap = new Map<string, number>([
        ['public:User', 15],
        ['public:Post', 5]
      ]);
      const histories = [
        // User id=10 <= 15：已 push，不可撤销（全局最小水位线 5 会错误地放行它）
        createHistoryWithChanges([{ id: 10, entity: 'User', revertChangeId: null, remoteId: null }]),
        // Post id=10 > 5：未 push，可撤销
        createHistoryWithChanges([{ id: 10, entity: 'Post', revertChangeId: null, remoteId: null }]),
        // User id=16 > 15：未 push，可撤销
        createHistoryWithChanges([{ id: 16, entity: 'User', revertChangeId: null, remoteId: null }])
      ];
      const result = filterUndoableHistories(histories, lastPushedMap);
      expect(result).toHaveLength(2);
      expect(result.map(h => h.changes[0])).toEqual([
        expect.objectContaining({ id: 10, entity: 'Post' }),
        expect.objectContaining({ id: 16, entity: 'User' })
      ]);
    });

    it('should exclude a transaction if any of its changes is not undoable', () => {
      const histories = [
        createHistoryWithChanges([
          { id: 10, entity: 'User', revertChangeId: null, remoteId: null },
          { id: 11, entity: 'User', revertChangeId: null, remoteId: 99 }
        ])
      ];
      const result = filterUndoableHistories(histories, new Map());
      expect(result).toHaveLength(0);
    });
  });

  describe('filterHistoriesByScope', () => {
    const createMockHistory = (changes: Partial<RxDBChange>[]): HistoryItem => ({
      transactionId: null,
      changeId: 1,
      fingerprint: 'test',
      changes: changes as RxDBChange[],
      type: 'INSERT',
      count: changes.length,
      createdAt: new Date(),
      description: 'test',
      namespace: 'public',
      entity: 'User',
      reverted: false,
      redoInvalidated: false
    });

    it('should return all histories for database scope', () => {
      const histories = [
        createMockHistory([{ namespace: 'public', entity: 'User', entityId: '1' as UUID }]),
        createMockHistory([{ namespace: 'public', entity: 'Post', entityId: '2' as UUID }])
      ];
      const scope: HistoryScope = { type: 'database' };
      const result = filterHistoriesByScope(histories, scope);
      expect(result).toHaveLength(2);
    });

    it('should filter by repository scope', () => {
      const histories = [
        createMockHistory([{ namespace: 'public', entity: 'User', entityId: '1' as UUID }]),
        createMockHistory([{ namespace: 'public', entity: 'Post', entityId: '2' as UUID }]),
        createMockHistory([{ namespace: 'public', entity: 'User', entityId: '3' as UUID }])
      ];
      const scope: HistoryScope = {
        type: 'repository',
        namespace: 'public',
        entity: 'User'
      };
      const result = filterHistoriesByScope(histories, scope);
      expect(result).toHaveLength(2);
      expect(result[0].changes[0].entity).toBe('User');
      expect(result[1].changes[0].entity).toBe('User');
    });

    it('should filter by entity scope', () => {
      const histories = [
        createMockHistory([{ namespace: 'public', entity: 'User', entityId: 'user-1' as UUID }]),
        createMockHistory([{ namespace: 'public', entity: 'User', entityId: 'user-2' as UUID }]),
        createMockHistory([{ namespace: 'public', entity: 'User', entityId: 'user-1' as UUID }])
      ];
      const scope: HistoryScope = {
        type: 'entity',
        namespace: 'public',
        entity: 'User',
        entityId: 'user-1' as UUID
      };
      const result = filterHistoriesByScope(histories, scope);
      expect(result).toHaveLength(2);
      expect(result[0].changes[0].entityId).toBe('user-1');
      expect(result[1].changes[0].entityId).toBe('user-1');
    });

    it('should filter out histories with no matching changes', () => {
      const histories = [
        createMockHistory([
          { namespace: 'public', entity: 'User', entityId: '1' as UUID },
          { namespace: 'public', entity: 'Post', entityId: '2' as UUID }
        ]),
        createMockHistory([{ namespace: 'public', entity: 'Comment', entityId: '3' as UUID }])
      ];
      const scope: HistoryScope = {
        type: 'repository',
        namespace: 'public',
        entity: 'User'
      };
      const result = filterHistoriesByScope(histories, scope);
      expect(result).toHaveLength(1);
      expect(result[0].changes).toHaveLength(1);
      expect(result[0].changes[0].entity).toBe('User');
    });

    it('should update count and description after filtering', () => {
      const histories = [
        createMockHistory([
          { namespace: 'public', entity: 'User', entityId: '1' as UUID, type: 'INSERT' },
          { namespace: 'public', entity: 'Post', entityId: '2' as UUID, type: 'UPDATE' },
          { namespace: 'public', entity: 'User', entityId: '3' as UUID, type: 'DELETE' }
        ])
      ];
      const scope: HistoryScope = {
        type: 'repository',
        namespace: 'public',
        entity: 'User'
      };
      const result = filterHistoriesByScope(histories, scope);
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(2);
      expect(result[0].description).toBe('事务: 创建1条, 删除1条');
    });
  });
});

interface MutableHistoryManagerState {
  isUndoRedoInProgress: boolean;
  isInvalidatingRedo: boolean;
}

const getMutableHistoryManagerState = (manager: HistoryManager): MutableHistoryManagerState =>
  manager as unknown as MutableHistoryManagerState;

describe('HistoryManager - Class Methods', () => {
  let mockRxDB: RxDB;
  let mockBranchRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockChangeRepository: {
    count: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
  };
  let mockSyncFind: ReturnType<typeof vi.fn>;
  let mockSwitchBranch: ReturnType<typeof vi.fn>;
  let historyManager: HistoryManager;

  beforeEach(() => {
    const activeBranch = { id: 'main', activated: true };
    mockBranchRepository = {
      findOne: vi.fn().mockReturnValue(of(activeBranch)),
      find: vi.fn().mockResolvedValue([activeBranch])
    };

    mockChangeRepository = {
      count: vi.fn().mockReturnValue(of(0)),
      find: vi.fn().mockResolvedValue([]),
      findAll: vi.fn().mockReturnValue(of([]))
    };
    mockSyncFind = vi.fn().mockResolvedValue([]);
    mockSwitchBranch = vi.fn().mockResolvedValue(undefined);

    mockRxDB = {
      // RXD-034：pushableCount 的仓库集合来自 config.entities × syncType；
      // 缺了它 `#updatePushableCount` 会一路走进 catch，本文件关心的 undo/redo 路径
      // 虽然照样通过，但控制台会被降级日志刷屏，也掩盖了计数其实从未算过。
      config: {
        entities: [],
        sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
      },
      connected$: of(true),
      firstConnectedAt: new Date('2026-07-10T07:00:00.000Z'),
      localAdapter$: of({
        getRepository: vi.fn(entity => {
          if (entity === RxDBSync) {
            return { find: mockSyncFind };
          }
          return null;
        }),
        internalQuery: vi.fn().mockResolvedValue({ results: [{ rows: [null] }] })
      }),
      entityManager: {
        getRepository: vi.fn(entity => {
          if (entity === RxDBBranch) return mockBranchRepository;
          if (entity === RxDBChange) return mockChangeRepository;
          return null;
        })
      },
      versionManager: {
        getLocalRepositories: vi.fn().mockResolvedValue({
          branchRepository: mockBranchRepository,
          changeRepository: mockChangeRepository,
          adapter: {
            getRxDBChangeSequence: vi.fn().mockResolvedValue(100),
            switchBranch: mockSwitchBranch
          }
        }),
        getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main' })
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    historyManager = new HistoryManager(mockRxDB);
  });

  // 活跃分支流会因为 `RxDB.connect()` 失败而 error —— 活查询在就绪门上等的正是那个 promise。
  // HistoryManager 的两条内部订阅没有调用方可以把错误交回去，缺了 `error` 回调就会走 RxJS 的
  // `reportUnhandledError`：浏览器里是 window.onerror，Electron 里是一次未捕获异常，能把宿主打崩。
  describe('活跃分支流 error 时', () => {
    it('不升级成 RxJS 未捕获异常，但必须留痕', async () => {
      const reported: unknown[] = [];
      const originalOnUnhandledError = config.onUnhandledError;
      config.onUnhandledError = (error: unknown): void => {
        reported.push(error);
      };
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failure = new Error('connect failed');
      mockBranchRepository.findOne.mockReturnValue(throwError(() => failure));

      // 断言写在 try 里：`mockRestore` 会连着清掉调用记录，搬到 finally 之后就没得断言了。
      // 断言失败照样先走 finally 恢复现场，不会把 mock 漏给后面的用例。
      try {
        const manager = new HistoryManager(mockRxDB);
        // reportUnhandledError 走 setTimeout，必须让出一次宏任务才看得到
        await new Promise(resolve => setTimeout(resolve, 0));
        manager.destroy();

        expect(reported).toEqual([]);
        // 静默吞掉同样不可接受：连不上的原因必须能在日志里找到。
        expect(consoleError.mock.calls.flat()).toContain(failure);
      } finally {
        config.onUnhandledError = originalOnUnhandledError;
        consoleError.mockRestore();
      }
    });
  });

  describe('undo() 入口规则', () => {
    const createChange = (overrides: Partial<RxDBChange> = {}): RxDBChange =>
      ({
        id: 50,
        namespace: 'public',
        entity: 'User',
        entityId: 'user-1' as UUID,
        branchId: 'main',
        type: 'INSERT',
        patch: { name: 'Alice' },
        inversePatch: null,
        transactionId: null,
        remoteId: null,
        revertChangeId: null,
        redoInvalidatedAt: null,
        createdAt: new Date('2026-07-10T08:00:00.000Z'),
        updatedAt: new Date('2026-07-10T08:00:00.000Z'),
        ...overrides
      }) as unknown as RxDBChange;

    it('不应撤销当前 session 连接前的历史', async () => {
      const firstConnectedAt = new Date('2026-07-10T09:00:00.000Z');
      const oldChange = createChange({ createdAt: new Date('2026-07-10T08:00:00.000Z') });
      Object.defineProperty(mockRxDB, 'firstConnectedAt', { value: firstConnectedAt });
      mockChangeRepository.find.mockImplementation(
        async (query: { where: { rules: Array<{ field: string; value: unknown }> } }) => {
          const cutoff = query.where.rules.find(rule => rule.field === 'createdAt')?.value;
          return cutoff instanceof Date && oldChange.createdAt < cutoff ? [] : [oldChange];
        }
      );

      await historyManager.history().undo();

      expect(mockSwitchBranch).not.toHaveBeenCalled();
    });

    // Node 环境没有 navigator.locks，gateway 的 leader 选举走 BroadcastChannel 降级路径，
    // 500ms 宽限期内 rxdb.firstConnectedAt 一直是 undefined（multiInstance=false 时永远是）。
    // 此前的回退是「首次取用时刻的 new Date()」——首次取用若发生在 undo 里，
    // 本会话所有已落库的变更都早于该水位，undo 静默变成 no-op。
    it('firstConnectedAt 未就绪时，水位回退到构造时刻而非首次取用时刻', async () => {
      vi.useFakeTimers();
      try {
        const constructedAt = new Date('2026-07-10T09:00:00.000Z');
        vi.setSystemTime(constructedAt);
        Object.defineProperty(mockRxDB, 'firstConnectedAt', { value: undefined, configurable: true });
        const manager = new HistoryManager(mockRxDB);

        // 连接后立即写入的变更：晚于构造时刻，早于 undo 时刻
        const change = createChange({ createdAt: new Date('2026-07-10T09:00:00.100Z') });
        mockChangeRepository.find.mockImplementation(
          async (query: { where: { rules: Array<{ field: string; value: unknown }> } }) => {
            const cutoff = query.where.rules.find(rule => rule.field === 'createdAt')?.value;
            return cutoff instanceof Date && change.createdAt < cutoff ? [] : [change];
          }
        );

        // undo 发生在 10 秒后——水位若取「此刻」，上面那条变更会被过滤掉
        vi.setSystemTime(new Date('2026-07-10T09:00:10.000Z'));
        await manager.history().undo();
        manager.destroy();

        expect(mockSwitchBranch).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    // 变更表的 INSERT 通知要经宿主 debounce 与（Tauri 下）跨进程 stdio 传输，
    // save 的通知可能在 undo() 完成之后才到达。`isExecutingUndoRedo()` 是时间窗守卫，
    // 挡不住这类迟到者——迟到通知一旦触发 invalidateRedoStack，刚压入的 redo 栈就被清空，
    // 紧随其后的 redo() 静默空跑。判定必须基于内容：undo 已把 change 序列推进到
    // `seq + changes.length`，只有 id 越过该水位的事件才是真正的新写入。
    it('迟到的旧 change 事件不清空 redo 栈，越过水位的新写入才清空', async () => {
      const change = createChange();
      mockChangeRepository.find.mockResolvedValue([change]);

      await historyManager.history().undo();
      expect(mockSwitchBranch).toHaveBeenCalledTimes(1);
      expect(await firstValueFrom(historyManager.redoHistories$)).toHaveLength(1);

      // save 的迟到通知：id(50) ≤ undo 时的序列水位（seq=100 + 1 条 = 101）
      await historyManager.invalidateRedoStack([change.id]);
      expect(await firstValueFrom(historyManager.redoHistories$)).toHaveLength(1);

      // 真正的新写入：id 越过水位
      await historyManager.invalidateRedoStack([102]);
      expect(await firstValueFrom(historyManager.redoHistories$)).toHaveLength(0);
    });

    it('repository 水位线必须按 namespace + entity 隔离', async () => {
      mockSyncFind.mockResolvedValue([
        { namespace: 'public', entity: 'User', lastPushedChangeId: 100 },
        { namespace: 'tenant', entity: 'User', lastPushedChangeId: 0 }
      ]);
      mockChangeRepository.find.mockResolvedValue([createChange()]);

      await historyManager.history({ type: 'repository', namespace: 'public', entity: 'User' }).undo();

      expect(mockSwitchBranch).not.toHaveBeenCalled();
    });

    it('没有水位线的 repository 不应被其他 repository 的粗过滤误删', async () => {
      const change = createChange({ entity: 'Post', entityId: 'post-1' as UUID });
      mockSyncFind.mockResolvedValue([{ namespace: 'public', entity: 'User', lastPushedChangeId: 100 }]);
      mockChangeRepository.find.mockImplementation(
        async (query: { where: { rules: Array<{ field: string; value: unknown }> } }) => {
          const idFloor = query.where.rules.find(rule => rule.field === 'id')?.value;
          return typeof idFloor === 'number' && change.id <= idFloor ? [] : [change];
        }
      );

      await historyManager.history({ type: 'repository', namespace: 'public', entity: 'Post' }).undo();

      expect(mockSwitchBranch).toHaveBeenCalledTimes(1);
    });

    it('sync 清空后直接调用 undo() 也不应查询或应用历史', async () => {
      historyManager.clearUndoHistory();
      mockChangeRepository.find.mockResolvedValue([createChange()]);

      await historyManager.history().undo();

      expect(mockChangeRepository.find).not.toHaveBeenCalled();
      expect(mockSwitchBranch).not.toHaveBeenCalled();
    });

    it('查询历史期间发生 clear 时不应应用查询到的旧历史', async () => {
      let resolveQueryStarted!: () => void;
      let resolveChanges!: (changes: RxDBChange[]) => void;
      const queryStarted = new Promise<void>(resolve => {
        resolveQueryStarted = resolve;
      });

      mockChangeRepository.find.mockImplementation(
        () =>
          new Promise<RxDBChange[]>(resolve => {
            resolveChanges = resolve;
            resolveQueryStarted();
          })
      );

      const undo = historyManager.history().undo();
      await queryStarted;
      historyManager.clearUndoHistory();
      resolveChanges([createChange()]);
      await undo;

      expect(mockSwitchBranch).not.toHaveBeenCalled();
    });

    it('remote change 不能通过直接调用 undo() 被撤销', async () => {
      mockChangeRepository.find.mockResolvedValue([createChange({ remoteId: 99 })]);

      await historyManager.history().undo();

      expect(mockSwitchBranch).not.toHaveBeenCalled();
    });
  });

  describe('Undo/Redo consistency', () => {
    it('应在变更查询缓存延迟刷新时立即更新撤销状态', async () => {
      const now = new Date();
      const change = {
        id: 1,
        branchId: 'main',
        remoteId: null,
        transactionId: null,
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1' as UUID,
        type: 'INSERT' as const,
        patch: { title: 'todo' },
        inversePatch: null,
        createdAt: now,
        updatedAt: now,
        revertChangeId: null,
        redoInvalidatedAt: null,
        branch$: Object.assign(of(null), {
          set: vi.fn(),
          remove: vi.fn()
        })
      } satisfies RxDBChange;
      const cachedChanges$ = new BehaviorSubject<RxDBChange[]>([change]);
      mockChangeRepository.findAll.mockReturnValue(cachedChanges$);
      mockChangeRepository.find.mockResolvedValue([change]);

      const adapter = {
        getRxDBChangeSequence: vi.fn().mockResolvedValue(1),
        switchBranch: vi.fn().mockResolvedValue(undefined)
      };
      mockRxDB.versionManager.getLocalRepositories = vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter
      });

      const manager = new HistoryManager(mockRxDB);
      const history = manager.history();

      await expect(firstValueFrom(history.undoCount$.pipe(filter(count => count === 1)))).resolves.toBe(1);

      await history.undo();

      await expect(firstValueFrom(history.undoCount$.pipe(filter(count => count === 0)))).resolves.toBe(0);
      await expect(firstValueFrom(history.redoCount$)).resolves.toBe(1);
      await expect(firstValueFrom(history.histories$)).resolves.toEqual([expect.objectContaining({ reverted: true })]);

      await history.redo();

      await expect(firstValueFrom(history.undoCount$.pipe(filter(count => count === 1)))).resolves.toBe(1);
      await expect(firstValueFrom(history.redoCount$)).resolves.toBe(0);
      await expect(firstValueFrom(history.histories$)).resolves.toEqual([expect.objectContaining({ reverted: false })]);

      const delayedUndoState = firstValueFrom(history.histories$.pipe(skip(1)));
      cachedChanges$.next([{ ...change, revertChangeId: 2 }]);
      await expect(delayedUndoState).resolves.toEqual([expect.objectContaining({ reverted: false })]);

      const caughtUpRedoState = firstValueFrom(history.histories$.pipe(skip(1)));
      cachedChanges$.next([{ ...change, revertChangeId: null }]);
      await expect(caughtUpRedoState).resolves.toEqual([expect.objectContaining({ reverted: false })]);

      manager.destroy();
    });

    it('持久新快照后到达旧快照时不应恢复已撤销状态', async () => {
      const originalUpdatedAt = new Date('2100-01-01T00:00:00.000Z');
      const persistedUndoUpdatedAt = new Date(originalUpdatedAt.getTime() + 1);
      const externalRedoUpdatedAt = new Date(persistedUndoUpdatedAt.getTime() + 1);
      const change = {
        id: 1,
        branchId: 'main',
        remoteId: null,
        transactionId: null,
        namespace: 'public',
        entity: 'Todo',
        entityId: 'todo-1' as UUID,
        type: 'INSERT' as const,
        patch: { title: 'todo' },
        inversePatch: null,
        createdAt: originalUpdatedAt,
        updatedAt: originalUpdatedAt,
        revertChangeId: null,
        redoInvalidatedAt: null,
        branch$: Object.assign(of(null), {
          set: vi.fn(),
          remove: vi.fn()
        })
      } satisfies RxDBChange;
      const cachedChanges$ = new BehaviorSubject<RxDBChange[]>([change]);
      mockChangeRepository.findAll.mockReturnValue(cachedChanges$);
      mockChangeRepository.find.mockResolvedValue([change]);

      const adapter = {
        getRxDBChangeSequence: vi.fn().mockResolvedValue(1),
        switchBranch: vi.fn().mockResolvedValue(undefined)
      };
      mockRxDB.versionManager.getLocalRepositories = vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter
      });

      const manager = new HistoryManager(mockRxDB);
      const history = manager.history();
      let reverted = false;
      const subscription = history.histories$.subscribe(histories => {
        reverted = histories[0]?.reverted ?? false;
      });

      await expect(firstValueFrom(history.undoCount$.pipe(filter(count => count === 1)))).resolves.toBe(1);
      await history.undo();
      expect(reverted).toBe(true);
      const undoPatch = adapter.switchBranch.mock.calls[0][0].actions.updates.get('rxdb:RxDBChange:1').patch;
      expect(undoPatch.updatedAt).toEqual(persistedUndoUpdatedAt);

      cachedChanges$.next([{ ...change, revertChangeId: 2, updatedAt: persistedUndoUpdatedAt }]);
      expect(reverted).toBe(true);

      cachedChanges$.next([{ ...change, revertChangeId: null, updatedAt: originalUpdatedAt }]);
      expect(reverted).toBe(true);

      cachedChanges$.next([{ ...change, revertChangeId: null, updatedAt: externalRedoUpdatedAt }]);
      expect(reverted).toBe(false);

      cachedChanges$.next([{ ...change, revertChangeId: 2, updatedAt: persistedUndoUpdatedAt }]);
      expect(reverted).toBe(false);

      subscription.unsubscribe();
      manager.destroy();
    });
  });

  describe('Stack Operations', () => {
    it('should push items to redo stack', () => {
      const items: HistoryItem[] = [
        {
          transactionId: null,
          changeId: 1,
          fingerprint: 'test',
          changes: [],
          type: 'INSERT',
          count: 1,
          createdAt: new Date(),
          description: 'test',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        }
      ];

      historyManager.pushToRedoStack(items);

      historyManager.redoHistories$.subscribe(histories => {
        expect(histories).toHaveLength(1);
        expect(histories[0]).toBe(items[0]);
      });
    });

    it('should pop items from redo stack', () => {
      const items: HistoryItem[] = [
        {
          transactionId: null,
          changeId: 1,
          fingerprint: 'test1',
          changes: [],
          type: 'INSERT',
          count: 1,
          createdAt: new Date(),
          description: 'test1',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        },
        {
          transactionId: null,
          changeId: 2,
          fingerprint: 'test2',
          changes: [],
          type: 'UPDATE',
          count: 1,
          createdAt: new Date(),
          description: 'test2',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        }
      ];

      historyManager.pushToRedoStack(items);
      // RXD-063：按身份移除，而不是按数量截栈顶——这里特意移除**非栈顶**的 test2
      const removed = historyManager.removeFromRedoStack([items[1]]);

      expect(removed).toHaveLength(1);
      expect(removed[0].fingerprint).toBe('test2');

      historyManager.redoHistories$.subscribe(histories => {
        expect(histories).toHaveLength(1);
        expect(histories[0].fingerprint).toBe('test1');
      });
    });

    it('should clear redo stack', () => {
      const items: HistoryItem[] = [
        {
          transactionId: null,
          changeId: 1,
          fingerprint: 'test',
          changes: [],
          type: 'INSERT',
          count: 1,
          createdAt: new Date(),
          description: 'test',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        }
      ];

      historyManager.pushToRedoStack(items);
      historyManager.clearRedoStack();

      historyManager.redoHistories$.subscribe(histories => {
        expect(histories).toHaveLength(0);
      });
    });

    it('redo 栈超过上限 1000 时应丢弃最旧项（避免无界增长）', () => {
      const makeItem = (i: number): HistoryItem => ({
        transactionId: null,
        changeId: i,
        fingerprint: `item-${i}`,
        changes: [],
        type: 'INSERT',
        count: 1,
        createdAt: new Date(),
        description: `desc-${i}`,
        namespace: 'public',
        entity: 'User',
        reverted: false,
        redoInvalidated: false
      });

      // 一次性 push 超过上限的项（新项在前）
      const overflow: HistoryItem[] = Array.from({ length: 1100 }, (_, i) => makeItem(i));
      historyManager.pushToRedoStack(overflow);

      let finalLen = -1;
      let firstFingerprint = '';
      historyManager.redoHistories$.subscribe(histories => {
        finalLen = histories.length;
        firstFingerprint = histories[0]?.fingerprint ?? '';
      });

      expect(finalLen).toBe(1000);
      // 最新（首部）项必须保留
      expect(firstFingerprint).toBe('item-0');
    });
  });

  describe('errors$ subject', () => {
    it('应暴露 errors$ Subject 用于上层订阅内部失败', () => {
      expect(historyManager.errors$).toBeDefined();
      // 应能订阅（验证类型对，没有 narrow 到 undefined）
      const sub = historyManager.errors$.subscribe(() => undefined);
      expect(sub).toBeDefined();
      sub.unsubscribe();
    });
  });

  describe('Pullable Count', () => {
    it('should increment and reset pullable count', () => {
      let count = 0;
      historyManager.pullableCount$.subscribe(c => (count = c));

      expect(count).toBe(0);

      historyManager.incrementPullableCount(5);
      expect(count).toBe(5);

      historyManager.incrementPullableCount(3);
      expect(count).toBe(8);

      historyManager.resetPullableCount();
      expect(count).toBe(0);
    });
  });

  describe('isExecutingUndoRedo', () => {
    it('should return false initially', () => {
      expect(historyManager.isExecutingUndoRedo()).toBe(false);
    });
  });

  describe('invalidateRedoStack', () => {
    it('should skip if already executing undo/redo', async () => {
      // 模拟正在执行 undo/redo
      getMutableHistoryManagerState(historyManager).isUndoRedoInProgress = true;

      const items: HistoryItem[] = [
        {
          transactionId: null,
          changeId: 1,
          fingerprint: 'test',
          changes: [],
          type: 'INSERT',
          count: 1,
          createdAt: new Date(),
          description: 'test',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        }
      ];
      historyManager.pushToRedoStack(items);

      await historyManager.invalidateRedoStack();

      // redo 栈不应该被清空
      historyManager.redoHistories$.subscribe(histories => {
        expect(histories).toHaveLength(1);
      });

      getMutableHistoryManagerState(historyManager).isUndoRedoInProgress = false;
    });

    it('should skip if already invalidating', async () => {
      getMutableHistoryManagerState(historyManager).isInvalidatingRedo = true;

      const items: HistoryItem[] = [
        {
          transactionId: null,
          changeId: 1,
          fingerprint: 'test',
          changes: [],
          type: 'INSERT',
          count: 1,
          createdAt: new Date(),
          description: 'test',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        }
      ];
      historyManager.pushToRedoStack(items);

      await historyManager.invalidateRedoStack();

      historyManager.redoHistories$.subscribe(histories => {
        expect(histories).toHaveLength(1);
      });

      getMutableHistoryManagerState(historyManager).isInvalidatingRedo = false;
    });

    it('should skip if redo stack is empty', async () => {
      await historyManager.invalidateRedoStack();

      // 不应该抛出错误
      expect(true).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const items: HistoryItem[] = [
        {
          transactionId: null,
          changeId: 1,
          fingerprint: 'test',
          changes: [
            {
              id: 1,
              namespace: 'public',
              entity: 'User',
              entityId: 'user-1' as UUID,
              type: 'INSERT'
            } as unknown as RxDBChange
          ],
          type: 'INSERT',
          count: 1,
          createdAt: new Date(),
          description: 'test',
          namespace: 'public',
          entity: 'User',
          reverted: false,
          redoInvalidated: false
        }
      ];
      historyManager.pushToRedoStack(items);

      // 模拟 switchBranch 失败
      const mockAdapter = {
        getRxDBChangeSequence: vi.fn().mockResolvedValue(100),
        switchBranch: vi.fn().mockRejectedValue(new Error('Switch failed'))
      };
      mockRxDB.versionManager.getLocalRepositories = vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter: mockAdapter
      });

      await expect(historyManager.invalidateRedoStack()).rejects.toThrow('Switch failed');

      // 确保标志被重置
      expect(getMutableHistoryManagerState(historyManager).isInvalidatingRedo).toBe(false);
    });
  });

  /**
   * histories$ / count$ / undoHistories$ 等派生流用的是无 refCount 的 shareReplay(1)：
   * 一旦被订阅过，上游那条 RxDBChange 活查询就被永久固定，订阅者归零也不释放，
   * destroy() 也不碰它。VersionManager 销毁 / 断连重连每走一次就泄漏一条查询管道。
   */
  describe('destroy() 的订阅生命周期', () => {
    /** 可观测订阅与退订的 changeRepository.findAll 桩 */
    const trackFindAll = () => {
      const state = { subscribeCount: 0, teardownCount: 0 };
      const source = new Observable<RxDBChange[]>(subscriber => {
        state.subscribeCount++;
        subscriber.next([]);
        return () => {
          state.teardownCount++;
        };
      });
      mockChangeRepository.findAll.mockReturnValue(source);
      return state;
    };

    it('destroy() 必须断开上游 RxDBChange 活查询', () => {
      const tracked = trackFindAll();
      const manager = new HistoryManager(mockRxDB);
      const sub = manager.histories$.subscribe();

      expect(tracked.subscribeCount).toBe(1);
      expect(tracked.teardownCount).toBe(0);

      manager.destroy();

      expect(tracked.teardownCount).toBe(1);
      sub.unsubscribe();
    });

    it('订阅者归零后释放上游，而不是把首个查询永久钉在缓冲里', () => {
      const tracked = trackFindAll();
      const manager = new HistoryManager(mockRxDB);

      const first = manager.histories$.subscribe();
      expect(tracked.subscribeCount).toBe(1);
      first.unsubscribe();

      expect(tracked.teardownCount).toBe(1);
      manager.destroy();
    });

    it('destroy() 之后再订阅不得复活上游查询', () => {
      const tracked = trackFindAll();
      const manager = new HistoryManager(mockRxDB);

      manager.histories$.subscribe().unsubscribe();
      manager.destroy();
      const subscribeCountAfterDestroy = tracked.subscribeCount;

      manager.histories$.subscribe().unsubscribe();

      expect(tracked.subscribeCount).toBe(subscribeCountAfterDestroy);
    });
  });
});
