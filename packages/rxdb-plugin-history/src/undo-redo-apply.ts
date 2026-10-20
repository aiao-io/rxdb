import {
  buildPushableRepositoryRules,
  declareTrustedWrite,
  type FindOptions,
  type HistoryItem,
  type IRepository,
  isAdapterShutdownError,
  type LocalRxDBBranchRepository,
  type RxDB,
  type RxDBAdapterLocalBase,
  RxDBBranch,
  RxDBChange,
  type RxDBChangeRuleGroup,
  RxDBError,
  RxDBSync,
  type RxDBSyncOrderByField,
  type RxDBSyncRuleGroup,
  TrustedWriteIntent
} from '@aiao/rxdb';
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { buildLastPushedMap, type ChildFork, childForksOf, inheritedFloorOf } from './history-filters.js';
import { convertChangesToHistories } from './history-item-builder.js';
import type { ActiveUndoSession, UndoBoundary } from './history-undo-session.types.js';
import { get_switch_version_actions } from './switch-branch-actions.js';
type LocalRxDBSyncRepository = IRepository<typeof RxDBSync> & {
  find(options: FindOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>): Promise<RxDBSync[]>;
};

export const getLocalRxDBSyncRepository = (adapter: RxDBAdapterLocalBase): LocalRxDBSyncRepository =>
  adapter.getRepository<typeof RxDBSync, LocalRxDBSyncRepository>(RxDBSync);

/**
 * undo / redo / pushableCount 所需的可变状态。
 *
 * `#` 字段必须通过 getter/setter 关闭 captured 实例；Map / Subject 用类持有的同一份引用。
 */
export interface UndoRedoApplyHost {
  readonly rxdb: RxDB;
  readonly destroyed: boolean;
  isUndoRedoInProgress: boolean;
  redoInvalidationFloor: number;
  pushableGeneration: number;
  readonly pushableCount$: BehaviorSubject<number>;
  readonly pushableCountTrigger$: BehaviorSubject<number>;
  readonly errors$: Subject<Error>;
  getFirstConnectedAt(): Date;
  isUndoSessionCurrent(session: ActiveUndoSession): boolean;
  getNextRevertStateUpdatedAt(changes: RxDBChange[]): Date;
  setRevertStateWatermarks(changes: RxDBChange[], reverted: boolean, updatedAt: Date): void;
  pushToRedoStack(items: HistoryItem[]): void;
  removeFromRedoStack(items: HistoryItem[]): HistoryItem[];
}

/**
 * 查一条分支的子分支分叉点。
 *
 * @param branchRepository - 查分支的仓库；在写事务里复核时传事务内的那一份
 * @param branchId - 分支 id
 * @returns 见 {@link childForksOf}
 */
export async function fetchChildForks(
  branchRepository: LocalRxDBBranchRepository,
  branchId: string
): Promise<ChildFork[]> {
  const children = await branchRepository.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'parentId', operator: '=', value: branchId }]
    },
    // 默认只取 100 行；少一条子分支就少一个分叉点，被它继承的变更就成了可撤销的
    limit: Number.MAX_SAFE_INTEGER
  });
  return childForksOf(children, branchId);
}

/** 绕过 Observable 缓存，直接查最新变更再转成历史项；子分支分叉点一并查出。 */
export async function fetchLatestHistories(
  host: UndoRedoApplyHost,
  undoBoundary: UndoBoundary
): Promise<{ histories: HistoryItem[]; lastPushedMap: Map<string, number>; forks: ChildFork[] }> {
  const { changeRepository: adapter, branchRepository } = await host.rxdb.versionManager.getLocalRepositories();

  // 本实例的当前分支：挂的那套表持有的分支（US-314 B1.4）
  const branches = await branchRepository.find({ where: host.rxdb.worktreeTableSet.heldBranchWhere });

  if (branches.length === 0) {
    return { histories: [], lastPushedMap: new Map(), forks: [] };
  }

  const branch = branches[0];
  const forks = await fetchChildForks(branchRepository, branch.id);

  const localAdapter = await firstValueFrom(host.rxdb.localAdapter$);
  const repoSyncRepo = getLocalRxDBSyncRepository(localAdapter);
  const repoSyncs = await repoSyncRepo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'branchId', operator: '=', value: branch.id }]
    }
  });

  // 带上在飞认领：远端往返途中的变更视同已推，否则这段窗口里的 undo 会造成永久分叉
  const lastPushedMap = buildLastPushedMap(repoSyncs, host.rxdb.versionManager.pushInFlight.snapshot());

  const rules: RxDBChangeRuleGroup['rules'] = [
    {
      field: 'branchId',
      operator: '=',
      value: branch.id
    },
    {
      field: 'createdAt',
      operator: '>=',
      value: host.getFirstConnectedAt()
    }
  ];
  if (undoBoundary.changeId > 0) {
    rules.push({ field: 'id', operator: '>', value: undoBoundary.changeId });
  }
  const allChanges = await adapter.find({
    where: {
      combinator: 'and',
      rules
    },
    orderBy: [{ field: 'id', sort: 'desc' }]
  });

  return { histories: convertChangesToHistories(allChanges), lastPushedMap, forks };
}

/**
 * 应用 undo/redo：提取排序 → switchBranch actions → 元数据 → 身份检查 → 切分支 → 栈。
 *
 * undo 在 `adapter.switchBranch` 前必须做 session 对象身份检查。
 *
 * @remarks
 * 调用方按选候选时读到的子分支分叉点排除了被继承的变更（US-315），但从选候选到写入之间，
 * 另一个标签页可能刚从本分支建出子分支，这批变更就成了被继承的。写事务的前置钩子按事务内读到的
 * 子分支再判一次，撞上就回滚：什么也不写、栈不动，与撤销 / 重做停在分叉点同一个结果，原因由
 * `undoBarrier$` / `redoBarrier$` 给出。建分支与这次写入同在写队列里，二者只能一先一后。
 */
export async function applyUndoRedoHistories(
  host: UndoRedoApplyHost,
  operation: 'undo' | 'redo',
  histories: HistoryItem[],
  undoSession?: ActiveUndoSession
): Promise<void> {
  host.isUndoRedoInProgress = true;

  try {
    const changes = histories
      .flatMap(h => h.changes)
      .sort((a, b) => (operation === 'undo' ? b.id - a.id : a.id - b.id));

    const actions = get_switch_version_actions(changes, operation === 'redo');
    const stateUpdatedAt = host.getNextRevertStateUpdatedAt(changes);
    let redoInvalidationFloor: number | null = null;

    if (operation === 'undo') {
      const { adapter } = await host.rxdb.versionManager.getLocalRepositories();
      const seq = await adapter.getRxDBChangeSequence();
      const revertChangedAt = new Date();

      changes.forEach((change, index) => {
        const changeKey = `rxdb:RxDBChange:${change.id}`;
        const existingUpdate = actions.updates.get(changeKey) || { patch: {}, inversePatch: null };
        actions.updates.set(changeKey, {
          patch: {
            ...existingUpdate.patch,
            revertChangeId: seq + index + 1,
            revertChangedAt,
            updatedAt: stateUpdatedAt
          },
          inversePatch: existingUpdate.inversePatch
        });
      });
      actions.updateRxDBChangeSequence = seq + changes.length;
      // 写成功之后才抬水位：回滚了的话序列号没被占用，下一条本地变更正好落在水位之下，它的 redo 失效会被当成迟到通知跳过
      redoInvalidationFloor = seq + changes.length;
    } else {
      changes.forEach(change => {
        const changeKey = `rxdb:RxDBChange:${change.id}`;
        const existingUpdate = actions.updates.get(changeKey) || { patch: {}, inversePatch: null };
        actions.updates.set(changeKey, {
          patch: {
            ...existingUpdate.patch,
            revertChangeId: null,
            updatedAt: stateUpdatedAt
          },
          inversePatch: existingUpdate.inversePatch
        });
      });
    }

    const { adapter } = await host.rxdb.versionManager.getLocalRepositories();
    if (operation === 'undo') {
      if (undoSession === undefined || !host.isUndoSessionCurrent(undoSession)) return;
    }
    // undo/redo 是用户可感知的编辑，矩阵行 6 要求它**产生**单元（origin='undo_redo'）。
    declareTrustedWrite(adapter, {
      file: 'undo-redo-apply.ts',
      symbol: 'applyUndoRedoHistories',
      intent: TrustedWriteIntent.undo_redo
    });
    // 不传 branchId：回放只作用于当前分支。在事务外采样分支 id 会让这次写入在并发切换时
    // 把 activated 与全部触发器倒回旧分支（见 SwitchBranchOptions.branchId）。
    // 分支一动不动，前置条件只有一条：这批变更此刻还没被子分支继承。`targetBranchId` 就是当前分支。
    // 回滚靠抛错，判没判中靠标志：适配器的事务包装层可能改写异常身份，不拿错误对象做比较。
    let inherited = false;
    try {
      await adapter.switchBranch({
        actions,
        prepare: async ({ executor, targetBranchId }) => {
          const branchRepository = executor.getRepository(RxDBBranch) as unknown as LocalRxDBBranchRepository;
          const floor = inheritedFloorOf(await fetchChildForks(branchRepository, targetBranchId));
          if (changes.some(change => change.id <= floor)) {
            inherited = true;
            throw new RxDBError(
              `${operation} aborted: the changes were inherited by a child branch since they were selected`
            );
          }
        }
      });
    } catch (error) {
      if (inherited) return;
      throw error;
    }

    if (redoInvalidationFloor !== null) host.redoInvalidationFloor = redoInvalidationFloor;
    host.pushableCountTrigger$.next(Date.now());
    host.setRevertStateWatermarks(changes, operation === 'undo', stateUpdatedAt);

    if (operation === 'undo') {
      host.pushToRedoStack(histories);
    } else {
      host.removeFromRedoStack(histories);
    }
  } finally {
    host.isUndoRedoInProgress = false;
  }
}

/**
 * 按 repository 水位线异步刷新 pushableCount。
 *
 * 只有仍是最新那次刷新才有资格改写计数。失败字符串 `'[#updatePushableCount] error'` 不得改。
 */
export async function updatePushableCount(host: UndoRedoApplyHost): Promise<void> {
  const generation = ++host.pushableGeneration;
  const publish = (count: number): void => {
    if (generation === host.pushableGeneration) {
      host.pushableCount$.next(count);
    }
  };

  try {
    const connected = await firstValueFrom(host.rxdb.connected$);
    if (!connected) {
      publish(0);
      return;
    }

    const localAdapter = await firstValueFrom(host.rxdb.localAdapter$);
    const RxDBSyncRepo = getLocalRxDBSyncRepository(localAdapter);
    const changeRepository = host.rxdb.entityManager.getRepository(RxDBChange);
    const branch = await firstValueFrom(
      host.rxdb.entityManager.getRepository(RxDBBranch).findOne({ where: host.rxdb.worktreeTableSet.heldBranchWhere })
    );

    if (!branch) {
      publish(0);
      return;
    }

    const repoSyncs = await RxDBSyncRepo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'branchId', operator: '=', value: branch.id }]
      }
    });

    const repoRules = buildPushableRepositoryRules(host.rxdb.config.entities, host.rxdb.entitySync, repoSyncs);
    if (repoRules.length === 0) {
      publish(0);
      return;
    }

    const count = await firstValueFrom(
      changeRepository.count({
        where: {
          combinator: 'and',
          rules: [
            { field: 'branchId', operator: '=', value: branch.id },
            { field: 'revertChangeId', operator: '=', value: null },
            { field: 'remoteId', operator: '=', value: null },
            {
              combinator: 'or',
              rules: repoRules
            }
          ]
        }
      })
    );

    publish(count);
  } catch (error) {
    if (!host.destroyed && !isAdapterShutdownError(error)) {
      console.error('[#updatePushableCount] error', error);
      host.errors$.next(error instanceof Error ? error : new Error(String(error)));
    }
    publish(0);
  }
}
