import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityType, UUID } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { calculateOrderBy, isEntityMatchWhere } from '../../query/query-matching.utils.js';
import type { FindOptions } from '../../repository/query-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { IRxDBAdapter, RxDBAdapterLocalBase, SwitchBranchOptions } from '../../rxdb-adapter.js';
import {
  EntityLocalCreatedEvent,
  TransactionBeginEvent,
  TransactionCommitEvent,
  type RxDBEntityLocalCreatedEventData
} from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBMigration } from '../../system/migration.js';
import { RxDBSync } from '../../system/sync.js';
import type { RxDBChangeOrderByField, RxDBChangeRuleGroup } from '../../system/types.js';
import type { HistoryManager } from '../../version/HistoryManager.js';
import type { HistoryScopeAPI } from '../../version/VersionManager.interface.js';

const ADAPTER_NAME = 'history-clear-race';
const CHANGE_KEY_PREFIX = 'rxdb:RxDBChange:';

type LocalAdapter = IRxDBAdapter & RxDBAdapterLocalBase;
type HistoryManagerBridge = Pick<HistoryManager, 'resetSyncCleared'>;
type ChangeFindOptions = FindOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>;

type TestHarness = {
  rxdb: RxDB;
  changes: RxDBChange[];
  switchBranch: ReturnType<typeof vi.fn<(options: SwitchBranchOptions) => Promise<void>>>;
  addChange(id: number, createdAt: Date, transactionId?: UUID): RxDBChange;
  dispatchChange(change: RxDBChange, id: unknown, patchId?: unknown): void;
};

const databases: RxDB[] = [];

afterEach(async () => {
  const pending = databases.splice(0);
  await Promise.all(pending.map(database => database.disconnectAll()));
});

function createEntityEventData(change: RxDBChange, id: unknown, patchId?: unknown): RxDBEntityLocalCreatedEventData {
  const patch = { id: patchId === undefined ? change.id : patchId };
  return {
    type: 'INSERT',
    namespace: 'rxdb',
    entity: 'RxDBChange',
    id,
    patch,
    inversePatch: null,
    recordAt: change.createdAt
  } as unknown as RxDBEntityLocalCreatedEventData;
}

function getHistoryManager(rxdb: RxDB): HistoryManagerBridge {
  return (rxdb.versionManager as unknown as { historyManager: HistoryManagerBridge }).historyManager;
}

function getUndoChangeIds(histories: Awaited<ReturnType<typeof readUndoHistories>>): number[] {
  return histories.flatMap(history => history.changes.map(change => change.id));
}

async function readUndoHistories(history: HistoryScopeAPI) {
  return firstValueFrom(history.undoHistories$);
}

function getLastUndoneChangeIds(harness: TestHarness): number[] {
  const lastCall = harness.switchBranch.mock.calls.at(-1);
  if (!lastCall) return [];
  return [...lastCall[0].actions.updates.keys()]
    .filter(key => key.startsWith(CHANGE_KEY_PREFIX))
    .map(key => Number(key.slice(CHANGE_KEY_PREFIX.length)));
}

async function createHarness(): Promise<TestHarness> {
  const rxdb = new RxDB({
    dbName: `history-clear-race-${crypto.randomUUID()}`,
    entities: [RxDBBranch, RxDBChange, RxDBMigration, RxDBSync],
    sync: {
      type: SyncType.None,
      local: { adapter: ADAPTER_NAME }
    }
  });
  databases.push(rxdb);

  const changes: RxDBChange[] = [];
  let branch: RxDBBranch | null = null;
  const connect = vi.fn<() => Promise<LocalAdapter>>();

  const branchRepository = {
    find: vi.fn(async () => (branch ? [branch] : [])),
    count: vi.fn(async () => (branch ? 1 : 0))
  };
  const changeRepository = {
    find: vi.fn(async (options: ChangeFindOptions) => {
      const where = options.where as unknown as RuleGroup<RxDBChange>;
      const matched = changes.filter(change => isEntityMatchWhere(change, where));
      return options.orderBy ? calculateOrderBy(matched, options.orderBy) : matched;
    }),
    count: vi.fn(async () => changes.length)
  };
  const syncRepository = {
    find: vi.fn(async () => []),
    count: vi.fn(async () => 0)
  };
  const emptyRepository = {
    find: vi.fn(async () => []),
    count: vi.fn(async () => 0)
  };

  const switchBranch = vi.fn<(options: SwitchBranchOptions) => Promise<void>>(async ({ actions }) => {
    for (const [key, update] of actions.updates) {
      if (!key.startsWith(CHANGE_KEY_PREFIX)) continue;
      const change = changes.find(item => item.id === Number(key.slice(CHANGE_KEY_PREFIX.length)));
      const patch = update.patch as { revertChangeId?: number | null } | null;
      if (change && patch && 'revertChangeId' in patch) {
        change.revertChangeId = patch.revertChangeId;
      }
    }
  });

  const adapterShape = {
    name: ADAPTER_NAME,
    connect,
    disconnect: vi.fn(async () => undefined),
    version: vi.fn(async () => 'test'),
    isTableExisted: vi.fn(async () => false),
    createTables: vi.fn(async () => true),
    transaction: vi.fn(async (run: () => Promise<unknown>) => run()),
    getRepository: vi.fn((EntityClass: EntityType) => {
      if (EntityClass === RxDBBranch) return branchRepository;
      if (EntityClass === RxDBChange) return changeRepository;
      if (EntityClass === RxDBSync) return syncRepository;
      return emptyRepository;
    }),
    getRxDBChangeSequence: vi.fn(async () => Math.max(0, ...changes.map(change => change.id))),
    switchBranch,
    mergeChanges: vi.fn(async () => undefined),
    saveMany: vi.fn(async <T extends EntityType>(entities: InstanceType<T>[]) => entities),
    removeMany: vi.fn(async <T extends EntityType>(entities: InstanceType<T>[]) => entities),
    mutations: vi.fn(async () => [])
  };
  const adapter = adapterShape as unknown as LocalAdapter;
  connect.mockResolvedValue(adapter);

  rxdb.adapter(ADAPTER_NAME, () => adapter);
  rxdb.init();
  const branchData = Object.assign(new RxDBBranch(), {
    id: 'main',
    activated: true,
    local: true,
    remote: false,
    parentId: null,
    fromChangeId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  branch = rxdb.entityManager.createEntityRef(RxDBBranch, branchData, {
    local: true,
    remote: false,
    modified: false
  });
  await rxdb.connect(ADAPTER_NAME);

  return {
    rxdb,
    changes,
    switchBranch,
    addChange(id, createdAt, transactionId) {
      const data = Object.assign(new RxDBChange(), {
        id,
        namespace: 'public',
        entity: 'User',
        entityId: `user-${id}` as UUID,
        branchId: 'main',
        type: 'INSERT' as const,
        patch: { name: `user-${id}` },
        inversePatch: null,
        transactionId: transactionId ?? null,
        remoteId: null,
        localId: null,
        revertChangeId: null,
        revertChangedAt: null,
        redoInvalidatedAt: null,
        createdAt,
        updatedAt: createdAt
      });
      const change = rxdb.entityManager.createEntityRef(RxDBChange, data, {
        local: true,
        remote: false,
        modified: false
      });
      changes.push(change);
      return change;
    },
    dispatchChange(change, id, patchId) {
      rxdb.dispatchEvent(new EntityLocalCreatedEvent([createEntityEventData(change, id, patchId)]));
    }
  };
}

describe('HistoryManager clear session race', () => {
  it('忽略 clear 前排队、clear 后才由真实事务队列送达的旧 RxDBChange 事件', async () => {
    const harness = await createHarness();
    const oldChange = harness.addChange(50, new Date());

    harness.rxdb.dispatchEvent(new TransactionBeginEvent());
    harness.dispatchChange(oldChange, oldChange.id);
    harness.rxdb.versionManager.resetSessionState();
    harness.rxdb.dispatchEvent(new TransactionCommitEvent());

    const history = harness.rxdb.versionManager.history();
    let visibleChangeIds: number[] = [-1];
    const subscription = history.undoHistories$.subscribe(histories => {
      visibleChangeIds = getUndoChangeIds(histories);
    });
    await vi.waitFor(() => expect(visibleChangeIds).toEqual([]));

    await history.undo();
    expect(harness.switchBranch).not.toHaveBeenCalled();

    const newChange = harness.addChange(51, new Date(Date.now() + 1_000));
    harness.dispatchChange(newChange, newChange.id);
    // resetSyncCleared 的恢复路径需要依次等待 branch/localAdapter/RxDBSync 三次异步查询，
    // 在 CI 负载较高时可能超过 vi.waitFor 的默认 1s 超时，故放宽到 3s。
    await vi.waitFor(() => expect(visibleChangeIds).toEqual([newChange.id]), { timeout: 3000 });

    expect(visibleChangeIds).not.toContain(oldChange.id);

    // undo 后 live undoHistories$ 会滤掉已撤销项，断言必须冻结 undo 前的可见边界
    const undoneIds = [...visibleChangeIds];
    await history.undo();
    expect(getLastUndoneChangeIds(harness)).toEqual(undoneIds);
    subscription.unsubscribe();
  });

  it('clear 后真正的新事件在 UI 与直接 undo 中使用同一边界', async () => {
    const harness = await createHarness();
    harness.rxdb.versionManager.resetSessionState();

    const change = harness.addChange(51, new Date(Date.now() + 1_000));
    harness.dispatchChange(change, change.id);

    const history = harness.rxdb.versionManager.history();
    const visibleChangeIds = getUndoChangeIds(await readUndoHistories(history));
    expect(visibleChangeIds).toEqual([change.id]);

    await history.undo();
    expect(getLastUndoneChangeIds(harness)).toEqual(visibleChangeIds);
  });

  it('顶层 change id 非数字时使用 RxDBChange patch 的数字 id', async () => {
    const harness = await createHarness();
    harness.rxdb.versionManager.resetSessionState();

    const change = harness.addChange(61, new Date(Date.now() + 1_000));
    harness.dispatchChange(change, 'not-a-number');

    const history = harness.rxdb.versionManager.history();
    const visibleChangeIds = getUndoChangeIds(await readUndoHistories(history));
    expect(visibleChangeIds).toEqual([change.id]);

    await history.undo();
    expect(getLastUndoneChangeIds(harness)).toEqual(visibleChangeIds);
  });

  it('事件完全缺失数字 change id 时按当前 clear session 恢复且不暴露旧历史', async () => {
    const harness = await createHarness();
    const oldChange = harness.addChange(70, new Date());
    harness.rxdb.versionManager.resetSessionState();

    const newChange = harness.addChange(71, new Date(Date.now() + 1_000));
    harness.dispatchChange(newChange, 'missing', 'also-missing');

    const history = harness.rxdb.versionManager.history();
    const visibleChangeIds = getUndoChangeIds(await readUndoHistories(history));
    expect(visibleChangeIds).toEqual([newChange.id]);
    expect(visibleChangeIds).not.toContain(oldChange.id);

    await history.undo();
    expect(getLastUndoneChangeIds(harness)).toEqual(visibleChangeIds);
  });

  it('无数字 change id 的跨 clear 事务不会被直接 undo 裁成半个事务', async () => {
    const harness = await createHarness();
    const history = harness.rxdb.versionManager.history();
    let visibleChangeIds: number[] = [-1];
    const subscription = history.undoHistories$.subscribe(histories => {
      visibleChangeIds = getUndoChangeIds(histories);
    });
    await vi.waitFor(() => expect(visibleChangeIds).toEqual([]));

    const transactionId = crypto.randomUUID() as UUID;
    const oldBeforeClear = harness.addChange(70, new Date(), transactionId);

    harness.rxdb.dispatchEvent(new TransactionBeginEvent());
    harness.dispatchChange(oldBeforeClear, 'missing', 'also-missing');
    harness.rxdb.versionManager.resetSessionState();

    const oldAfterClear = harness.addChange(71, new Date(Date.now() + 1_000), transactionId);
    harness.dispatchChange(oldAfterClear, 'missing', 'also-missing');
    harness.rxdb.dispatchEvent(new TransactionCommitEvent());

    const newChange = harness.addChange(72, new Date(Date.now() + 2_000));
    harness.dispatchChange(newChange, 'missing', 'also-missing');
    // 同上：跨 clear 恢复路径涉及多次异步查询，CI 负载高时默认 1s 超时可能不够。
    await vi.waitFor(() => expect(visibleChangeIds).toEqual([newChange.id]), { timeout: 3000 });

    // 同上：live 订阅跨过 undo 后会被空数组覆盖，不能拿事后 UI 对撤销 id
    const undoneIds = [...visibleChangeIds];
    await history.undo();
    expect(getLastUndoneChangeIds(harness)).toEqual(undoneIds);

    await history.undo();
    expect(harness.switchBranch).toHaveBeenCalledOnce();
    expect(oldBeforeClear.revertChangeId).toBeNull();
    expect(oldAfterClear.revertChangeId).toBeNull();
    subscription.unsubscribe();
  });

  it('resetSyncCleared([]) 保持安全 no-op，不解除当前 clear session', async () => {
    const harness = await createHarness();
    harness.rxdb.versionManager.resetSessionState();
    harness.addChange(81, new Date(Date.now() + 1_000));

    getHistoryManager(harness.rxdb).resetSyncCleared([]);

    const history = harness.rxdb.versionManager.history();
    expect(getUndoChangeIds(await readUndoHistories(history))).toEqual([]);

    await history.undo();
    expect(harness.switchBranch).not.toHaveBeenCalled();
  });
});
