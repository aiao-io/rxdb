/**
 * Pull/Push 同步之后的 undo 生命周期（走真实 `HistoryManager`，不复制实现）
 *
 * 覆盖的是「清空 → 恢复」这条状态机，而不是过滤谓词本身：
 *
 * 1. sync 真的改写了数据时调用 {@link HistoryManager.clearUndoHistory}，
 *    `undoHistories$` 立刻发空数组，同时 redo 栈作废；
 * 2. 用户在清空之后新建的本地变更调用 {@link HistoryManager.resetSyncCleared} 恢复 undo，
 *    但撤销边界会推进到第一条新变更之前——清空之前的历史**永久**不可撤销；
 * 3. 不属于当前 clear session 的事件（旧 generation / 早于 clearedAt）不得把 session 拉回 active，
 *    否则一次迟到的事务回包就能把已作废的历史放出来。
 *
 * 过滤谓词（remoteId / lastPushedChangeId / reverted）由 `filterUndoableHistories`
 * 负责，已在 `HistoryManager.scopes-and-undo.spec.ts` 覆盖，这里不重复。
 */
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UUID } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import { convertChangesToHistories } from '../../version/history-item-builder.js';
import { HistoryManager } from '../../version/HistoryManager.js';
import type { HistoryItem } from '../../version/VersionManager.interface.js';
import { emptyPushInFlight } from '../fixtures/push-inflight.js';
import { User } from '../fixtures/test-entities.js';

const firstConnectedAt = new Date('2026-07-10T08:00:00.000Z');
const activeBranch = { id: 'main', activated: true } as RxDBBranch;

const managers = new Set<HistoryManager>();

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

type Harness = {
  changes$: BehaviorSubject<RxDBChange[]>;
  connected$: BehaviorSubject<boolean>;
  historyManager: HistoryManager;
  syncFind: ReturnType<typeof vi.fn>;
};

const createHarness = (): Harness => {
  const connected$ = new BehaviorSubject(false);
  const changes$ = new BehaviorSubject<RxDBChange[]>([]);
  const branchRepository = {
    find: vi.fn().mockResolvedValue([activeBranch]),
    findOne: vi.fn(() => of(activeBranch))
  };
  const changeRepository = {
    count: vi.fn(() => of(0)),
    find: vi.fn().mockResolvedValue([]),
    findAll: vi.fn(() => changes$.asObservable())
  };
  const syncFind = vi.fn().mockResolvedValue([]);
  const localAdapter = {
    getRepository: vi.fn((entity: unknown) => (entity === RxDBSync ? { find: syncFind } : null))
  };
  const rxdb = {
    addEventListener: vi.fn(),
    config: {
      entities: [User],
      sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
    },
    connected$,
    entityManager: {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === RxDBBranch) return branchRepository;
        if (entity === RxDBChange) return changeRepository;
        return null;
      })
    },
    firstConnectedAt,
    localAdapter$: of(localAdapter),
    removeEventListener: vi.fn(),
    versionManager: {
      getCurrentBranch: vi.fn().mockResolvedValue(activeBranch),
      getLocalRepositories: vi.fn().mockResolvedValue({
        adapter: { getRxDBChangeSequence: vi.fn().mockResolvedValue(100), switchBranch: vi.fn() },
        branchRepository,
        changeRepository
      }),
      pushInFlight: emptyPushInFlight()
    }
  } as unknown as RxDB;

  const historyManager = new HistoryManager(rxdb);
  managers.add(historyManager);
  return { changes$, connected$, historyManager, syncFind };
};

/**
 * `undoHistories$` 的 `switchMap` 是异步的（要查活跃分支和 repo 水位线），
 * 一次同步调用可能要跨好几个 microtask 才落到订阅者身上。轮询等下一发。
 */
const nextEmission = async (emissions: HistoryItem[][], since: number): Promise<HistoryItem[]> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (emissions.length > since) return emissions[emissions.length - 1];
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`undoHistories$ 在超时前没有发出第 ${since + 1} 次值`);
};

afterEach(() => {
  for (const manager of managers) manager.destroy();
  managers.clear();
  vi.restoreAllMocks();
});

describe('同步之后的 undo 生命周期', () => {
  let harness: Harness;
  let emissions: HistoryItem[][];
  let subscription: { unsubscribe: () => void };

  beforeEach(() => {
    harness = createHarness();
    emissions = [];
    subscription = harness.historyManager.undoHistories$.subscribe(value => emissions.push(value));
  });

  afterEach(() => subscription.unsubscribe());

  it('clearUndoHistory() 之后 undoHistories$ 立刻发空数组', async () => {
    harness.changes$.next([createChange(3), createChange(2), createChange(1)]);
    harness.connected$.next(true);

    const before = await nextEmission(emissions, 0);
    expect(before.map(history => history.changeId)).toEqual([3, 2, 1]);

    const seen = emissions.length;
    harness.historyManager.clearUndoHistory();

    expect(await nextEmission(emissions, seen)).toEqual([]);
  });

  it('clearUndoHistory() 同时作废 redo 栈', async () => {
    const redoItem = convertChangesToHistories([createChange(9)])[0];
    harness.historyManager.pushToRedoStack([redoItem]);

    const redoEmissions: HistoryItem[][] = [];
    const redoSubscription = harness.historyManager.redoHistories$.subscribe(value => redoEmissions.push(value));
    expect(redoEmissions.at(-1)?.map(history => history.changeId)).toEqual([9]);

    harness.historyManager.clearUndoHistory();

    expect(redoEmissions.at(-1)).toEqual([]);
    redoSubscription.unsubscribe();
  });

  it('清空后的新本地变更恢复 undo，但清空前的历史永久不可撤销', async () => {
    harness.changes$.next([createChange(3), createChange(2), createChange(1)]);
    harness.connected$.next(true);
    await nextEmission(emissions, 0);

    const clearedAt = emissions.length;
    harness.historyManager.clearUndoHistory();
    expect(await nextEmission(emissions, clearedAt)).toEqual([]);

    // 用户在同步之后新建了一条变更：这条可以撤销，边界之前的 1/2/3 不行
    const beforeReset = emissions.length;
    harness.changes$.next([createChange(4), createChange(3), createChange(2), createChange(1)]);
    harness.historyManager.resetSyncCleared([4]);

    const restored = await nextEmission(emissions, beforeReset);
    expect(restored.map(history => history.changeId)).toEqual([4]);
  });

  it('不属于当前 clear session 的事件不得恢复 undo', async () => {
    harness.changes$.next([createChange(3), createChange(2), createChange(1)]);
    harness.connected$.next(true);
    await nextEmission(emissions, 0);

    const beforeClear = emissions.length;
    harness.historyManager.clearUndoHistory();
    const clearedGeneration = harness.historyManager.undoSessionGeneration;
    expect(await nextEmission(emissions, beforeClear)).toEqual([]);

    const seen = emissions.length;
    // 清空之前就开始的事务迟到回包：generation 对不上，不能把已作废的历史放出来
    harness.historyManager.resetSyncCleared([4], { generation: clearedGeneration - 1, recordAt: null });
    harness.changes$.next([createChange(4), createChange(3), createChange(2), createChange(1)]);

    expect(await nextEmission(emissions, seen)).toEqual([]);
  });
});
