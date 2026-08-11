import { RxDBError } from '../RxDBError.js';
import type { RxDBEntityId } from '../entity/entity.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import type { RxDBEvent } from '../rxdb-events.js';
import { ConflictDetectedEvent, ConflictPendingEvent } from '../rxdb-events.js';
import { getRxDBChangeEntityIdQueryValues } from '../system/change-codec.js';
import { RxDBChange } from '../system/change.js';
import type { RemoteChange } from '../system/system.interface.js';
import type { RxDBChangeRuleGroup } from '../system/types.js';
import type { SwitchVersionActions, SwitchVersionChange } from './VersionManager.interface.js';
import { getRxDBChangeKey } from './VersionManager.utils.js';
import type { Conflict, ConflictResolver } from './conflict.js';

export type ActionType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ConflictActionEntry {
  key: string;
  entityId: RxDBEntityId;
  type: ActionType;
  change: SwitchVersionChange;
  remote: RemoteChange;
}

export function createEmptyActions(): SwitchVersionActions {
  return {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map()
  };
}

export function countActions(actions: SwitchVersionActions): number {
  return actions.inserts.size + actions.updates.size + actions.deletes.size;
}

export function setAction(actions: SwitchVersionActions, entry: ConflictActionEntry): void {
  if (entry.type === 'INSERT') {
    actions.inserts.set(entry.key, entry.change);
    return;
  }

  if (entry.type === 'UPDATE') {
    actions.updates.set(entry.key, entry.change);
    return;
  }

  actions.deletes.set(entry.key, entry.change);
}

export function createConflictActionEntries(
  otherChanges: RemoteChange[],
  actions: SwitchVersionActions
): ConflictActionEntry[] {
  const latestRemoteByKey = new Map<string, RemoteChange>();

  for (const remoteChange of otherChanges) {
    const key = getRxDBChangeKey(remoteChange);
    const existing = latestRemoteByKey.get(key);
    if (!existing || remoteChange.id > existing.id) {
      latestRemoteByKey.set(key, remoteChange);
    }
  }

  const entries: ConflictActionEntry[] = [];

  const collect = (map: Map<string, SwitchVersionChange>, type: ActionType) => {
    for (const [key, change] of map) {
      const latestRemote = latestRemoteByKey.get(key);
      if (!latestRemote) {
        continue;
      }

      entries.push({
        key,
        entityId: latestRemote.entityId,
        type,
        change,
        remote: {
          ...latestRemote,
          type,
          patch: change.patch ?? null,
          inversePatch: change.inversePatch ?? null
        }
      });
    }
  };

  collect(actions.inserts, 'INSERT');
  collect(actions.updates, 'UPDATE');
  collect(actions.deletes, 'DELETE');

  return entries;
}

export async function queryPendingLocalChanges(
  changeRepo: IRepository<typeof RxDBChange>,
  namespace: string,
  entity: string,
  branchId: string,
  lastPushedChangeId: number | null,
  entityIds: RxDBEntityId[]
): Promise<Map<string, RxDBChange[]>> {
  if (entityIds.length === 0) {
    return new Map();
  }

  const rules: RxDBChangeRuleGroup['rules'] = [
    { field: 'namespace', operator: '=', value: namespace },
    { field: 'entity', operator: '=', value: entity },
    { field: 'branchId', operator: '=', value: branchId },
    { field: 'remoteId', operator: '=', value: null },
    { field: 'revertChangeId', operator: '=', value: null },
    { field: 'entityId', operator: 'in', value: getRxDBChangeEntityIdQueryValues(entityIds) }
  ];

  if (lastPushedChangeId !== null) {
    rules.push({ field: 'id', operator: '>', value: lastPushedChangeId });
  }

  const pendingChanges = (await changeRepo.find({
    where: {
      combinator: 'and',
      rules
    },
    orderBy: [{ field: 'id', sort: 'asc' }]
  })) as RxDBChange[];

  const grouped = new Map<string, RxDBChange[]>();
  for (const change of pendingChanges) {
    const key = getRxDBChangeKey(change);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(change);
  }

  return grouped;
}

export async function markLocalChangesSuperseded(
  changeRepo: IRepository<typeof RxDBChange>,
  localChanges: RxDBChange[],
  remoteId: number
): Promise<void> {
  for (const localChange of localChanges) {
    await changeRepo.update(localChange, {
      remoteId,
      updatedAt: new Date()
    });
  }
}

export interface ResolveConflictsContext {
  changeRepo: IRepository<typeof RxDBChange>;
  conflictResolver: ConflictResolver;
  dispatchEvent: (event: RxDBEvent) => void;
  repoLabel: string;
  deferLocalChangeSupersession?: boolean;
  /**
   * 当前客户端 id，用于给冲突的本地侧打戳。
   *
   * @remarks
   * `RxDBChange` 表没有 clientId 列，直接把本地行交给解决器时 `conflict.local.clientId`
   * 恒为 `undefined`，LWW 的 tie-breaker 永不触发、永远退回 KEEP_LOCAL —— 两个副本各自
   * 保留自己，永久分叉。本地未同步的 change 按定义就是本客户端产生的，
   * 在这里打戳与加列等价，且不需要持久化格式变更。
   */
  localClientId?: string;
}

export interface LocalChangeSupersession {
  localChanges: RxDBChange[];
  remoteId: number;
}

export interface ResolveConflictsResult {
  applyActions: SwitchVersionActions;
  conflictsResolved: number;
  localChangeSupersessions: LocalChangeSupersession[];
}

/**
 * 给冲突的本地侧补上当前 clientId，供 LWW 的 tie-breaker 使用。
 *
 * @remarks
 * 不能就地赋值：本地行是被 Proxy 跟踪的实体，写入会把它标脏并试图持久化一个不存在的列。
 * 复制时保留原型，避免 DEFER 消费者从 `ConflictPendingEvent` 拿到的对象丢掉实体方法。
 */
const withLocalClientId = (change: RxDBChange, clientId: string | undefined): RxDBChange => {
  if (!clientId) return change;
  return Object.assign(Object.create(Object.getPrototypeOf(change) as object) as RxDBChange, change, { clientId });
};

export async function resolveConflictsAndBuildActions(
  actionEntries: ConflictActionEntry[],
  pendingLocalChanges: Map<string, RxDBChange[]>,
  context: ResolveConflictsContext
): Promise<ResolveConflictsResult> {
  const applyActions = createEmptyActions();
  const detectedConflicts: Conflict[] = [];
  const actionEntryByKey = new Map(actionEntries.map(entry => [entry.key, entry]));
  const localChangeSupersessions: LocalChangeSupersession[] = [];

  for (const actionEntry of actionEntries) {
    const localChangesForEntity = pendingLocalChanges.get(actionEntry.key);

    if (!localChangesForEntity || localChangesForEntity.length === 0) {
      setAction(applyActions, actionEntry);
      continue;
    }

    detectedConflicts.push({
      entityKey: actionEntry.key,
      local: withLocalClientId(localChangesForEntity[localChangesForEntity.length - 1], context.localClientId),
      remote: actionEntry.remote
    });
  }

  let conflictsResolved = 0;

  if (detectedConflicts.length > 0) {
    const { conflictResolver, changeRepo, dispatchEvent, repoLabel } = context;
    const resolutions =
      conflictResolver.resolveAll ?
        await conflictResolver.resolveAll(detectedConflicts)
      : await Promise.all(detectedConflicts.map(conflict => conflictResolver.resolve(conflict)));

    const deferredConflicts: Conflict[] = [];
    for (let index = 0; index < detectedConflicts.length; index += 1) {
      const conflict = detectedConflicts[index];
      const resolution = resolutions[index];
      const actionEntry = actionEntryByKey.get(conflict.entityKey);
      const localChangesForEntity = pendingLocalChanges.get(conflict.entityKey) ?? [];

      if (!actionEntry) {
        continue;
      }

      if (resolution.type === 'KEEP_LOCAL') {
        conflictsResolved += 1;
        continue;
      }

      if (resolution.type === 'KEEP_REMOTE') {
        conflictsResolved += 1;
        localChangeSupersessions.push({
          localChanges: localChangesForEntity,
          remoteId: actionEntry.remote.id
        });
        setAction(applyActions, actionEntry);
        continue;
      }

      deferredConflicts.push(conflict);
    }

    if (deferredConflicts.length > 0) {
      dispatchEvent(new ConflictDetectedEvent(detectedConflicts, 0, deferredConflicts.length));
      dispatchEvent(new ConflictPendingEvent(deferredConflicts));
      throw new RxDBError(
        `Unsupported conflict resolution returned during pull for ${repoLabel}. ` +
          `Only KEEP_LOCAL and KEEP_REMOTE can be applied automatically at runtime.`
      );
    }

    dispatchEvent(new ConflictDetectedEvent(detectedConflicts, detectedConflicts.length, 0));

    if (!context.deferLocalChangeSupersession) {
      for (const supersession of localChangeSupersessions) {
        await markLocalChangesSuperseded(changeRepo, supersession.localChanges, supersession.remoteId);
      }
    }
  }

  return { applyActions, conflictsResolved, localChangeSupersessions };
}
