import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  getEntityMetadata,
  getEntityType,
  RxDBChange,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { get_sql_value, get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';
import { envelopePlaintextPatches } from '../system/encrypt-patch.js';
import { remove_entity_ids_from_cache, transaction_sqlite_result } from '../transaction_sqlite_result.js';
import {
  executeSqliteSelectStatements,
  executeSqliteStatements,
  type SqlStatementSink
} from './execute-sql-statements.js';
import type { SwitchVersionSqlResult } from './switch-result.utils.js';
import { withTriggersDisabled } from './with_triggers_disabled.js';

/**
 * 按 删除 → 插入 → 更新 的顺序应用一组 SQL 操作，并回填各自的 SELECT 结果。
 *
 * @param tx - 当前事务的执行器
 * @param switchAction - 已转换的 SQL 操作集合；`successResults` 就地写回
 *
 * @remarks
 * 抽成独立函数是为了让触发器三明治（{@link withTriggersDisabled}）能整段包住它 ——
 * 内联在事务回调里会把嵌套顶到四层。
 */
async function applySwitchActions(tx: SqlStatementSink, switchAction: SwitchVersionSqlResult): Promise<void> {
  for (const deleteAction of switchAction.deletes) {
    await executeSqliteStatements(tx, deleteAction.statements);
  }

  for (const insertAction of switchAction.inserts) {
    await executeSqliteStatements(tx, insertAction.statements);
    insertAction.successResults = await executeSqliteSelectStatements(tx, insertAction.selectStatements);
  }

  for (const updateAction of switchAction.updates) {
    await executeSqliteStatements(tx, updateAction.statements);
    updateAction.successResults = await executeSqliteSelectStatements(tx, updateAction.selectStatements);
  }
}

/**
 * 执行 SwitchVersionSqlResult 中的 SQL 操作并发送事件
 *
 * @param adapter - SQLite adapter 实例
 * @param switchAction - 已转换的 SQL 操作集合
 * @param disableTriggers - 是否禁用触发器（用于 pull 等操作，避免创建 RxDBChange）
 * @param localChanges - pull 场景下需要记录到 RxDBChange 表的变更
 */
export async function execute_switch_actions(
  adapter: RxDBAdapterSqliteBase,
  switchAction: SwitchVersionSqlResult,
  disableTriggers = false,
  localChanges?: Omit<RxDBChange, 'id'>[]
): Promise<void> {
  // 1. 在单个事务中执行所有 SQL 操作，保证原子性。
  //    用 runInTransaction 而非 transaction：调用方（如 merge_branch 的 normal 策略）
  //    可能已经开了事务把多次 mergeChanges 包起来，此时必须复用当前事务而不是再入队自锁。
  //
  //    disableTriggers 的「删触发器 → 应用变更 → 重建触发器」必须同事务完成：
  //    拆到第二次 runInTransaction / getCurrentBranch 会在 C2 嵌套事务下自死锁
  //    （见 readCurrentBranchId 注释）。
  await adapter.runInTransaction(async tx => {
    const applyActions = () => applySwitchActions(tx, switchAction);
    if (!disableTriggers) {
      await applyActions();
      return;
    }
    await withTriggersDisabled(adapter, tx, async () => {
      await applyActions();
      // 触发器被禁用时，pull 带进来的变更由调用方显式给出，手动补写 RxDBChange 记录
      if (localChanges?.length) {
        await tx.execute(await buildLocalChangesSql(adapter, localChanges));
      }
    });
  }, false);

  // 2. 提交成功后再发送事件通知 UI 更新
  await dispatch_switch_events(adapter, switchAction);
}

/**
 * 发送 switch 操作对应的本地事件
 */
export async function dispatch_switch_events(
  adapter: RxDBAdapterSqliteBase,
  switchAction: SwitchVersionSqlResult
): Promise<void> {
  // DELETE 事件
  for (const deleteAction of switchAction.deletes) {
    const entityType = getEntityType(deleteAction.metadata);
    remove_entity_ids_from_cache(adapter, entityType, Array.from(deleteAction.ids));

    const metadata = deleteAction.metadata;
    const events: RxDBEntityLocalRemovedEventData[] = Array.from(deleteAction.ids).map(id => {
      const change = deleteAction.changes.get(id);
      return {
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'DELETE',
        id,
        patch: null,
        inversePatch: change?.inversePatch ?? {},
        recordAt: new Date()
      };
    });
    adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(events));
  }

  // INSERT 事件
  for (const insertAction of switchAction.inserts) {
    if (!insertAction.successResults) continue;
    const entityType = getEntityType(insertAction.metadata);
    // forcedUpdate=true：恢复 INSERT 常常命中缓存里那个刚被标成 removed、字段停在删除前
    // 快照的旧引用。此刻数据库是权威，必须连同 origin 一起全量 hydrate（与下面 UPDATE
    // 路径一致），否则 UI 继续显示旧数据，且下一次 patch 会把"恢复"误算成本地未保存修改（SQLC-019）
    const result = await transaction_sqlite_result(adapter, entityType, insertAction.successResults, true);
    const metadata = insertAction.metadata;

    const events: RxDBEntityLocalCreatedEventData[] = result.map(entity => {
      const change = insertAction.changes.get(entity.id);
      return {
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'INSERT',
        id: entity.id,
        patch: change?.patch ?? { ...entity },
        inversePatch: null,
        recordAt: entity.createdAt
      };
    });
    adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(events));
  }

  // UPDATE 事件
  for (const updateAction of switchAction.updates) {
    if (!updateAction.successResults) continue;
    const entityType = getEntityType(updateAction.metadata);
    const result = await transaction_sqlite_result(adapter, entityType, updateAction.successResults, true);
    const metadata = updateAction.metadata;

    const events: RxDBEntityLocalUpdatedEventData[] = result.map(entity => {
      const change = updateAction.changes.get(entity.id);
      return {
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'UPDATE',
        id: entity.id,
        patch: change?.patch ?? { ...entity },
        inversePatch: change?.inversePatch ?? {},
        recordAt: entity.updatedAt || entity.createdAt || new Date()
      };
    });
    adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
  }
}

/**
 * 构建插入 RxDBChange 记录的 SQL
 *
 * FR-006: sync-pull 带进来的 patch 是明文，写入 rxdb_change 之前必须封装加密
 * 后才能落盘，避免在历史表中泄露明文。
 */
async function buildLocalChangesSql(
  adapter: RxDBAdapterSqliteBase,
  localChanges: Omit<RxDBChange, 'id'>[]
): Promise<string> {
  const rxDBChangeMetadata = getEntityMetadata(RxDBChange);
  const tableName = get_table_name_by_metadata(rxDBChangeMetadata);
  const columns = [
    'type',
    'namespace',
    'entity',
    'branchId',
    'transactionId',
    'entityId',
    'remoteId',
    'inversePatch',
    'patch'
  ]
    .map(quote_sql_identifier)
    .join(', ');
  const { keyring } = adapter.encryptionContext;

  const values: string[] = [];
  for (const change of localChanges) {
    let patchPayload = change.patch as Record<string, unknown> | null | undefined;
    let inversePayload = change.inversePatch as Record<string, unknown> | null | undefined;
    if (keyring) {
      const meta = adapter.rxdb.schemaManager.getEntityMetadata(change.entity, change.namespace);
      if (meta?.encryptedPropertyMap?.size) {
        const primaryKey = change.entityId;
        if (patchPayload != null) {
          patchPayload = await envelopePlaintextPatches({
            entity: meta,
            primaryKeyString: primaryKey,
            patch: patchPayload,
            keyring
          });
        }
        if (inversePayload != null) {
          inversePayload = await envelopePlaintextPatches({
            entity: meta,
            primaryKeyString: primaryKey,
            patch: inversePayload,
            keyring
          });
        }
      }
    }

    const type = get_sql_value(change.type);
    const namespace = get_sql_value(change.namespace);
    const entity = get_sql_value(change.entity);
    const branchId = get_sql_value(change.branchId);
    const transactionId = get_sql_value(change.transactionId ?? null);
    const entityId = get_sql_value(change.entityId);
    const remoteId = get_sql_value(change.remoteId ?? null);
    const inversePatch = inversePayload != null ? get_sql_value(JSON.stringify(inversePayload)) : 'NULL';
    const patch = patchPayload != null ? get_sql_value(JSON.stringify(patchPayload)) : 'NULL';
    values.push(
      `(${type},${namespace},${entity},${branchId},${transactionId},${entityId},${remoteId},${inversePatch},${patch})`
    );
  }

  return `INSERT INTO ${quote_sql_identifier(tableName)} (${columns}) VALUES ${values.join(',\n')};`;
}
