import {
  EntityLocalUpdatedEvent,
  EntityMetadata,
  getEntityMetadata,
  RxDBBranch,
  RxDBChange,
  RxDBEntityLocalUpdatedEventData,
  SwitchBranchOptions
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from '../sqlite-core.interface.js';
import {
  build_set_sequence_statements,
  get_sql_value,
  get_table_name_by_entity_type,
  get_table_name_by_metadata,
  quote_sql_identifier,
  ROWID,
  RxDBAdapterSqliteError
} from '../sqlite-core.utils.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import { generate_table_trigger_sql } from '../table/trigger_sql.js';
import { transaction_sqlite_result } from '../transaction_sqlite_result.js';
import { executeSqliteSelectStatements, executeSqliteStatements } from './execute-sql-statements.js';
import { dispatch_switch_events } from './execute_switch_actions.js';
import { convertSwitchResultToSql } from './switch-result.utils.js';

/**
 * 生成切换分支的 SQL 语句
 */
export const generateSwitchBranchSql = (adapter: RxDBAdapterSqliteBase, branchId: string): string => {
  let sql: string = '';

  adapter.rxdb.config.entities.forEach(EntityType => {
    const metadata = getEntityMetadata(EntityType);

    if (metadata.log !== false) {
      // 不吞异常：任一实体的触发器生成失败都必须让整个切换回滚。
      // 否则该表会在无触发器的状态下继续接受 CRUD，静默丢掉历史、undo/redo 与同步。
      const triggerSql = generate_table_trigger_sql(metadata, {
        branchId,
        resolveEntityMetadata: adapter.encryptionContext.resolveEntityMetadata
      });
      if (triggerSql.trim()) {
        sql += triggerSql;
      }
    }
  });

  const metadata = getEntityMetadata(RxDBBranch);
  const tableName = get_table_name_by_metadata(metadata);

  const branchIdSql = get_sql_value(branchId);

  sql += `
    UPDATE ${quote_sql_identifier(tableName)}
    SET
      activated = CASE
        WHEN id = ${branchIdSql} THEN 1
        ELSE 0
      END,
      updatedAt = CASE
        WHEN (id = ${branchIdSql} AND activated = 0) OR (id != ${branchIdSql} AND activated = 1) THEN CURRENT_TIMESTAMP
        ELSE updatedAt
      END
    WHERE id = ${branchIdSql} OR activated = 1
    RETURNING rowid as ${ROWID},*;
    `;

  return sql;
};

/**
 * 派发 RxDBBranch 表的 UPDATE 事件。
 * inversePatch 记录 activated 字段的逆向值（分支切换仅改变 activated），
 * 供撤销/回滚消费者还原前一状态。
 */
const _dispatch_branch_update_event = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  result: InstanceType<typeof RxDBBranch>[]
): void => {
  if (result.length === 0) return;
  const events: RxDBEntityLocalUpdatedEventData[] = result.map(entity => ({
    namespace: metadata.namespace,
    entity: metadata.name,
    type: 'UPDATE',
    id: entity.id,
    patch: { ...entity },
    // inversePatch 反映切换前的 activated 状态（0↔1 互换），使 undo/redo 消费者可正确还原
    inversePatch: { ...entity, activated: entity.activated ? 0 : 1 },
    recordAt: entity.updatedAt || entity.createdAt || new Date()
  }));
  adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
};

/**
 * 切换当前活跃分支并应用所需的数据迁移。
 *
 * 整个流程在单事务内完成：移除触发器 → 数据迁移 → 更新 RxDBChange 序列 →
 * 重建触发器 + 更新 activated 标志，保证原子性；事件在提交成功后派发。
 *
 * @param adapter - SQLite 适配器
 * @param options - 包含目标 branchId 与可选的 SwitchVersionActions
 * @throws 任意事务内 SQL 错误（触发回滚）
 */
export const switch_branch = async (adapter: RxDBAdapterSqliteBase, options: SwitchBranchOptions) => {
  const { branchId, actions } = options;

  const switchAction = actions && (await convertSwitchResultToSql(adapter, actions));
  let branchSwitchResult: SqliteSuccessResult | undefined;
  try {
    // switch_branch 自己管理触发器和变更日志，因此跳过事务日志记录。
    await adapter.transaction(async tx => {
      // 移除所有表触发器，避免触发器在批量操作时干扰数据
      const remove_all_triggers = remove_all_triggers_sql(adapter);
      if (remove_all_triggers) {
        await tx.execute(remove_all_triggers);
      }
      // 执行切换分支的操作
      if (switchAction) {
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

      // 更新 RxDBChange 序列号（如果提供）——走 tx 保持原子，不旁路 #internal_exec
      if (actions?.updateRxDBChangeSequence !== undefined) {
        const seqTable = get_table_name_by_entity_type(RxDBChange);
        for (const stmt of build_set_sequence_statements(seqTable, actions.updateRxDBChangeSequence)) {
          await tx.execute(stmt.sql, stmt.params);
        }
      }

      // 触发器重建 + activated 更新纳入同一事务（SQLite 支持事务内 drop+create 触发器），
      // 避免“数据已提交但触发器缺失 / activated 未更新”的损坏中间态
      branchSwitchResult = await tx.execute(generateSwitchBranchSql(adapter, branchId));
    }, false);

    // 提交成功后派发事件
    if (branchSwitchResult) {
      const result = await transaction_sqlite_result(adapter, RxDBBranch, branchSwitchResult, true);
      _dispatch_branch_update_event(adapter, getEntityMetadata(RxDBBranch), result);
    }

    if (switchAction) {
      await dispatch_switch_events(adapter, switchAction);
    }
  } catch (error) {
    throw new RxDBAdapterSqliteError(`switch branch ${branchId} failed`, { cause: error });
  }
};
