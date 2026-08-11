import { BehaviorSubject, EMPTY, firstValueFrom, Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType, UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { REPOSITORY_SYNC_COMPLETE_EVENT } from '../../rxdb-events.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import { convertChangesToHistories } from '../../version/history-item-builder.js';
import { filterUndoableHistories, HistoryManager } from '../../version/HistoryManager.js';
import { RxDBCrossScopeTransactionError } from '../../version/scope-selection.js';
import type { HistoryItem, HistoryScope, SwitchVersionActions } from '../../version/VersionManager.interface.js';
import { getRxDBChangeKey } from '../../version/VersionManager.utils.js';
import { Post, Tag, User } from '../fixtures/test-entities.js';

type QueryRule = {
  combinator?: 'and' | 'or';
  field?: string;
  operator?: string;
  rules?: QueryRule[];
  value?: unknown;
};

type QueryOptions = {
  orderBy?: Array<{ field: string; sort: string }>;
  where: {
    combinator: 'and' | 'or';
    rules: QueryRule[];
  };
};

type SwitchBranchInput = {
  actions: SwitchVersionActions;
  branchId: string;
};

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

type Harness = {
  activeBranch$: BehaviorSubject<RxDBBranch | null>;
  addEventListener: ReturnType<typeof vi.fn>;
  branchFind: ReturnType<typeof vi.fn>;
  branchFindOne: ReturnType<typeof vi.fn>;
  changeFind: ReturnType<typeof vi.fn>;
  connected$: BehaviorSubject<boolean>;
  getCurrentBranch: ReturnType<typeof vi.fn>;
  getLocalRepositories: ReturnType<typeof vi.fn>;
  getRepository: ReturnType<typeof vi.fn>;
  getRxDBChangeSequence: ReturnType<typeof vi.fn>;
  historyManager: HistoryManager;
  localAdapterGetRepository: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  repositorySyncComplete: () => void;
  rxdb: RxDB;
  switchBranch: ReturnType<typeof vi.fn>;
  syncFind: ReturnType<typeof vi.fn>;
};

const activeBranch = { id: 'main', activated: true } as RxDBBranch;
const firstConnectedAt = new Date('2026-07-10T08:00:00.000Z');
const managers = new Set<HistoryManager>();
let findAllMock: ReturnType<typeof vi.fn>;
let countMock: ReturnType<typeof vi.fn>;

const deferred = <T>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const createChange = (id: number, overrides: Partial<RxDBChange> = {}): RxDBChange =>
  ({
    id,
    namespace: 'public',
    entity: 'User',
    entityId: `entity-${id}` as UUID,
    branchId: 'main',
    transactionId: null,
    type: 'INSERT',
    patch: { value: id },
    inversePatch: null,
    remoteId: null,
    revertChangeId: null,
    redoInvalidatedAt: null,
    createdAt: new Date(firstConnectedAt.getTime() + id * 1000),
    updatedAt: new Date(firstConnectedAt.getTime() + id * 1000),
    ...overrides
  }) as RxDBChange;

const createHistory = (...changes: RxDBChange[]): HistoryItem => convertChangesToHistories(changes)[0];

const asQuery = (value: unknown): QueryOptions => value as QueryOptions;

const getRule = (query: QueryOptions, field: string): QueryRule | undefined =>
  query.where.rules.find(rule => rule.field === field);

/**
 * 只挂本地适配器的实体：`getSyncType` 判成 `'local'`，没有推送资格。
 * 用来验「可推送仓库集合」确实是筛过的，而不是「本地所有变更」（RXD-034）。
 */
@Entity({
  name: 'LocalOnlyNote',
  sync: { type: SyncType.None, local: { adapter: 'local' } },
  properties: [{ name: 'text', type: PropertyType.string }]
})
class LocalOnlyNote extends EntityBase {
  text!: string;
}

/** 三个实体都跟随全局 full sync，因此都可推送 */
const PUSHABLE_ENTITIES: EntityType[] = [User, Post, Tag];

const createHarness = (
  options: {
    branch?: RxDBBranch | null;
    connected?: boolean;
    entities?: EntityType[];
    firstConnectedAt?: Date;
  } = {}
): Harness => {
  const connected$ = new BehaviorSubject(options.connected ?? false);
  const activeBranch$ = new BehaviorSubject<RxDBBranch | null>(
    options.branch === undefined ? activeBranch : options.branch
  );
  const branchFindOne = vi.fn(() => activeBranch$.asObservable());
  const branchFind = vi.fn().mockResolvedValue(options.branch === null ? [] : [activeBranch]);
  const changeFind = vi.fn().mockResolvedValue([]);
  const syncFind = vi.fn().mockResolvedValue([]);
  const switchBranch = vi.fn().mockResolvedValue(undefined);
  const getRxDBChangeSequence = vi.fn().mockResolvedValue(100);
  const getCurrentBranch = vi.fn().mockResolvedValue(activeBranch);
  const listeners = new Map<string, () => void>();
  const addEventListener = vi.fn((type: string, listener: () => void) => {
    listeners.set(type, listener);
  });
  const removeEventListener = vi.fn((type: string, listener: () => void) => {
    if (listeners.get(type) === listener) listeners.delete(type);
  });
  const branchRepository = { find: branchFind, findOne: branchFindOne };
  const changeRepository = { count: countMock, find: changeFind, findAll: findAllMock };
  const adapter = { getRxDBChangeSequence, switchBranch };
  const getLocalRepositories = vi.fn().mockResolvedValue({ adapter, branchRepository, changeRepository });
  const syncRepository = { find: syncFind };
  const localAdapterGetRepository = vi.fn((entity: unknown) => (entity === RxDBSync ? syncRepository : null));
  const localAdapter = { getRepository: localAdapterGetRepository };
  const getRepository = vi.fn((entity: unknown) => {
    if (entity === RxDBBranch) return branchRepository;
    if (entity === RxDBChange) return changeRepository;
    return null;
  });
  const rxdb = {
    addEventListener,
    config: {
      // RXD-034：可推送仓库集合来自 config.entities × syncType，而不是「已有 RxDBSync 记录的仓库」
      entities: options.entities ?? PUSHABLE_ENTITIES,
      sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
    },
    connected$,
    entityManager: { getRepository },
    firstConnectedAt: options.firstConnectedAt,
    localAdapter$: of(localAdapter),
    removeEventListener,
    versionManager: { getCurrentBranch, getLocalRepositories }
  } as unknown as RxDB;
  const historyManager = new HistoryManager(rxdb);
  managers.add(historyManager);
  const repositorySyncComplete = () => {
    const listener = listeners.get(REPOSITORY_SYNC_COMPLETE_EVENT);
    if (!listener) throw new Error('repository sync listener missing');
    listener();
  };
  return {
    activeBranch$,
    addEventListener,
    branchFind,
    branchFindOne,
    changeFind,
    connected$,
    getCurrentBranch,
    getLocalRepositories,
    getRepository,
    getRxDBChangeSequence,
    historyManager,
    localAdapterGetRepository,
    removeEventListener,
    repositorySyncComplete,
    rxdb,
    switchBranch,
    syncFind
  };
};

beforeEach(() => {
  findAllMock = vi.fn().mockReturnValue(of([]));
  countMock = vi.fn().mockReturnValue(of(0));
});

afterEach(() => {
  for (const manager of managers) manager.destroy();
  managers.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('HistoryManager coverage', () => {
  describe('history streams', () => {
    it('emits histories, counts and repository-aware undo histories', async () => {
      const changes = [
        createChange(5),
        createChange(4, { entity: 'Post' }),
        createChange(3, { remoteId: 30 }),
        createChange(2, { revertChangeId: 20 }),
        createChange(1)
      ];
      findAllMock.mockReturnValue(of(changes));
      const harness = createHarness({ firstConnectedAt });
      harness.syncFind.mockResolvedValue([
        { branchId: 'main', entity: 'User', lastPushedChangeId: 1, namespace: 'public' },
        { branchId: 'main', entity: 'Post', lastPushedChangeId: null, namespace: 'public' }
      ]);

      const historiesPromise = firstValueFrom(harness.historyManager.histories$);
      const countPromise = firstValueFrom(harness.historyManager.count$);
      const undoPromise = firstValueFrom(harness.historyManager.undoHistories$);
      const undoCountPromise = firstValueFrom(harness.historyManager.undoCount$);
      harness.connected$.next(true);

      const [histories, count, undoHistories, undoCount] = await Promise.all([
        historiesPromise,
        countPromise,
        undoPromise,
        undoCountPromise
      ]);

      expect(histories.map(history => history.changeId)).toEqual([5, 4, 3, 2, 1]);
      expect(count).toBe(5);
      expect(undoHistories.map(history => history.changeId)).toEqual([5, 4]);
      expect(undoCount).toBe(2);
      expect(harness.syncFind).toHaveBeenCalled();
    });

    it('returns no undo histories when there is no active branch', async () => {
      countMock.mockReturnValue(EMPTY);
      findAllMock.mockReturnValue(of([createChange(1)]));
      const harness = createHarness({ firstConnectedAt });
      harness.branchFindOne.mockReturnValueOnce(of(null));
      const undoPromise = firstValueFrom(harness.historyManager.undoHistories$);

      harness.connected$.next(true);

      await expect(undoPromise).resolves.toEqual([]);
      expect(harness.syncFind).not.toHaveBeenCalled();
    });

    it.each([
      ['Error', new Error('sync lookup failed')],
      ['non-Error', 'sync lookup failed']
    ])('normalizes %s failures through errors$', async (_label, failure) => {
      countMock.mockReturnValue(EMPTY);
      findAllMock.mockReturnValue(of([createChange(1)]));
      const harness = createHarness({ firstConnectedAt });
      harness.syncFind.mockRejectedValue(failure);
      const errors: Error[] = [];
      harness.historyManager.errors$.subscribe(error => errors.push(error));
      const undoPromise = firstValueFrom(harness.historyManager.undoHistories$);

      harness.connected$.next(true);

      await expect(undoPromise).resolves.toEqual([]);
      await vi.waitFor(() => expect(errors).toHaveLength(1));
      expect(errors[0]).toBeInstanceOf(Error);
      expect(errors[0].message).toBe('sync lookup failed');
    });

    it('uses a stable generated session cutoff when firstConnectedAt is absent', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T10:00:00.000Z'));
      findAllMock.mockReturnValue(of([]));
      const harness = createHarness();
      const subscription = harness.historyManager.histories$.subscribe();

      harness.connected$.next(true);
      await vi.waitFor(() => expect(findAllMock).toHaveBeenCalledTimes(1));
      vi.setSystemTime(new Date('2026-07-10T11:00:00.000Z'));
      harness.activeBranch$.next({ id: 'other', activated: true } as RxDBBranch);
      await vi.waitFor(() => expect(findAllMock).toHaveBeenCalledTimes(2));

      const firstQuery = asQuery(findAllMock.mock.calls[0][0]);
      const secondQuery = asQuery(findAllMock.mock.calls[1][0]);
      expect(getRule(firstQuery, 'createdAt')?.value).toEqual(new Date('2026-07-10T10:00:00.000Z'));
      expect(getRule(secondQuery, 'createdAt')?.value).toBe(getRule(firstQuery, 'createdAt')?.value);
      expect(getRule(secondQuery, 'branchId')?.value).toBe('other');
      subscription.unsubscribe();
    });
  });

  describe('history scopes and cache lifetime', () => {
    it('creates database, repository and entity scopes from every supported input form', () => {
      const harness = createHarness();
      const database = harness.historyManager.history();
      const explicitDatabase = harness.historyManager.history({ type: 'database' });
      const repository = harness.historyManager.history(RxDBChange);
      const instance = Object.create(RxDBChange.prototype) as RxDBChange;
      Object.defineProperty(instance, 'id', { value: 42 });
      const entity = harness.historyManager.history(instance);
      const zeroIdInstance = Object.create(RxDBChange.prototype) as RxDBChange;
      Object.defineProperty(zeroIdInstance, 'id', { value: 0 });
      const zeroId = harness.historyManager.history(zeroIdInstance);
      const metadata = getEntityMetadata(RxDBChange);

      expect(database).toBe(explicitDatabase);
      expect(database.type).toBe('database');
      expect(repository.type).toBe('repository');
      expect(entity.type).toBe('entity');
      expect(zeroId.type).toBe('entity');
      expect(harness.historyManager.history(RxDBChange)).toBe(repository);
      expect(
        harness.historyManager.history({
          entity: metadata.name,
          namespace: metadata.namespace,
          type: 'repository'
        })
      ).toBe(repository);
    });

    it('keeps a cached scope until its final subscription is released', () => {
      const harness = createHarness();
      const scope = { entity: 'User', namespace: 'public', type: 'repository' } as const;
      const first = harness.historyManager.history(scope);
      const firstSubscription = first.redoHistories$.subscribe();
      const secondSubscription = first.redoHistories$.subscribe();

      firstSubscription.unsubscribe();
      expect(harness.historyManager.history(scope)).toBe(first);
      secondSubscription.unsubscribe();

      expect(harness.historyManager.history(scope)).not.toBe(first);
    });

    it('filters all scoped streams and their counts through the same scope', async () => {
      const transactionId = 'transaction-1' as UUID;
      const userChanges = [
        createChange(4, { transactionId, type: 'INSERT' }),
        createChange(3, { entity: 'Post', transactionId, type: 'UPDATE' }),
        createChange(2, { transactionId, type: 'DELETE' })
      ];
      const changes = [...userChanges, createChange(1, { entity: 'Post' })];
      findAllMock.mockReturnValue(of(changes));
      const harness = createHarness({ firstConnectedAt });
      harness.historyManager.pushToRedoStack(convertChangesToHistories(changes));
      const scope = harness.historyManager.history({ entity: 'User', namespace: 'public', type: 'repository' });

      const historiesPromise = firstValueFrom(scope.histories$);
      const undoHistoriesPromise = firstValueFrom(scope.undoHistories$);
      const redoHistoriesPromise = firstValueFrom(scope.redoHistories$);
      const countPromise = firstValueFrom(scope.count$);
      const undoCountPromise = firstValueFrom(scope.undoCount$);
      const redoCountPromise = firstValueFrom(scope.redoCount$);
      harness.connected$.next(true);

      const [histories, undoHistories, redoHistories, count, undoCount, redoCount] = await Promise.all([
        historiesPromise,
        undoHistoriesPromise,
        redoHistoriesPromise,
        countPromise,
        undoCountPromise,
        redoCountPromise
      ]);

      expect(histories).toHaveLength(1);
      expect(histories[0].changes.map(change => change.id)).toEqual([4, 2]);
      expect(histories[0].count).toBe(2);
      expect(histories[0].description).toBe('事务: 创建1条, 删除1条');
      expect(undoHistories).toEqual(histories);
      expect(redoHistories).toEqual(histories);
      expect([count, undoCount, redoCount]).toEqual([1, 1, 1]);
    });

    it('honors explicit entity scopes', async () => {
      findAllMock.mockReturnValue(of([createChange(2), createChange(1)]));
      const harness = createHarness({ firstConnectedAt });
      const scope = harness.historyManager.history({
        entity: 'User',
        entityId: 'entity-1',
        namespace: 'public',
        type: 'entity'
      });
      const historiesPromise = firstValueFrom(scope.histories$);

      harness.connected$.next(true);

      await expect(historiesPromise).resolves.toEqual([expect.objectContaining({ changeId: 1 })]);
    });
  });

  describe('sync boundaries', () => {
    it('hides old undo history until a valid post-clear id establishes a permanent boundary', async () => {
      const changes = [createChange(10), createChange(9), createChange(8)];
      findAllMock.mockReturnValue(of(changes));
      const harness = createHarness({ firstConnectedAt });
      let undoHistories: HistoryItem[] = [];
      let redoHistories: HistoryItem[] = [];
      const undoSubscription = harness.historyManager.undoHistories$.subscribe(value => {
        undoHistories = value;
      });
      const redoSubscription = harness.historyManager.redoHistories$.subscribe(value => {
        redoHistories = value;
      });
      harness.connected$.next(true);
      await vi.waitFor(() => expect(undoHistories).toHaveLength(3));
      harness.historyManager.pushToRedoStack([createHistory(createChange(20))]);
      await vi.waitFor(() => expect(redoHistories).toHaveLength(1));

      harness.historyManager.clearUndoHistory();
      await vi.waitFor(() => expect(undoHistories).toEqual([]));
      expect(redoHistories).toEqual([]);
      harness.historyManager.resetSyncCleared();
      harness.historyManager.resetSyncCleared([0, -1, 1.5, Number.NaN]);
      expect(undoHistories).toEqual([]);

      harness.historyManager.resetSyncCleared([10, 9]);
      await vi.waitFor(() => expect(undoHistories.map(history => history.changeId)).toEqual([10, 9]));
      harness.historyManager.resetSyncCleared([11]);
      expect(undoHistories.map(history => history.changeId)).toEqual([10, 9]);

      harness.historyManager.clearUndoHistory();
      harness.historyManager.resetSyncCleared([5]);
      await vi.waitFor(() => expect(undoHistories.map(history => history.changeId)).toEqual([10, 9]));
      undoSubscription.unsubscribe();
      redoSubscription.unsubscribe();
    });

    it('filters the permanent boundary in the pure undoability predicate', () => {
      const histories = [
        createHistory(createChange(3)),
        createHistory(createChange(2)),
        createHistory(createChange(1)),
        { ...createHistory(createChange(4)), changes: [] }
      ];

      expect(filterUndoableHistories(histories, new Map(), 2).map(history => history.changeId)).toEqual([3, 4]);
    });
  });

  describe('undo and redo execution', () => {
    it('applies real undo and redo actions, metadata and stack transitions', async () => {
      const changes = [
        createChange(3, { entityId: 'inserted' as UUID, type: 'INSERT' }),
        createChange(2, {
          entity: 'RxDBChange',
          entityId: '2' as UUID,
          inversePatch: { value: 1 },
          namespace: 'rxdb',
          patch: { value: 2 },
          type: 'UPDATE'
        }),
        createChange(1, {
          entityId: 'deleted' as UUID,
          inversePatch: { value: 1 },
          patch: null,
          type: 'DELETE'
        })
      ];
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue(changes);
      const api = harness.historyManager.history();

      await api.undo(3);

      expect(harness.switchBranch).toHaveBeenCalledTimes(1);
      const undoCall = harness.switchBranch.mock.calls[0][0] as SwitchBranchInput;
      expect(undoCall.branchId).toBe('main');
      expect(undoCall.actions.updateRxDBChangeSequence).toBe(103);
      expect(undoCall.actions.updates.get('rxdb:RxDBChange:3')?.patch).toEqual(
        expect.objectContaining({ revertChangeId: 101, revertChangedAt: expect.any(Date) })
      );
      expect(undoCall.actions.updates.get('rxdb:RxDBChange:2')?.patch).toEqual(
        expect.objectContaining({ revertChangeId: 102 })
      );
      expect(undoCall.actions.updates.get(getRxDBChangeKey(changes[1]))?.patch).toEqual({ value: 1 });
      expect(undoCall.actions.updates.get('rxdb:RxDBChange:1')?.patch).toEqual(
        expect.objectContaining({ revertChangeId: 103 })
      );
      await expect(firstValueFrom(harness.historyManager.redoCount$)).resolves.toBe(3);

      await api.redo(3);

      expect(harness.switchBranch).toHaveBeenCalledTimes(2);
      const redoCall = harness.switchBranch.mock.calls[1][0] as SwitchBranchInput;
      expect(redoCall.actions.updates.get('rxdb:RxDBChange:1')?.patch).toEqual(
        expect.objectContaining({ revertChangeId: null })
      );
      expect(redoCall.actions.updates.get('rxdb:RxDBChange:2')?.patch).toEqual(
        expect.objectContaining({ revertChangeId: null })
      );
      expect(redoCall.actions.updates.get(getRxDBChangeKey(changes[1]))?.patch).toEqual({ value: 2 });
      expect(redoCall.actions.updates.get('rxdb:RxDBChange:3')?.patch).toEqual(
        expect.objectContaining({ revertChangeId: null })
      );
      await expect(firstValueFrom(harness.historyManager.redoCount$)).resolves.toBe(0);
    });

    it('uses the default single step and skips zero-step or empty operations', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue([createChange(2), createChange(1)]);
      const api = harness.historyManager.history();

      await api.undo(0);
      expect(harness.switchBranch).not.toHaveBeenCalled();
      await api.undo();
      expect(harness.switchBranch).toHaveBeenCalledTimes(1);
      await api.redo();
      expect(harness.switchBranch).toHaveBeenCalledTimes(2);
      await api.redo();
      expect(harness.switchBranch).toHaveBeenCalledTimes(2);
    });

    it('skips undo when no active branch can be fetched', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.branchFind.mockResolvedValue([]);

      await harness.historyManager.history().undo();

      expect(harness.changeFind).not.toHaveBeenCalled();
      expect(harness.switchBranch).not.toHaveBeenCalled();
    });

    it('adds the permanent boundary to direct undo queries', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue([createChange(11)]);
      harness.historyManager.clearUndoHistory();
      harness.historyManager.resetSyncCleared([11]);

      await harness.historyManager.history().undo();

      const query = asQuery(harness.changeFind.mock.calls[0][0]);
      expect(getRule(query, 'id')).toEqual({ field: 'id', operator: '>', value: 10 });
    });

    it('cancels an undo that crosses the second generation check', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue([createChange(1)]);
      const currentBranch = deferred<RxDBBranch>();
      harness.getCurrentBranch.mockReturnValue(currentBranch.promise);

      const undo = harness.historyManager.history().undo();
      await vi.waitFor(() => expect(harness.getCurrentBranch).toHaveBeenCalled());
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(true);
      harness.historyManager.clearUndoHistory();
      currentBranch.resolve(activeBranch);
      await undo;

      expect(harness.switchBranch).not.toHaveBeenCalled();
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(false);
    });

    it('resets execution state and keeps the operation queue usable after failure', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue([createChange(1)]);
      harness.getRxDBChangeSequence.mockRejectedValueOnce(new Error('sequence failed'));
      const api = harness.historyManager.history();

      await expect(api.undo()).rejects.toThrow('sequence failed');
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(false);
      harness.getRxDBChangeSequence.mockResolvedValue(100);
      await api.undo();

      expect(harness.switchBranch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-scope transaction boundaries (RXD-026)', () => {
    const USER_SCOPE: HistoryScope = { entity: 'User', namespace: 'public', type: 'repository' };
    /** 同一个事务同时改了 public:User 和 public:Post */
    const crossScopeTransaction = (): RxDBChange[] => [
      createChange(2, { transactionId: 'tx-1' as UUID }),
      createChange(1, { entity: 'Post', entityId: 'post-1' as UUID, transactionId: 'tx-1' as UUID })
    ];

    it('refuses a scoped undo that would revert only part of a transaction', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue(crossScopeTransaction());

      await expect(harness.historyManager.history(USER_SCOPE).undo()).rejects.toBeInstanceOf(
        RxDBCrossScopeTransactionError
      );
      expect(harness.switchBranch).not.toHaveBeenCalled();
    });

    it('reverts the whole transaction from the database scope', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue(crossScopeTransaction());

      await harness.historyManager.history().undo();

      const call = harness.switchBranch.mock.calls[0][0] as SwitchBranchInput;
      expect(call.actions.updates.has('rxdb:RxDBChange:2')).toBe(true);
      expect(call.actions.updates.has('rxdb:RxDBChange:1')).toBe(true);
    });

    it('applies a transaction that stays inside the scope', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue([
        createChange(2, { transactionId: 'tx-1' as UUID }),
        createChange(1, { entityId: 'user-2' as UUID, transactionId: 'tx-1' as UUID })
      ]);

      await harness.historyManager.history(USER_SCOPE).undo();

      const call = harness.switchBranch.mock.calls[0][0] as SwitchBranchInput;
      expect(call.actions.updates.has('rxdb:RxDBChange:2')).toBe(true);
      expect(call.actions.updates.has('rxdb:RxDBChange:1')).toBe(true);
    });

    it('rejects before applying anything when a later step crosses the scope', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.changeFind.mockResolvedValue([createChange(3), ...crossScopeTransaction()]);

      await expect(harness.historyManager.history(USER_SCOPE).undo(2)).rejects.toBeInstanceOf(
        RxDBCrossScopeTransactionError
      );
      expect(harness.switchBranch).not.toHaveBeenCalled();
    });

    it('refuses a scoped redo that would replay only part of a transaction', async () => {
      const harness = createHarness({ firstConnectedAt });
      harness.historyManager.pushToRedoStack([createHistory(...crossScopeTransaction())]);

      await expect(harness.historyManager.history(USER_SCOPE).redo()).rejects.toBeInstanceOf(
        RxDBCrossScopeTransactionError
      );
      expect(harness.switchBranch).not.toHaveBeenCalled();
      await expect(firstValueFrom(harness.historyManager.redoCount$)).resolves.toBe(1);
    });
  });

  describe('branch-scoped undo sessions (RXD-026)', () => {
    const featureBranch = { activated: true, id: 'feature' } as RxDBBranch;

    it('clears undo history only on the branch that synced', async () => {
      findAllMock.mockReturnValue(of([createChange(3), createChange(2)]));
      const harness = createHarness({ connected: true, firstConnectedAt });

      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toHaveLength(2);

      harness.historyManager.clearUndoHistory();
      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toEqual([]);

      harness.activeBranch$.next(featureBranch);
      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toHaveLength(2);

      harness.activeBranch$.next(activeBranch);
      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toEqual([]);
    });

    it('clears every branch when the whole session is reset', async () => {
      findAllMock.mockReturnValue(of([createChange(3), createChange(2)]));
      const harness = createHarness({ connected: true, firstConnectedAt });
      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toHaveLength(2);

      harness.historyManager.clearAllUndoHistory();

      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toEqual([]);
      harness.activeBranch$.next(featureBranch);
      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toEqual([]);
    });

    it('keeps a per-branch boundary when the other branch recovers its session', async () => {
      findAllMock.mockReturnValue(of([createChange(3), createChange(2)]));
      const harness = createHarness({ connected: true, firstConnectedAt });
      harness.historyManager.clearUndoHistory();
      // 只恢复 main 的 session；feature 从未被清空，本来就该是完整的
      harness.historyManager.resetSyncCleared([3]);

      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toHaveLength(1);
      harness.activeBranch$.next(featureBranch);
      await expect(firstValueFrom(harness.historyManager.undoHistories$)).resolves.toHaveLength(2);
    });

    it('never reuses an undo session generation across branches', () => {
      const harness = createHarness({ connected: true, firstConnectedAt });
      const seen = new Set<number>([harness.historyManager.undoSessionGeneration]);

      harness.historyManager.clearUndoHistory();
      seen.add(harness.historyManager.undoSessionGeneration);
      harness.activeBranch$.next(featureBranch);
      seen.add(harness.historyManager.undoSessionGeneration);
      harness.historyManager.clearUndoHistory();
      seen.add(harness.historyManager.undoSessionGeneration);

      expect(seen.size).toBe(4);
    });
  });

  describe('serialized state changes', () => {
    it('reports syncing state for fulfilled and rejected work', async () => {
      const harness = createHarness();
      const success = deferred<string>();
      const successResult = harness.historyManager.syncing(() => success.promise);
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(true);
      success.resolve('done');
      await expect(successResult).resolves.toBe('done');
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(false);

      const failure = deferred<string>();
      const failureResult = harness.historyManager.syncing(() => failure.promise);
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(true);
      failure.reject(new Error('sync failed'));
      await expect(failureResult).rejects.toThrow('sync failed');
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(false);
    });

    it('keeps syncing state true while a second overlapping sync is still in flight (RXD-027)', async () => {
      const harness = createHarness();
      const first = deferred<string>();
      const second = deferred<string>();

      const firstResult = harness.historyManager.syncing(() => first.promise);
      const secondResult = harness.historyManager.syncing(() => second.promise);
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(true);

      first.resolve('first-done');
      await firstResult;
      // 第二个同步仍未完成，标志不能被先结束的第一个提前清掉
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(true);

      second.resolve('second-done');
      await secondResult;
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(false);
    });

    it('invalidates every redo change and clears the stack after switch succeeds', async () => {
      const harness = createHarness();
      const switchResult = deferred<void>();
      harness.switchBranch.mockReturnValue(switchResult.promise);
      const transactionId = 'transaction-2' as UUID;
      harness.historyManager.pushToRedoStack([
        createHistory(createChange(2, { transactionId }), createChange(1, { transactionId }))
      ]);

      const invalidation = harness.historyManager.invalidateRedoStack();
      await vi.waitFor(() => expect(harness.switchBranch).toHaveBeenCalledTimes(1));
      expect(harness.historyManager.isExecutingUndoRedo()).toBe(true);
      const input = harness.switchBranch.mock.calls[0][0] as SwitchBranchInput;
      const firstPatch = input.actions.updates.get('rxdb:RxDBChange:2');
      const secondPatch = input.actions.updates.get('rxdb:RxDBChange:1');
      const redoInvalidatedAt = firstPatch?.patch?.redoInvalidatedAt;
      expect(redoInvalidatedAt).toBeInstanceOf(Date);
      expect(secondPatch?.patch?.redoInvalidatedAt).toBe(redoInvalidatedAt);
      expect(firstPatch?.inversePatch).toEqual({ redoInvalidatedAt: null });
      switchResult.resolve(undefined);
      await invalidation;

      expect(harness.historyManager.isExecutingUndoRedo()).toBe(false);
      await expect(firstValueFrom(harness.historyManager.redoCount$)).resolves.toBe(0);
    });

    it('serializes concurrent invalidations and lets a later task run after rejection', async () => {
      const harness = createHarness();
      harness.historyManager.pushToRedoStack([createHistory(createChange(1))]);
      const firstSwitch = deferred<void>();
      harness.switchBranch.mockReturnValueOnce(firstSwitch.promise);

      const first = harness.historyManager.invalidateRedoStack();
      const queued = harness.historyManager.invalidateRedoStack();
      await vi.waitFor(() => expect(harness.switchBranch).toHaveBeenCalledTimes(1));
      firstSwitch.resolve(undefined);
      await Promise.all([first, queued]);
      expect(harness.switchBranch).toHaveBeenCalledTimes(1);

      harness.historyManager.pushToRedoStack([createHistory(createChange(2))]);
      harness.switchBranch.mockRejectedValueOnce(new Error('switch failed'));
      await expect(harness.historyManager.invalidateRedoStack()).rejects.toThrow('switch failed');
      harness.switchBranch.mockResolvedValue(undefined);
      await harness.historyManager.invalidateRedoStack();
      expect(harness.switchBranch).toHaveBeenCalledTimes(3);
    });
  });

  describe('pushable and pullable counts', () => {
    it('updates and resets pullable counts', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(2);
      harness.historyManager.incrementPullableCount(3);
      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(5);
      harness.historyManager.resetPullableCount();
      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(0);
    });

    it('zeroes the pullable count only for a complete, uncontended pull', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(5);

      const token = harness.historyManager.beginPullableSettlement();
      harness.historyManager.settlePullableCount(token, { complete: true, pulled: 5 });

      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(0);
    });

    it('replaces pullable count with the persistent watermark result', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(2);
      const token = harness.historyManager.beginPullableSettlement();

      harness.historyManager.reconcilePullableCount(token, 5);

      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(5);
    });

    it('does not overwrite realtime events that arrive during watermark refresh', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(2);
      const token = harness.historyManager.beginPullableSettlement();
      harness.historyManager.incrementPullableCount(4);

      harness.historyManager.reconcilePullableCount(token, 5);

      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(6);
    });

    it('subtracts instead of zeroing when the pull was partial', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(5);

      const token = harness.historyManager.beginPullableSettlement();
      harness.historyManager.settlePullableCount(token, { complete: false, pulled: 2 });

      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(3);
    });

    // 结算令牌就是给这种情况准备的：pull 期间又收到远端事件，说明快照之后还有新变更，
    // 哪怕这次 pull 本身是完整的，也不能把它们一起抹掉。
    it('keeps events that arrived during a complete pull', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(5);
      const token = harness.historyManager.beginPullableSettlement();

      harness.historyManager.incrementPullableCount(4);
      harness.historyManager.settlePullableCount(token, { complete: true, pulled: 5 });

      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(4);
    });

    it('never drives the pullable count below zero', async () => {
      const harness = createHarness();
      harness.historyManager.incrementPullableCount(1);

      const token = harness.historyManager.beginPullableSettlement();
      harness.historyManager.settlePullableCount(token, { complete: false, pulled: 9 });

      await expect(firstValueFrom(harness.historyManager.pullableCount$)).resolves.toBe(0);
    });

    it('leaves pushable count at zero while disconnected', async () => {
      const harness = createHarness();
      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(0);
      await Promise.resolve();
      expect(harness.localAdapterGetRepository).not.toHaveBeenCalled();
    });

    it('returns zero when a refresh cannot find an active branch', async () => {
      const harness = createHarness({ branch: null });
      harness.connected$.next(true);
      harness.repositorySyncComplete();
      await vi.waitFor(() => expect(harness.branchFindOne).toHaveBeenCalled());
      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(0);
    });

    // RXD-034：旧实现在「没有同步记录」时退化成统计**全部**本地变更，把 local-only 实体也算了进去；
    // 有记录时又只按记录构造 OR 组，没记录的仓库整个被漏掉。两条分支的口径互相矛盾。
    // 正确的集合恒等于「当前配置里有推送资格的实体」，记录只提供水位线。
    it('counts every pushable repository even when no sync record exists yet', async () => {
      countMock.mockReturnValueOnce(of(0)).mockReturnValue(of(7));
      const harness = createHarness({ entities: [User, LocalOnlyNote] });

      harness.connected$.next(true);

      await vi.waitFor(async () => {
        await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(7);
      });
      const query = asQuery(countMock.mock.calls.at(-1)?.[0]);
      expect(query.where.rules.slice(0, 3)).toEqual([
        { field: 'branchId', operator: '=', value: 'main' },
        { field: 'revertChangeId', operator: '=', value: null },
        { field: 'remoteId', operator: '=', value: null }
      ]);
      // 没有水位线 ⇒ 无上界，只按 namespace + entity 圈定；LocalOnlyNote 不可推送，不进 OR 组
      expect(query.where.rules.at(-1)).toEqual({
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'namespace', operator: '=', value: 'public' },
              { field: 'entity', operator: '=', value: 'User' }
            ]
          }
        ]
      });
    });

    it('keeps repositories without a sync record alongside those that have one', async () => {
      countMock.mockReturnValueOnce(of(0)).mockReturnValue(of(4));
      const harness = createHarness();
      // 只有 User 同步过；Post / Tag 一次都没推过，因此没有记录 —— 旧实现会把它们整体漏算
      harness.syncFind.mockResolvedValue([
        { branchId: 'main', entity: 'User', lastPushedChangeId: 12, namespace: 'public' }
      ]);

      harness.connected$.next(true);

      await vi.waitFor(async () => {
        await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(4);
      });
      const repositories = asQuery(countMock.mock.calls.at(-1)?.[0]).where.rules.at(-1);
      expect(repositories?.combinator).toBe('or');
      expect(repositories?.rules).toHaveLength(3);
      expect(repositories?.rules?.[0].rules).toContainEqual({ field: 'id', operator: '>', value: 12 });
      expect(repositories?.rules?.[1].rules).toHaveLength(2);
      expect(repositories?.rules?.[2].rules).toHaveLength(2);
    });

    it('treats null and undefined watermarks as unbounded', async () => {
      countMock.mockReturnValueOnce(of(0)).mockReturnValue(of(4));
      const harness = createHarness();
      harness.syncFind.mockResolvedValue([
        { branchId: 'main', entity: 'User', lastPushedChangeId: 12, namespace: 'public' },
        { branchId: 'main', entity: 'Post', lastPushedChangeId: null, namespace: 'public' },
        { branchId: 'main', entity: 'Tag', lastPushedChangeId: undefined, namespace: 'public' }
      ]);

      harness.connected$.next(true);

      await vi.waitFor(async () => {
        await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(4);
      });
      const repositories = asQuery(countMock.mock.calls.at(-1)?.[0]).where.rules.at(-1);
      expect(repositories?.rules?.[0].rules).toContainEqual({ field: 'id', operator: '>', value: 12 });
      expect(repositories?.rules?.[1].rules).toHaveLength(2);
      expect(repositories?.rules?.[2].rules).toHaveLength(2);
    });

    // RXD-029 把 `enabled` 定成一票否决；计数得跟着走，否则界面报「有 N 条待推」而 push 一条都不会发。
    it('drops repositories whose sync record is disabled', async () => {
      countMock.mockReturnValueOnce(of(0)).mockReturnValue(of(5));
      const harness = createHarness({ entities: [User, Post] });
      harness.syncFind.mockResolvedValue([
        { branchId: 'main', enabled: false, entity: 'User', lastPushedChangeId: 12, namespace: 'public' }
      ]);

      harness.connected$.next(true);

      await vi.waitFor(async () => {
        await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(5);
      });
      const repositories = asQuery(countMock.mock.calls.at(-1)?.[0]).where.rules.at(-1);
      expect(repositories?.rules).toHaveLength(1);
      expect(repositories?.rules?.[0].rules).toContainEqual({ field: 'entity', operator: '=', value: 'Post' });
    });

    it('publishes zero without querying when nothing is pushable', async () => {
      countMock.mockReturnValue(of(99));
      const harness = createHarness({ entities: [LocalOnlyNote] });

      harness.connected$.next(true);
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalled());
      await Promise.resolve();

      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(0);
      // 只剩订阅自己那次 count；空集合没有理由再发一次统计查询
      expect(countMock).toHaveBeenCalledTimes(1);
    });

    // RXD-034：`#updatePushableCount` 是异步的，多次触发会并行在飞。
    // 旧实现每次都直接 `next()`，先发起的那次晚到就会把新值盖回去。
    it('ignores a stale refresh that settles after a newer one', async () => {
      const slow = deferred<RxDBSync[]>();
      const fast = deferred<RxDBSync[]>();
      countMock
        .mockReturnValueOnce(of(0)) // 订阅自身那次
        .mockReturnValueOnce(of(42)) // 后发起的那次刷新
        .mockReturnValue(of(7)); // 先发起、后落地的那次
      const harness = createHarness({ entities: [User] });
      harness.syncFind.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

      harness.connected$.next(true);
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalledTimes(1));
      harness.repositorySyncComplete();
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalledTimes(2));

      fast.resolve([]);
      await vi.waitFor(async () => {
        await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(42);
      });

      slow.resolve([]);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(42);
    });

    it('does not let a stale refresh failure zero a newer count', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const slow = deferred<RxDBSync[]>();
      const fast = deferred<RxDBSync[]>();
      countMock.mockReturnValueOnce(of(0)).mockReturnValue(of(11));
      const harness = createHarness({ entities: [User] });
      harness.syncFind.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

      harness.connected$.next(true);
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalledTimes(1));
      harness.repositorySyncComplete();
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalledTimes(2));

      fast.resolve([]);
      await vi.waitFor(async () => {
        await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(11);
      });

      // 旧的那次失败，降级路径同样得受 generation 约束，否则一样会把 11 抹成 0
      slow.reject(new Error('stale refresh failed'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(11);
    });

    it('suppresses listener query failures without starting a refresh', async () => {
      countMock.mockReturnValue(throwError(() => new Error('listener count failed')));
      const harness = createHarness();

      harness.connected$.next(true);
      await Promise.resolve();
      await Promise.resolve();

      expect(harness.syncFind).not.toHaveBeenCalled();
      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(0);
    });

    it('reports ordinary refresh failures and resets the count', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      countMock.mockReturnValueOnce(of(0));
      const harness = createHarness();
      harness.syncFind.mockRejectedValue(new Error('count refresh failed'));

      harness.connected$.next(true);

      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          '[#updatePushableCount] error',
          expect.objectContaining({ message: 'count refresh failed' })
        )
      );
      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(0);
    });

    it('normalizes ordinary refresh failures through errors$', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      countMock.mockReturnValueOnce(of(0));
      const harness = createHarness();
      const reported: Error[] = [];
      harness.historyManager.errors$.subscribe(error => reported.push(error));
      harness.syncFind.mockRejectedValue('count refresh failed');

      harness.connected$.next(true);

      await vi.waitFor(() => expect(reported).toHaveLength(1));
      expect(reported[0]).toBeInstanceOf(Error);
      expect(reported[0].message).toBe('count refresh failed');
    });

    it('suppresses adapter shutdown failures while still resetting the count', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      countMock.mockReturnValueOnce(of(0));
      const harness = createHarness();
      const reported: Error[] = [];
      harness.historyManager.errors$.subscribe(error => reported.push(error));
      harness.syncFind.mockRejectedValue(new Error('database is closed'));

      harness.connected$.next(true);
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalled());
      await Promise.resolve();

      expect(consoleError).not.toHaveBeenCalled();
      expect(reported).toHaveLength(0);
      await expect(firstValueFrom(harness.historyManager.pushableCount$)).resolves.toBe(0);
    });

    it('suppresses an in-flight ordinary failure after destroy', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      countMock.mockReturnValueOnce(of(0));
      const harness = createHarness();
      const syncResult = deferred<RxDBSync[]>();
      harness.syncFind.mockReturnValue(syncResult.promise);

      harness.connected$.next(true);
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalled());
      harness.historyManager.destroy();
      syncResult.reject(new Error('late failure'));
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleError).not.toHaveBeenCalled();
    });

    it('refreshes from the repository sync event', async () => {
      countMock.mockReturnValue(of(0));
      const harness = createHarness();
      harness.connected$.next(true);
      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalledTimes(1));

      harness.repositorySyncComplete();

      await vi.waitFor(() => expect(harness.syncFind).toHaveBeenCalledTimes(2));
      expect(harness.addEventListener).toHaveBeenCalledWith(REPOSITORY_SYNC_COMPLETE_EVENT, expect.any(Function));
    });
  });

  describe('destroy', () => {
    it('unsubscribes listeners, removes the sync handler and completes errors$', async () => {
      const subscriptionTeardown = vi.fn();
      countMock.mockReturnValue(
        new Observable<number>(subscriber => {
          subscriber.next(0);
          return subscriptionTeardown;
        })
      );
      const harness = createHarness();
      const completed = vi.fn();
      harness.historyManager.errors$.subscribe({ complete: completed });
      harness.connected$.next(true);
      await vi.waitFor(() => expect(countMock).toHaveBeenCalled());
      const listener = harness.addEventListener.mock.calls[0][1];

      harness.historyManager.destroy();

      expect(subscriptionTeardown).toHaveBeenCalled();
      expect(harness.removeEventListener).toHaveBeenCalledWith(REPOSITORY_SYNC_COMPLETE_EVENT, listener);
      expect(completed).toHaveBeenCalled();
    });
  });
});
