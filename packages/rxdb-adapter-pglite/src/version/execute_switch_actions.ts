import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  getEntityType,
  type EntityData,
  type EntityType,
  type RxDBChange,
  type RxDBEntityId,
  type RxDBEntityLocalCreatedEventData,
  type RxDBEntityLocalRemovedEventData,
  type RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';
import type { PGliteTransactionExecutor } from '../transaction/PGliteTransactionExecutor.js';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { getEntityObjectFromResult } from '../pglite.utils.js';
import remove_all_triggers_sql from '../table/remove_trigger_sql.js';
import { remove_entity_ids_from_cache, transaction_pglite_result } from '../transaction_pglite_result.js';
import { executeSwitchStatements } from './execute_switch_statements.js';
import { SwitchVersionSqlItem, SwitchVersionSqlResult } from './switch-result.interface.js';
import { generateSwitchBranchSql } from './switch_branch.js';

type EntityId = RxDBEntityId;
type SwitchEntity = EntityData & { id: EntityId; createdAt?: Date; updatedAt?: Date };
type SwitchEntityType = EntityType<object, SwitchEntity>;
type SwitchChange = SwitchVersionSqlItem['changes'] extends Map<EntityId, infer Change> ? Change : never;

const requireChange = (action: SwitchVersionSqlItem, id: EntityId): SwitchChange => {
  const change = action.changes.get(id);
  if (!change)
    throw new TypeError(`Missing switch change for ${action.metadata.namespace}.${action.metadata.name}:${id}`);
  return change;
};

const requirePatch = (patch: EntityData | null, label: string): EntityData => {
  if (!patch) throw new TypeError(`Missing ${label} patch`);
  return patch;
};

export async function execute_switch_actions(
  adapter: RxDBAdapterPGlite,
  switchAction: SwitchVersionSqlResult,
  localChanges?: Omit<RxDBChange, 'id'>[],
  disableTriggers = false
): Promise<void> {
  void localChanges;
  const branch = disableTriggers ? await adapter.rxdb.versionManager.getCurrentBranch() : undefined;
  // 用 runInTransaction 而非 transaction：调用方（如 merge_branch 的 normal 策略）
  // 可能已经开了事务把多次 mergeChanges 包起来，此时必须复用当前事务而不是再入队自锁。
  await adapter.runInTransaction(async executor => {
    // ⚠️ 必须用回调收到的 executor 的**门面**，不能用闭包里的 `adapter`。
    // 从真实适配器进来时（`adapter.mergeChanges()` 直调），`runInTransaction` 会开一个事务并
    // 占住队列唯一槽位；此时闭包里的 `adapter.query()` 是外部调用，会重新入队排在自己身后 ——
    // 永久挂起。sqlite 侧的同名函数一直用的是回调参数 `tx`，所以没这个问题。
    const sink = (executor as PGliteTransactionExecutor).adapter;

    if (disableTriggers) {
      const removeTriggers = remove_all_triggers_sql(sink);
      if (removeTriggers) await executeSwitchStatements(sink, removeTriggers);
    }

    for (const deleteAction of switchAction.deletes) {
      deleteAction.successResults = await executeSwitchStatements(sink, deleteAction.sql, deleteAction.params);
    }

    for (const insertAction of switchAction.inserts) {
      insertAction.successResults = await executeSwitchStatements(sink, insertAction.sql);
    }

    for (const updateAction of switchAction.updates) {
      updateAction.successResults = await executeSwitchStatements(sink, updateAction.sql);
    }

    if (disableTriggers && branch) {
      await executeSwitchStatements(sink, generateSwitchBranchSql(adapter, branch.id));
    }
  }, false);

  await dispatch_switch_events(adapter, switchAction);
}

export async function dispatch_switch_events(
  adapter: RxDBAdapterPGlite,
  switchAction: SwitchVersionSqlResult
): Promise<void> {
  for (const deleteAction of switchAction.deletes) {
    const entityType = getEntityType(deleteAction.metadata) as SwitchEntityType;
    const ids = Array.from(deleteAction.ids);
    remove_entity_ids_from_cache(adapter, entityType, ids);

    const metadata = deleteAction.metadata;
    const returnedEntities = await Promise.all(
      requireResults(deleteAction).rows.map(row => getEntityObjectFromResult(metadata, row, adapter.encryptionContext))
    );
    const returnedById = new Map<EntityId, EntityData>(
      returnedEntities.flatMap(entity => {
        const id = Reflect.get(entity, 'id');
        return typeof id === 'string' || typeof id === 'number' || typeof id === 'bigint' ?
            [[id, entity] as const]
          : [];
      })
    );
    const events: RxDBEntityLocalRemovedEventData<SwitchEntityType>[] = ids.map(id => {
      const change = requireChange(deleteAction, id);
      const inversePatch = change.inversePatch ?? returnedById.get(id);
      return {
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'DELETE',
        id,
        patch: null,
        inversePatch: requirePatch(inversePatch ?? null, 'DELETE inverse'),
        recordAt: new Date()
      };
    });
    adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(events));
  }

  for (const insertAction of switchAction.inserts) {
    const entityType = getEntityType(insertAction.metadata) as SwitchEntityType;
    const pgliteResult = convertResultsToPGliteExecuteResult(requireResults(insertAction));
    const result = await transaction_pglite_result(adapter, entityType, pgliteResult);
    const metadata = insertAction.metadata;

    const events: RxDBEntityLocalCreatedEventData<SwitchEntityType>[] = result.map(entity => {
      const change = requireChange(insertAction, entity.id);
      return {
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'INSERT',
        id: entity.id,
        patch: requirePatch(change.patch, 'INSERT') as SwitchEntity,
        inversePatch: null,
        recordAt: entity.createdAt ?? new Date()
      };
    });
    adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(events));
  }

  for (const updateAction of switchAction.updates) {
    const entityType = getEntityType(updateAction.metadata) as SwitchEntityType;
    const pgliteResult = convertResultsToPGliteExecuteResult(requireResults(updateAction));
    const result = await transaction_pglite_result(adapter, entityType, pgliteResult, true);
    const metadata = updateAction.metadata;

    const events: RxDBEntityLocalUpdatedEventData<SwitchEntityType>[] = result.map(entity => {
      const change = requireChange(updateAction, entity.id);
      return {
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'UPDATE',
        id: entity.id,
        patch: requirePatch(change.patch, 'UPDATE'),
        inversePatch: requirePatch(change.inversePatch, 'UPDATE inverse'),
        recordAt: entity.updatedAt ?? entity.createdAt ?? new Date()
      };
    });
    adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
  }
}

const requireResults = (action: SwitchVersionSqlItem): Results<Record<string, unknown>> => {
  if (!action.successResults) {
    throw new TypeError(`Switch SQL for ${action.metadata.namespace}.${action.metadata.name} has not been executed`);
  }
  return action.successResults;
};

function convertResultsToPGliteExecuteResult<T>(results: Results<T>): {
  rows: T[];
  rowsAffected: number;
  elapsed: number;
} {
  return {
    rows: results.rows,
    rowsAffected: results.affectedRows ?? results.rows.length,
    elapsed: 0
  };
}
