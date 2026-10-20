/**
 * 已被子分支继承的变更 × undo / redo（US-315，修法 A）
 *
 * 父分支上不晚于子分支分叉点的变更已被子分支继承：撤销或重做它们会让子分支记下的反向补丁过期，
 * 切回父分支时读到错值。撤销 / 重做的候选去掉它们，栈停在分叉点并说明原因。
 *
 * 真后端上的端到端判定在适配器的分支套件里（PGlite `undo_inherited_change.spec.ts`、SQLite 共享分支套件）；
 * 这里钉住纯函数的口径，以及「选候选之后才建出子分支」那个只能在写事务里判的竞态。
 */
import { RxDBBranch, type RxDB, type RxDBChange, type UUID } from '@aiao/rxdb';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  childForksOf,
  filterUndoableHistories,
  historyBarrierOf,
  inheritedFloorOf,
  partitionUndoableHistories,
  splitRedoableHistories
} from '../history-filters.js';
import { createHistoryItem } from '../history-item-builder.js';
import type { ActiveUndoSession } from '../history-undo-session.types.js';
import { applyUndoRedoHistories, type UndoRedoApplyHost } from '../undo-redo-apply.js';

const firstConnectedAt = new Date('2026-10-20T08:00:00.000Z');

const change = (id: number, overrides: Partial<RxDBChange> = {}): RxDBChange =>
  ({
    id,
    branchId: 'main',
    remoteId: null,
    transactionId: null,
    namespace: 'public',
    entity: 'Todo',
    entityId: `todo-${id}` as UUID,
    type: 'UPDATE',
    patch: { title: `v${id}` },
    inversePatch: { title: `v${id - 1}` },
    createdAt: new Date(firstConnectedAt.getTime() + id * 1000),
    updatedAt: new Date(firstConnectedAt.getTime() + id * 1000),
    revertChangeId: null,
    redoInvalidatedAt: null,
    ...overrides
  }) as RxDBChange;

const history = (...changes: RxDBChange[]) => createHistoryItem(changes);
const ids = (histories: readonly { changeId: number }[]) => histories.map(item => item.changeId);

describe('子分支分叉点', () => {
  it('fromChangeId 为空的子分支不继承本分支的变更，指回自己的那一行不算子分支', () => {
    expect(
      childForksOf(
        [
          { id: 'feature', fromChangeId: 4 },
          { id: 'empty-start', fromChangeId: null },
          { id: 'main', fromChangeId: 9 }
        ],
        'main'
      )
    ).toEqual([{ branchId: 'feature', fromChangeId: 4 }]);
  });

  it('继承下限取最晚的分叉点，没有子分支时为 0', () => {
    expect(inheritedFloorOf([])).toBe(0);
    expect(
      inheritedFloorOf([
        { branchId: 'a', fromChangeId: 3 },
        { branchId: 'b', fromChangeId: 7 }
      ])
    ).toBe(7);
  });

  it('拦住栈的原因列出分叉点不早于那一项的子分支，按 id 升序', () => {
    const forks = [
      { branchId: 'zeta', fromChangeId: 5 },
      { branchId: 'alpha', fromChangeId: 6 },
      { branchId: 'early', fromChangeId: 2 }
    ];
    expect(historyBarrierOf(history(change(5)), forks)).toEqual({
      reason: 'inherited_by_branch',
      branchIds: ['alpha', 'zeta']
    });
  });
});

describe('撤销候选', () => {
  it('不晚于分叉点的历史项归为「被继承」，其余照旧可撤销；两组都保持最新在前', () => {
    const histories = [history(change(6)), history(change(5)), history(change(4)), history(change(3))];
    const { undoable, inherited } = partitionUndoableHistories(histories, new Map(), 0, null, 4);
    expect(ids(undoable)).toEqual([6, 5]);
    expect(ids(inherited)).toEqual([4, 3]);
    expect(ids(filterUndoableHistories(histories, new Map(), 0, null, 4))).toEqual([6, 5]);
  });

  it('因别的原因撤销不了的（已推送、已撤销）不算被继承，免得把原因说错', () => {
    const pushed = history(change(2));
    const reverted = { ...history(change(1)), reverted: true };
    const { inherited } = partitionUndoableHistories([pushed, reverted], new Map([['public:Todo', 2]]), 0, null, 5);
    expect(inherited).toEqual([]);
  });

  it('事务里有一条变更落在分叉点之内，整条事务都撤不了', () => {
    const transactionId = 'tx-1' as UUID;
    const transaction = history(change(5, { transactionId }), change(4, { transactionId }));
    const { undoable, inherited } = partitionUndoableHistories([transaction], new Map(), 0, null, 4);
    expect(undoable).toEqual([]);
    expect(inherited).toHaveLength(1);
  });

  it('不传继承下限时与原来逐字一致', () => {
    const histories = [history(change(2)), history(change(1))];
    expect(ids(filterUndoableHistories(histories, new Map()))).toEqual([2, 1]);
  });
});

describe('重做候选', () => {
  const database = { type: 'database' } as const;

  it('截在第一项被继承的之前，不跳过它去重做后面的', () => {
    // 栈顶在前：最后撤的是最早的那条
    const stack = [history(change(1)), history(change(3))];
    expect(splitRedoableHistories(stack, database, 2)).toEqual({ redoable: [], blockedBy: stack[0] });
  });

  it('分叉点之后撤销的照常重做', () => {
    const stack = [history(change(5)), history(change(6))];
    expect(splitRedoableHistories(stack, database, 4)).toEqual({ redoable: stack, blockedBy: null });
  });

  it('作用域外的被继承项不拦作用域内的重做', () => {
    const other = history(change(1, { entityId: 'other' as UUID }));
    const mine = history(change(6, { entityId: 'mine' as UUID }));
    const scope = { type: 'entity', namespace: 'public', entity: 'Todo', entityId: 'mine' } as const;
    expect(splitRedoableHistories([other, mine], scope, 4)).toEqual({ redoable: [mine], blockedBy: null });
  });
});

describe('写事务里复核分叉点（选候选之后才建出子分支）', () => {
  const session: ActiveUndoSession = { generation: 1, state: 'active', boundary: { changeId: 0, createdAfter: null } };

  /** switchBranch 照适配器的义务在事务里调 prepare；事务内读到的子分支由 `children` 给出。 */
  const createHarness = (children: Array<{ id: string; fromChangeId: number | null }>) => {
    const find = vi.fn().mockResolvedValue(children);
    const executor = {
      getRepository: (entity: unknown) => {
        if (entity !== RxDBBranch) throw new Error('只该查分支表');
        return { find };
      }
    };
    const switchBranch = vi.fn(async (options: { prepare: (context: unknown) => Promise<void> }) => {
      await options.prepare({ executor, targetBranchId: 'main' });
    });
    const adapter = { getRxDBChangeSequence: vi.fn().mockResolvedValue(10), switchBranch };
    const rxdb = {
      versionManager: {
        getLocalRepositories: vi.fn().mockResolvedValue({ adapter, branchRepository: {}, changeRepository: {} })
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
      getFirstConnectedAt: () => firstConnectedAt,
      isUndoSessionCurrent: () => true,
      getNextRevertStateUpdatedAt: () => new Date(),
      setRevertStateWatermarks: vi.fn(),
      pushToRedoStack: vi.fn(),
      removeFromRedoStack: vi.fn()
    };
    return { host, find, switchBranch };
  };

  it('事务内读到的子分支继承了这批变更：回滚、栈不动、redo 失效水位不动，与撤销停在分叉点同一个结果', async () => {
    const { host, find } = createHarness([{ id: 'feature', fromChangeId: 5 }]);
    const item = history(change(5));

    await expect(applyUndoRedoHistories(host, 'undo', [item], session)).resolves.toBeUndefined();

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: 'main' }] }
      })
    );
    expect(host.pushToRedoStack).not.toHaveBeenCalled();
    expect(host.setRevertStateWatermarks).not.toHaveBeenCalled();
    expect(host.redoInvalidationFloor).toBe(0);
    expect(host.isUndoRedoInProgress).toBe(false);
  });

  it('重做同理：被继承就不重放、不出栈', async () => {
    const { host } = createHarness([{ id: 'feature', fromChangeId: 5 }]);

    await applyUndoRedoHistories(host, 'redo', [history(change(5))]);

    expect(host.removeFromRedoStack).not.toHaveBeenCalled();
    expect(host.setRevertStateWatermarks).not.toHaveBeenCalled();
  });

  it('事务内的子分支只继承了更早的变更：照常写入、进栈、抬水位', async () => {
    const { host } = createHarness([
      { id: 'feature', fromChangeId: 4 },
      { id: 'blank', fromChangeId: null }
    ]);
    const item = history(change(5));

    await applyUndoRedoHistories(host, 'undo', [item], session);

    expect(host.pushToRedoStack).toHaveBeenCalledWith([item]);
    expect(host.redoInvalidationFloor).toBe(11);
  });

  it('事务里别的错误照样抛出', async () => {
    const { host, switchBranch } = createHarness([]);
    switchBranch.mockRejectedValueOnce(new Error('disk full'));

    await expect(applyUndoRedoHistories(host, 'undo', [history(change(5))], session)).rejects.toThrow('disk full');
    expect(host.pushToRedoStack).not.toHaveBeenCalled();
    expect(host.isUndoRedoInProgress).toBe(false);
  });
});
