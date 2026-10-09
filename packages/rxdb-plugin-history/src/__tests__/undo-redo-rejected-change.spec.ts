/**
 * 被拒变更 × undo / redo 的交互（roadmap「零散收尾项」第 11 条评估）
 *
 * US-218 阶段 B 之后，「待推」查询都加了 `rejectedAt = null`，唯独 `undo-redo-apply.ts`
 * 按故事 Out of Scope 没改。撤销 / 重做一条被拒变更会怎样，此前没有任何测试覆盖。
 * 本文件补上这组测试，并把观察到的行为逐条写进用例注释。
 *
 * 观察到的实际行为（与下方用例一一对应）：
 * 1. `applyUndoRedoHistories` 对被拒变更一视同仁：undo 照常落 inversePatch 并打
 *    `revertChangeId`，redo 照常重放 patch 并清 `revertChangeId`；`rejectedAt` /
 *    `rejection` 从头到尾不被触碰、也不进任何 update patch —— 被拒标记**永远不会被撤销清掉**。
 * 2. 公开入口 `history().undo()` 今天到不了被拒变更：回执落库与水位线推进是同一个事务
 *    （`persistPushReceipts`），`filterUndoableHistories` 的 `id > lastPushedChangeId`
 *    已经把它排掉。但排除是**间接的** —— 谓词完全不看 `rejectedAt`，水位线一旦缺位
 *    （比如未来改成逐条回执、水位线不再整批推进），被拒变更就会重新变得可撤销。
 * 3. `updatePushableCount` 的计数查询同样没有 `rejectedAt` 规则，靠
 *    `buildPushableRepositoryRules` 的 `id > watermark` 间接排除。
 * 4. 因此「redo 一条被拒变更」的净效果：本地实体状态重新应用了远端拒绝过的编辑，
 *    而这条变更永远不会再被推送 —— 本地与远端就此静默分叉，且没有兜底提示。
 */
import {
  createEntitySyncResolver,
  type RemoteChangeRejection,
  type RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  SKIP_BRANCH_SWITCH_PREPARE,
  SyncType,
  type UUID
} from '@aiao/rxdb';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterUndoableHistories } from '../history-filters.js';
import { createHistoryItem } from '../history-item-builder.js';
import type { ActiveUndoSession } from '../history-undo-session.types.js';
import { HistoryManager } from '../HistoryManager.js';
import { applyUndoRedoHistories, updatePushableCount, type UndoRedoApplyHost } from '../undo-redo-apply.js';
import { emptyPushInFlight } from './fixtures/push-inflight.js';
import { User } from './fixtures/test-entities.js';

const firstConnectedAt = new Date('2026-07-10T08:00:00.000Z');
const rejectedAt = new Date('2026-10-08T09:00:00.000Z');
const stateUpdatedAt = new Date('2026-10-09T12:00:00.000Z');
const rejection: RemoteChangeRejection = {
  code: '42501',
  reason: 'denied',
  message: 'row-level security denied',
  entity: { namespace: 'public', entity: 'User', entityId: 'user-1' }
};

/** 一条带完整被拒标记（rejectedAt + rejection）的本地 INSERT 变更。 */
const createRejectedChange = (id: number, overrides: Partial<RxDBChange> = {}): RxDBChange =>
  ({
    id,
    branchId: 'main',
    remoteId: null,
    rejectedAt,
    rejection,
    transactionId: null,
    namespace: 'public',
    entity: 'User',
    entityId: `user-${id}` as UUID,
    type: 'INSERT',
    patch: { name: `user-${id}` },
    inversePatch: null,
    createdAt: new Date(firstConnectedAt.getTime() + id * 1000),
    updatedAt: new Date(firstConnectedAt.getTime() + id * 1000),
    revertChangeId: null,
    redoInvalidatedAt: null,
    ...overrides
  }) as RxDBChange;

type ApplyHarness = {
  host: UndoRedoApplyHost;
  adapter: { getRxDBChangeSequence: ReturnType<typeof vi.fn>; switchBranch: ReturnType<typeof vi.fn> };
};

/** applyUndoRedoHistories 的最小 host：switchBranch 与序列号走 spy，其余栈操作走 mock。 */
const createApplyHarness = (sequence = 41, rxdbOverrides: Partial<RxDB> = {}): ApplyHarness => {
  const getRxDBChangeSequence = vi.fn().mockResolvedValue(sequence);
  const switchBranch = vi.fn().mockResolvedValue(undefined);
  const adapter = { getRxDBChangeSequence, switchBranch };
  const rxdb = {
    versionManager: {
      getLocalRepositories: vi.fn().mockResolvedValue({
        adapter,
        branchRepository: {},
        changeRepository: {}
      })
    },
    ...rxdbOverrides
  } as unknown as RxDB;
  const host: UndoRedoApplyHost = {
    rxdb,
    destroyed: false,
    isUndoRedoInProgress: false,
    redoInvalidationFloor: 0,
    pushableGeneration: 0,
    pushableCount$: new BehaviorSubject(0),
    pushableCountTrigger$: new BehaviorSubject(0),
    errors$: new Subject<Error>(),
    getFirstConnectedAt: () => firstConnectedAt,
    isUndoSessionCurrent: () => true,
    getNextRevertStateUpdatedAt: () => stateUpdatedAt,
    setRevertStateWatermarks: vi.fn(),
    pushToRedoStack: vi.fn(),
    removeFromRedoStack: vi.fn()
  };
  return { host, adapter };
};

describe('applyUndoRedoHistories 对被拒变更', () => {
  it('undo 被拒变更：落 inversePatch 并打 revertChangeId，rejectedAt / rejection 原样保留', async () => {
    const { host, adapter } = createApplyHarness(41);
    const change = createRejectedChange(5);
    const history = createHistoryItem([change]);
    const session: ActiveUndoSession = {
      generation: 1,
      state: 'active',
      boundary: { changeId: 0, createdAfter: null }
    };

    await applyUndoRedoHistories(host, 'undo', [history], session);

    const [options] = adapter.switchBranch.mock.calls[0];
    // 回放只作用于当前分支：不传 branchId、跳过 prepare（与未被拒变更同一套入口规则）
    expect(options).not.toHaveProperty('branchId');
    expect(options.prepare).toBe(SKIP_BRANCH_SWITCH_PREPARE);

    // INSERT 的逆操作是删实体行：被拒变更的实体状态照常被还原
    const deletes = [...options.actions.deletes.values()];
    expect(deletes).toHaveLength(1);
    expect(deletes[0].inversePatch).toEqual({ name: 'user-5' });

    // 变更行 update：revertChangeId = seq + index + 1；被拒标记不在 patch 里，也不会被清
    const changeUpdate = options.actions.updates.get('rxdb:RxDBChange:5');
    expect(changeUpdate?.patch).toMatchObject({ revertChangeId: 42 });
    expect(changeUpdate?.patch.revertChangedAt).toBeInstanceOf(Date);
    expect(changeUpdate?.patch.updatedAt).toBe(stateUpdatedAt);
    expect(changeUpdate?.patch).not.toHaveProperty('rejectedAt');
    expect(changeUpdate?.patch).not.toHaveProperty('rejection');

    expect(host.redoInvalidationFloor).toBe(42);
    expect(host.setRevertStateWatermarks).toHaveBeenCalledWith([change], true, stateUpdatedAt);
    expect(host.pushToRedoStack).toHaveBeenCalledWith([history]);
    expect(host.isUndoRedoInProgress).toBe(false);
  });

  it('redo 被拒变更：重放 patch 并清 revertChangeId，被拒标记依旧原样 —— 被拒编辑在本地复现但永不重推', async () => {
    const { host, adapter } = createApplyHarness(41);
    const change = createRejectedChange(5);
    const history = createHistoryItem([change]);

    await applyUndoRedoHistories(host, 'redo', [history]);

    const [options] = adapter.switchBranch.mock.calls[0];
    const inserts = [...options.actions.inserts.values()];
    expect(inserts).toHaveLength(1);
    expect(inserts[0].patch).toEqual({ name: 'user-5' });

    const changeUpdate = options.actions.updates.get('rxdb:RxDBChange:5');
    expect(changeUpdate?.patch).toMatchObject({ revertChangeId: null });
    expect(changeUpdate?.patch.updatedAt).toBe(stateUpdatedAt);
    // redo 把变更恢复到「已应用且未回滚」，但 rejectedAt / rejection 一步都没动：
    // 所有待推查询（push 规划、HistoryManager 触发查询）都按 rejectedAt = null 过滤，
    // 这条恢复出来的本地编辑从此没有任何推送机会。
    expect(changeUpdate?.patch).not.toHaveProperty('rejectedAt');
    expect(changeUpdate?.patch).not.toHaveProperty('rejection');

    expect(host.removeFromRedoStack).toHaveBeenCalledWith([history]);
    expect(host.setRevertStateWatermarks).toHaveBeenCalledWith([change], false, stateUpdatedAt);
    expect(host.isUndoRedoInProgress).toBe(false);
  });
});

describe('filterUndoableHistories 对被拒变更的判定', () => {
  it('回执推进水位线后被拒变更不可撤销 —— 但排除是间接的，靠 id > lastPushedChangeId 而不是 rejectedAt', () => {
    const history = createHistoryItem([createRejectedChange(5)]);
    // 回执落库与水位线推进是同一个事务（persistPushReceipts）：被拒变更所在仓库的
    // lastPushedChangeId 必然 >= 它的 id，公开入口 history().undo() 因此够不到被拒变更。
    const lastPushedMap = new Map([['public:User', 7]]);
    expect(filterUndoableHistories([history], lastPushedMap)).toEqual([]);
  });

  it('水位线缺位时被拒变更重新变得可撤销 —— 过滤谓词完全不看 rejectedAt', () => {
    // 观察（疑似脆弱点）：谓词只查 remoteId / 水位线 / undo 边界，被拒标记不在其中。
    // 今天的回执语义保证「被拒 ⇔ 水位线已越过它」，两者是同一事务写下的；
    // 一旦水位线语义变化（如逐条回执、部分推进），被拒变更会再次进入可撤销列表。
    const history = createHistoryItem([createRejectedChange(5)]);
    expect(filterUndoableHistories([history], new Map())).toEqual([history]);
  });
});

/**
 * updatePushableCount 的计数查询 harness：count 走 spy，其余与 HistoryManager 的真实 host 同口径。
 */
const createCountHarness = (lastPushedChangeId: number | null) => {
  const count = vi.fn();
  count.mockImplementation(() => of(0));
  const syncFind = vi.fn().mockResolvedValue([
    { namespace: 'public', entity: 'User', branchId: 'main', lastPushedChangeId }
  ]);
  const rxdb = {
    config: { entities: [User], sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } } },
    entitySync: createEntitySyncResolver({ type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } }),
    connected$: of(true),
    localAdapter$: of({
      getRepository: vi.fn((entity: unknown) => (entity === RxDBSync ? { find: syncFind } : null))
    }),
    entityManager: {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === RxDBBranch) return { findOne: vi.fn(() => of({ id: 'main', activated: true })) };
        if (entity === RxDBChange) return { count };
        return null;
      })
    }
  } as unknown as RxDB;
  const host = createApplyHarness(41, rxdb).host;
  return { count, host };
};

describe('updatePushableCount 的计数查询与被拒变更', () => {
  it('有水位线时靠 repoRules 的 id > watermark 间接排除被拒变更，查询本身没有 rejectedAt 规则', async () => {
    const { count, host } = createCountHarness(7);

    await updatePushableCount(host);

    expect(count).toHaveBeenCalledTimes(1);
    const { where } = count.mock.calls[0][0] as { where: { rules: unknown[] } };
    expect(where.rules).toContainEqual({ field: 'branchId', operator: '=', value: 'main' });
    expect(where.rules).toContainEqual({ field: 'revertChangeId', operator: '=', value: null });
    expect(where.rules).toContainEqual({ field: 'remoteId', operator: '=', value: null });

    const orGroup = where.rules.find(rule => typeof rule === 'object' && rule !== null && (rule as { combinator?: string }).combinator === 'or');
    expect(orGroup).toBeDefined();
    const repoRules = (orGroup as { rules: { rules: unknown[] }[] }).rules[0]!.rules;
    // 被拒变更（id 5 < 水位线 7）被 id > watermark 排掉 —— 与 filterUndoableHistories 同一个间接机制
    expect(repoRules).toContainEqual({ field: 'id', operator: '>', value: 7 });

    // 观察（疑似缺陷，见文件头第 3 条）：这条计数查询与「待推」查询不同，没有 rejectedAt 过滤。
    const flat = JSON.stringify(where.rules);
    expect(flat).not.toContain('rejectedAt');
  });

  it('水位线缺位时计数查询没有 id 上界 —— 被拒变更会被计为待推', async () => {
    // 与 filter 层的缺位情形同源：真实流程里被拒必然伴随水位线推进，此缺口今天不可达；
    // 但它说明「不再推送被拒变更」这件事在两处都只由水位线这一个机制扛着。
    const { count, host } = createCountHarness(null);

    await updatePushableCount(host);

    const { where } = count.mock.calls[0][0] as { where: { rules: unknown[] } };
    const orGroup = where.rules.find(rule => typeof rule === 'object' && rule !== null && (rule as { combinator?: string }).combinator === 'or');
    const repoRules = (orGroup as { rules: { rules: unknown[] }[] }).rules[0]!.rules;
    expect(repoRules).toEqual([
      { field: 'namespace', operator: '=', value: 'public' },
      { field: 'entity', operator: '=', value: 'User' }
    ]);
    expect(repoRules).not.toContainEqual(expect.objectContaining({ field: 'id' }));
    const flat = JSON.stringify(where.rules);
    expect(flat).not.toContain('rejectedAt');
  });
});

const managers = new Set<HistoryManager>();

afterEach(() => {
  for (const manager of managers) manager.destroy();
  managers.clear();
  vi.restoreAllMocks();
});

describe('HistoryManager.history().undo() 对被拒变更（公开入口）', () => {
  it('回执推进水位线后被拒变更不进可撤销列表，undo() 不触发 switchBranch', async () => {
    const change = createRejectedChange(5);
    const changes$ = new BehaviorSubject<RxDBChange[]>([change]);
    const branchRepository = {
      find: vi.fn().mockResolvedValue([{ id: 'main', activated: true }]),
      findOne: vi.fn(() => of({ id: 'main', activated: true }))
    };
    const changeRepository = {
      count: vi.fn(() => of(0)),
      find: vi.fn().mockResolvedValue([change]),
      findAll: vi.fn(() => changes$.asObservable())
    };
    const switchBranch = vi.fn().mockResolvedValue(undefined);
    const syncFind = vi.fn().mockResolvedValue([
      { namespace: 'public', entity: 'User', branchId: 'main', lastPushedChangeId: 7 }
    ]);
    const connected$ = new BehaviorSubject(false);
    const rxdb = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      config: {
        entities: [User],
        sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
      },
      entitySync: createEntitySyncResolver({ type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } }),
      connected$,
      firstConnectedAt,
      localAdapter$: of({
        getRepository: vi.fn((entity: unknown) => (entity === RxDBSync ? { find: syncFind } : null))
      }),
      entityManager: {
        getRepository: vi.fn((entity: unknown) => {
          if (entity === RxDBBranch) return branchRepository;
          if (entity === RxDBChange) return changeRepository;
          return null;
        })
      },
      versionManager: {
        getLocalRepositories: vi.fn().mockResolvedValue({
          adapter: { getRxDBChangeSequence: vi.fn().mockResolvedValue(100), switchBranch },
          branchRepository,
          changeRepository
        }),
        getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main' }),
        pushInFlight: emptyPushInFlight()
      }
    } as unknown as RxDB;

    const manager = new HistoryManager(rxdb);
    managers.add(manager);
    connected$.next(true);

    const undoCounts: number[] = [];
    const subscription = manager.history().undoCount$.subscribe(count => undoCounts.push(count));
    await vi.waitFor(() => expect(undoCounts.at(-1)).toBe(0));

    await manager.history().undo();

    // 被拒变更（id 5）已在水位线 7 之后：不可撤销，整条公开入口静默空跑，无任何写入。
    expect(switchBranch).not.toHaveBeenCalled();

    subscription.unsubscribe();
  });
});

describe('HistoryItem 描述', () => {
  it('被拒变更照常出现在历史列表里（不带被拒标记的展示差异）', () => {
    // 观察：fetchLatestHistories 的查询没有 rejectedAt 过滤，被拒变更与普通变更同样进
    // histories$ / undoHistories$ 的输入，只是随后被水位线判定挡在可撤销列表外。
    const history = createHistoryItem([createRejectedChange(5)]);
    expect(history.type).toBe('INSERT');
    expect(history.description).toBe('创建 User');
    expect(history.reverted).toBe(false);
  });
});
