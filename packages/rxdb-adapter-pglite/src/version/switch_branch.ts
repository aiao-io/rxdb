import {
  EntityLocalUpdatedEvent,
  EntityMetadata,
  getEntityMetadata,
  RxDBBranch,
  RxDBEntityLocalUpdatedEventData,
  SwitchBranchOptions
} from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';

import { getTableNameByMetadata, RxdbAdapterPGliteError } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import remove_all_triggers_sql from '../table/remove_trigger_sql.js';
import generate_trigger_sql from '../table/trigger_sql.js';
import type { PGliteTransactionExecutor } from '../transaction/PGliteTransactionExecutor.js';
import { PGliteExecuteResult, transaction_pglite_result } from '../transaction_pglite_result.js';
import { dispatch_switch_events } from './execute_switch_actions.js';
import { executeSwitchStatements } from './execute_switch_statements.js';
import { convertSwitchResultToSql } from './switch-result.utils.js';

/**
 * 将 PGlite Results 转换为 PGliteExecuteResult 格式
 */
function convertResultsToPGliteExecuteResult<T>(results: Results<T>): PGliteExecuteResult<T> {
  return {
    rows: results.rows,
    rowsAffected: results.affectedRows ?? results.rows.length,
    elapsed: 0
  };
}

/**
 * 生成切换分支的 SQL 语句数组
 *
 * 此函数负责生成切换数据库分支时所需的所有 SQL 语句，包括：
 * 1. 为所有启用了日志功能的实体重新生成触发器（使用新的分支 ID）
 * 2. 更新分支表，激活目标分支并停用其他所有分支
 *
 * @param adapter - RxDB PGlite 适配器实例
 * @param branchId - 要切换到的目标分支 ID
 * @returns SQL 语句字符串，用 ---STATEMENT_SEPARATOR--- 分隔
 */
export const generateSwitchBranchSql = (adapter: RxDBAdapterPGlite, branchId: string): string => {
  const sqlParts: string[] = [];

  // 遍历所有实体，为启用了日志功能的实体重新生成触发器
  adapter.rxdb.config.entities.forEach(EntityType => {
    const metadata = getEntityMetadata(EntityType);

    // 只为启用了日志功能的实体生成触发器
    if (metadata.log !== false) {
      const triggerSql = generate_trigger_sql(metadata, {
        branchId,
        resolveEntityMetadata: adapter.encryptionContext.resolveEntityMetadata
      });
      if (triggerSql.trim()) {
        sqlParts.push(triggerSql);
      }
    }
  });

  // 获取分支表的元数据和表名
  const metadata = getEntityMetadata(RxDBBranch);
  const tableName = getTableNameByMetadata(metadata);

  // 转义分支 ID 中的单引号，防止 SQL 注入
  const escapedBranchId = branchId.replace(/'/g, "''");

  // 生成更新分支状态的 SQL：激活目标分支并停用其他所有分支
  // PostgreSQL 使用 TRUE/FALSE 代替 1/0
  const branchUpdateSql = `
    UPDATE ${tableName}
    SET
      activated = CASE
        WHEN id = '${escapedBranchId}' THEN TRUE
        ELSE FALSE
      END,
      "updatedAt" = CASE
        WHEN (id = '${escapedBranchId}' AND activated = FALSE) OR (id != '${escapedBranchId}' AND activated = TRUE) THEN NOW()
        ELSE "updatedAt"
      END
    WHERE id = '${escapedBranchId}' OR activated = TRUE
    RETURNING *`;

  sqlParts.push(branchUpdateSql);

  return sqlParts.join('\n---STATEMENT_SEPARATOR---\n');
};

/**
 * 切换到指定分支
 *
 * @param adapter - PGlite 适配器实例
 * @param options - 分支切换选项
 */
export const switch_branch = async (adapter: RxDBAdapterPGlite, options: SwitchBranchOptions) => {
  const { branchId, actions } = options;

  const switchAction = actions && (await convertSwitchResultToSql(adapter, actions));
  let branchSwitchResult: Results<Record<string, unknown>> | undefined;

  try {
    // switch_branch 自管触发器和变更日志，跳过事务日志以免重复
    branchSwitchResult = await adapter.transaction(async executor => {
      const sink = (executor as PGliteTransactionExecutor).adapter;
      // 移除所有表触发器，避免触发器在批量操作时干扰数据
      const removeAllTriggers = remove_all_triggers_sql(sink);
      if (removeAllTriggers) await executeSwitchStatements(sink, removeAllTriggers);

      // 执行切换分支的操作
      if (switchAction) {
        if (switchAction.deletes.length) {
          for (const deleteAction of switchAction.deletes) {
            deleteAction.successResults = await executeSwitchStatements(sink, deleteAction.sql, deleteAction.params);
          }
        }
        if (switchAction.inserts.length) {
          for (const insertAction of switchAction.inserts) {
            insertAction.successResults = await executeSwitchStatements(sink, insertAction.sql);
          }
        }
        if (switchAction.updates.length) {
          for (const updateAction of switchAction.updates) {
            updateAction.successResults = await executeSwitchStatements(sink, updateAction.sql);
          }
        }
      }

      // 更新 RxDBChange 序列号（如果提供）
      if (actions?.updateRxDBChangeSequence !== undefined) {
        await executor.query('SELECT setval($1::regclass, $2, false)', [
          'rxdb.rxdb_change_id_seq',
          actions.updateRxDBChangeSequence
        ]);
      }

      // 恢复 trigger 和更新分支状态必须与数据变更共用同一事务，失败时整体回滚。
      return executeSwitchStatements(sink, generateSwitchBranchSql(adapter, branchId));
    }, false);

    const _dispatch_update_event = (metadata: EntityMetadata, result: RxDBBranch[]) => {
      if (result.length === 0) return;
      const switchBranchEvent: RxDBEntityLocalUpdatedEventData<typeof RxDBBranch>[] = result.map(entity => ({
        namespace: metadata.namespace,
        entity: metadata.name,
        type: 'UPDATE',
        id: entity.id,
        patch: { ...entity },
        // inversePatch 反映切换前的 activated 状态（PostgreSQL 为布尔，true↔false 互换），
        // 使 undo/redo 消费者可正确还原前一状态
        inversePatch: { ...entity, activated: !entity.activated },
        recordAt: entity.updatedAt || entity.createdAt || new Date()
      }));
      adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(switchBranchEvent));
    };

    if (branchSwitchResult) {
      const pgliteResult = convertResultsToPGliteExecuteResult(branchSwitchResult);
      const result = await transaction_pglite_result(adapter, RxDBBranch, pgliteResult, true);
      const metadata = getEntityMetadata(RxDBBranch);
      _dispatch_update_event(metadata, result);
    }

    // 发送实体变更事件（复用公共逻辑）
    if (switchAction) {
      await dispatch_switch_events(adapter, switchAction);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const originalError = cause instanceof Error ? cause : new Error(message, { cause });
    throw new RxdbAdapterPGliteError(`switch branch ${branchId} failed: ${message}`, undefined, originalError);
  }
};
