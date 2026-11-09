/**
 * @fileoverview 选取之后才出现的推送认领：undo 在写事务里按当时的认领与水位线复核
 *
 * 选候选（`fetchLatestHistories`）只读一次在飞认领的快照。从选取到写事务之间还隔着
 * change sequence 读取、适配器解析与写队列等待，push 可以在这些窗口里认领并发出同一条变更。
 * 撤销只给原变更打 `revertChangeId`、不产生可推出的补偿，于是远端有、本地无，永久分叉。
 * 复核放进 `switchBranch` 的前置钩子：与写入同一个事务，认领与已推水位线越过任一条就整笔中止。
 */
import {
  RxDBBranch,
  type RxDB,
  type RxDBChange,
  RxDBSync,
  type SwitchBranchOptions,
  type TransactionExecutor,
  type UUID
} from '@aiao/rxdb';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createHistoryItem } from '../history-item-builder.js';
import type { ActiveUndoSession } from '../history-undo-session.types.js';
import { PushInFlightRegistry } from '../push-inflight.js';
import { applyUndoRedoHistories, type UndoRedoApplyHost } from '../undo-redo-apply.js';

const createdAt = new Date('2026-11-01T08:00:00.000Z');
const stateUpdatedAt = new Date('2026-11-01T09:00:00.000Z');

const session: ActiveUndoSession = {
  generation: 1,
  state: 'active',
  boundary: { changeId: 0, createdAfter: null }
};

/** 一条本地未推、未回滚的 INSERT */
const localInsert = (id: number, overrides: Partial<RxDBChange> = {}): RxDBChange =>
  ({
    id,
    branchId: 'main',
    remoteId: null,
    rejectedAt: null,
    rejection: null,
    transactionId: null,
    namespace: 'public',
    entity: 'User',
    entityId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}` as UUID,
    type: 'INSERT',
    patch: { name: `user-${id}` },
    inversePatch: null,
    createdAt,
    updatedAt: createdAt,
    revertChangeId: null,
    redoInvalidatedAt: null,
    ...overrides
  }) as RxDBChange;

interface HarnessOptions {
  /** 写事务里读到的 `RxDBSync.lastPushedChangeId` */
  readonly lastPushedChangeId?: number | null;
  /** 选取之后、写事务之前插进来的动作（读 change sequence 的那一拍） */
  readonly beforeWrite?: (registry: PushInFlightRegistry) => void;
}

/**
 * 真的在飞登记处 + 会跑前置钩子的 `switchBranch`：钩子抛错即回滚，什么也不写。
 */
const createHarness = (options: HarnessOptions = {}) => {
  const pushInFlight = new PushInFlightRegistry();
  const syncRows = [
    { namespace: 'public', entity: 'User', branchId: 'main', lastPushedChangeId: options.lastPushedChangeId ?? null }
  ];
  const executor = {
    getRepository: (EntityType: unknown) => {
      if (EntityType === RxDBBranch) return { find: async () => [] };
      if (EntityType === RxDBSync) return { find: async () => syncRows };
      throw new Error(`unexpected repository ${String(EntityType)}`);
    }
  } as unknown as TransactionExecutor;
  const written = vi.fn<(actions: SwitchBranchOptions['actions']) => void>();
  const switchBranch = vi.fn(async (switchOptions: SwitchBranchOptions) => {
    await switchOptions.prepare({ executor, targetBranchId: 'main' });
    written(switchOptions.actions);
  });
  const getRxDBChangeSequence = vi.fn(async () => {
    options.beforeWrite?.(pushInFlight);
    return 41;
  });
  const rxdb = {
    versionManager: {
      pushInFlight,
      getLocalRepositories: vi.fn(async () => ({
        adapter: { getRxDBChangeSequence, switchBranch },
        branchRepository: {},
        changeRepository: {}
      }))
    }
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
    getFirstConnectedAt: () => createdAt,
    isUndoSessionCurrent: () => true,
    getNextRevertStateUpdatedAt: () => stateUpdatedAt,
    setRevertStateWatermarks: vi.fn(),
    pushToRedoStack: vi.fn(),
    removeFromRedoStack: vi.fn()
  };
  return { host, written, switchBranch };
};

describe('选取之后才出现的推送认领', () => {
  it('写事务之前 push 认领了这条变更：undo 中止，不写、不进 redo 栈', async () => {
    const history = createHistoryItem([localInsert(5)]);
    const { host, written, switchBranch } = createHarness({
      beforeWrite: registry => registry.session().claim('public:User', 5)
    });

    await applyUndoRedoHistories(host, 'undo', [history], session);

    expect(switchBranch).toHaveBeenCalledTimes(1);
    expect(written).not.toHaveBeenCalled();
    expect(host.pushToRedoStack).not.toHaveBeenCalled();
    expect(host.setRevertStateWatermarks).not.toHaveBeenCalled();
    expect(host.redoInvalidationFloor).toBe(0);
    expect(host.isUndoRedoInProgress).toBe(false);
  });

  it('选取之后回执已落库、水位线越过这条变更：undo 同样中止', async () => {
    const history = createHistoryItem([localInsert(5)]);
    const { host, written } = createHarness({ lastPushedChangeId: 5 });

    await applyUndoRedoHistories(host, 'undo', [history], session);

    expect(written).not.toHaveBeenCalled();
    expect(host.pushToRedoStack).not.toHaveBeenCalled();
  });

  it('一笔事务里只要有一条被认领，整笔都不撤', async () => {
    const history = createHistoryItem([localInsert(5), localInsert(6)]);
    const { host, written } = createHarness({
      beforeWrite: registry => registry.session().claim('public:User', 5)
    });

    await applyUndoRedoHistories(host, 'undo', [history], session);

    expect(written).not.toHaveBeenCalled();
  });

  it('认领的是别的仓库，或认领区间在这条变更之前：照常撤销', async () => {
    const history = createHistoryItem([localInsert(5)]);
    const { host, written } = createHarness({
      lastPushedChangeId: 4,
      beforeWrite: registry => {
        const claims = registry.session();
        claims.claim('public:Post', 9);
        claims.claim('public:User', 4);
      }
    });

    await applyUndoRedoHistories(host, 'undo', [history], session);

    expect(written).toHaveBeenCalledTimes(1);
    expect(host.pushToRedoStack).toHaveBeenCalledWith([history]);
  });

  it('redo 不受认领影响：被撤销的变更本来就不在待推集合里', async () => {
    const history = createHistoryItem([localInsert(5, { revertChangeId: 42 })]);
    const { host, written } = createHarness({ lastPushedChangeId: 99 });
    host.rxdb.versionManager.pushInFlight.session().claim('public:User', 99);

    await applyUndoRedoHistories(host, 'redo', [history]);

    expect(written).toHaveBeenCalledTimes(1);
    expect(host.removeFromRedoStack).toHaveBeenCalledWith([history]);
  });
});
