import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import type { FindOptions } from '../repository/query-options.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import type { RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import { isAdapterShutdownError } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import type { RxDBChangeRuleGroup, RxDBSyncOrderByField, RxDBSyncRuleGroup } from '../system/types.js';
import { getRepositoryKey } from './history-filters.js';
import { convertChangesToHistories } from './history-item-builder.js';
import type { ActiveUndoSession, UndoBoundary } from './history-undo-session.types.js';
import { buildPushableRepositoryRules } from './pushable-repository-rules.js';
import { get_switch_version_actions } from './switch-branch-actions.js';
import type { HistoryItem } from './VersionManager.interface.js';

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

/** 绕过 Observable 缓存，直接查最新变更再转成历史项。 */
export async function fetchLatestHistories(
  host: UndoRedoApplyHost,
  undoBoundary: UndoBoundary
): Promise<{ histories: HistoryItem[]; lastPushedMap: Map<string, number> }> {
  const { changeRepository: adapter, branchRepository } = await host.rxdb.versionManager.getLocalRepositories();

  const branches = await branchRepository.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'activated', operator: '=', value: true }]
    }
  });

  if (branches.length === 0) {
    return { histories: [], lastPushedMap: new Map() };
  }

  const branch = branches[0];

  const localAdapter = await firstValueFrom(host.rxdb.localAdapter$);
  const repoSyncRepo = getLocalRxDBSyncRepository(localAdapter);
  const repoSyncs = await repoSyncRepo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'branchId', operator: '=', value: branch.id }]
    }
  });

  const lastPushedMap = new Map<string, number>();
  for (const rs of repoSyncs) {
    if (rs.lastPushedChangeId !== null) {
      lastPushedMap.set(getRepositoryKey(rs), rs.lastPushedChangeId);
    }
  }

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

  return { histories: convertChangesToHistories(allChanges), lastPushedMap };
}

/**
 * 应用 undo/redo：提取排序 → switchBranch actions → 元数据 → 身份检查 → 切分支 → 栈。
 *
 * undo 在 `adapter.switchBranch` 前必须做 session 对象身份检查。
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
      host.redoInvalidationFloor = seq + changes.length;
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
    const currentBranch = await host.rxdb.versionManager.getCurrentBranch();
    if (operation === 'undo') {
      if (undoSession === undefined || !host.isUndoSessionCurrent(undoSession)) return;
    }
    await adapter.switchBranch({
      branchId: currentBranch.id,
      actions
    });

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
      host.rxdb.entityManager.getRepository(RxDBBranch).findOne({
        where: {
          combinator: 'and',
          rules: [{ field: 'activated', operator: '=', value: true }]
        }
      })
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

    const repoRules = buildPushableRepositoryRules(host.rxdb.config.entities, host.rxdb.config.sync, repoSyncs);
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
