import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  getEntityMetadata,
  getEntityType,
  RxDBBranch,
  RxDBChange,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import {
  get_sql_value,
  get_table_name_by_metadata,
  quote_sql_identifier,
  RxDBAdapterSqliteError
} from '../sqlite-core.utils.js';
import { envelopePlaintextPatches } from '../system/encrypt-patch.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import { remove_entity_ids_from_cache, transaction_sqlite_result } from '../transaction_sqlite_result.js';
import { executeSqliteSelectStatements, executeSqliteStatements } from './execute-sql-statements.js';
import type { SwitchVersionSqlResult } from './switch-result.utils.js';
import { generateSwitchBranchSql } from './switch_branch.js';

type SqlExecutor = {
  execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult>;
};

/**
 * 读当前分支 id（activated 优先，否则 main），供 disableTriggers 重建触发器使用。
 *
 * @remarks
 * **不能**走 `versionManager.getCurrentBranch()`：
 * C2 下仓库读写经真实适配器会重新入队（并发度 1）。`pullRepository` 在外层
 * `adapter.transaction` 里调 `executor.mergeChanges(..., disableTriggers=true)` 时，
 * 队列槽位仍被外层事务占用；再入队读分支会排在自己身后永久挂起。
 * 这里经当前事务 executor 直发 SQL，与 `#readCurrentBranchId` 同口径。
 */
async function readCurrentBranchId(tx: SqlExecutor): Promise<string> {
  const metadata = getEntityMetadata(RxDBBranch);
  const table = quote_sql_identifier(get_table_name_by_metadata(metadata));
  const idColumnName = metadata.propertyMap?.get('id')?.columnName ?? 'id';
  const activatedColumnName = metadata.propertyMap?.get('activated')?.columnName ?? 'activated';
  const idColumn = quote_sql_identifier(idColumnName);
  const activatedColumn = quote_sql_identifier(activatedColumnName);

  const readId = async (whereSql: string, params: SQLiteCompatibleType[]): Promise<string | undefined> => {
    const result = await tx.execute(`SELECT ${idColumn} FROM ${table} WHERE ${whereSql} LIMIT 1;`, params);
    const columns = result.results[0]?.columns ?? [];
    const rows = result.results[0]?.rows ?? [];
    const columnIndex = Math.max(0, columns.indexOf(idColumnName));
    const value = rows[0]?.[columnIndex];
    return typeof value === 'string' ? value : undefined;
  };

  const branchId = (await readId(`${activatedColumn} = ?`, [1])) ?? (await readId(`${idColumn} = ?`, ['main']));
  // 读不到分支就无法重建触发器；此时必须让事务回滚，否则会提交一个永久没有触发器的库。
  if (branchId === undefined) {
    throw new RxDBAdapterSqliteError('currentBranch is undefined! Cannot rebuild triggers after disableTriggers.');
  }
  return branchId;
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
    // 如果需要禁用触发器（例如 pull），先删除所有触发器
    if (disableTriggers) {
      const remove_triggers = remove_all_triggers_sql(adapter);
      if (remove_triggers) {
        await tx.execute(remove_triggers);
      }
    }

    // 删除
    for (const deleteAction of switchAction.deletes) {
      await executeSqliteStatements(tx, deleteAction.statements);
    }

    // 插入
    for (const insertAction of switchAction.inserts) {
      await executeSqliteStatements(tx, insertAction.statements);
      insertAction.successResults = await executeSqliteSelectStatements(tx, insertAction.selectStatements);
    }

    // 更新
    for (const updateAction of switchAction.updates) {
      await executeSqliteStatements(tx, updateAction.statements);
      updateAction.successResults = await executeSqliteSelectStatements(tx, updateAction.selectStatements);
    }

    // 当触发器被禁用且有 localChanges 时，手动插入 RxDBChange 记录
    if (disableTriggers && localChanges?.length) {
      await tx.execute(await buildLocalChangesSql(adapter, localChanges));
    }

    if (disableTriggers) {
      await tx.execute(generateSwitchBranchSql(adapter, await readCurrentBranchId(tx)));
    }
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
