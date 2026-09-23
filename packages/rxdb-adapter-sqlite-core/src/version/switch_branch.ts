import {
  ACTIVE_BRANCH_KEY,
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
import { read_current_branch_id } from './read_current_branch_id.js';
import { convertSwitchResultToSql } from './switch-result.utils.js';

/**
 * 生成切换分支要执行的 SQL 语句序列，按执行顺序返回。
 *
 * @remarks
 * 分成数组而不是拼成一整段，是因为**结果集的收集**按语句边界走：oo1 的 `db.exec()`
 * 对多语句 SQL 只收第一条「有结果列」的语句的行（`evalFirstResult`）。切换分支拆成
 * 「熄灭 + 点亮」两条 `RETURNING` 之后，拼在一起交给一次 `execute()`，点亮那条的行
 * 就再也进不了 {@link transaction_sqlite_result}——目标分支的缓存实体停在 `activated = false`，
 * 而 SQL 本身执行得好好的，没有任何报错。
 *
 * 所以调用方要么逐条 `execute()`（{@link switch_branch}，它要那些行来派发事件），
 * 要么拼起来一次性执行（只关心写入副作用的路径，如 {@link withTriggersDisabled}）。
 */
export const generateSwitchBranchStatements = (adapter: RxDBAdapterSqliteBase, branchId: string): string[] => {
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

  const activeKeySql = get_sql_value(ACTIVE_BRANCH_KEY);

  // 熄灭旧行与点亮新行是**两条**语句，不是一条 `SET activated = CASE ... END`。
  // `activeKey` 的唯一索引是逐行立即检查的（SQLite 没有可延迟的普通唯一索引），
  // 在同一条语句里把哨兵值从 A 行搬到 B 行，会按行处理顺序瞬时撞上自己。
  // 先熄灭再点亮，哨兵值在任何一个时刻都只被一行持有。
  //
  // `updatedAt` 只在**真正翻转**的行上推进这一既有语义保持不变（两处 inversePatch 依赖它）：
  // 熄灭那条的 WHERE 已经把没翻转的行排除干净，所以无条件推进；点亮那条会扫到
  // 「本来就是当前分支」的行，条件必须留着。
  //
  // 两条都带 RETURNING：少一条，那一侧翻转过的行就不进事件派发。
  const deactivateSql = `
    UPDATE ${quote_sql_identifier(tableName)}
    SET
      activated = 0,
      activeKey = NULL,
      updatedAt = CURRENT_TIMESTAMP
    WHERE activated = 1 AND id != ${branchIdSql}
    RETURNING rowid as ${ROWID},*;
    `;
  const activateSql = `
    UPDATE ${quote_sql_identifier(tableName)}
    SET
      activated = 1,
      activeKey = ${activeKeySql},
      updatedAt = CASE WHEN activated = 0 THEN CURRENT_TIMESTAMP ELSE updatedAt END
    WHERE id = ${branchIdSql}
    RETURNING rowid as ${ROWID},*;
    `;

  return sql ? [sql, deactivateSql, activateSql] : [deactivateSql, activateSql];
};

/**
 * 生成切换分支的 SQL 语句（{@link generateSwitchBranchStatements} 拼成的一整段）。
 *
 * @remarks
 * 只适用于**不读结果集**的调用方：拼接会让第二条 `RETURNING` 的行在部分后端上收不回来，
 * 理由见 {@link generateSwitchBranchStatements}。要行就逐条执行。
 */
export const generateSwitchBranchSql = (adapter: RxDBAdapterSqliteBase, branchId: string): string =>
  generateSwitchBranchStatements(adapter, branchId).join('');

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
 * 整个流程在单事务内完成：解析目标分支 → {@link SwitchBranchOptions.prepare} 前置校验 →
 * 移除触发器 → 数据迁移 → 更新 RxDBChange 序列 → 重建触发器 + 更新 activated 标志，
 * 保证原子性；事件在提交成功后派发。
 *
 * @param adapter - SQLite 适配器
 * @param options - 包含可选的目标 branchId（省略即「留在当前激活分支」）与 SwitchVersionActions
 * @throws 任意事务内 SQL 错误（触发回滚）
 */
export const switch_branch = async (adapter: RxDBAdapterSqliteBase, options: SwitchBranchOptions) => {
  const { branchId, actions, prepare } = options;

  const switchAction = actions && (await convertSwitchResultToSql(adapter, actions));
  const branchSwitchResults: SqliteSuccessResult[] = [];
  let targetBranchId = branchId;
  // 前置校验被拒是一条日常路径，不是适配器故障；下面的 catch 靠它决定包不包。
  let prepareRejected = false;
  try {
    // switch_branch 自己管理触发器和变更日志，因此跳过事务日志记录。
    await adapter.transaction(async tx => {
      // 省略 branchId = 「作用于当前激活分支」，必须在本事务内解析：在事务外采样再传进来，
      // 采样与提交之间的一次真实切换会让这条调用把 activated 与全部触发器倒回旧分支。
      targetBranchId ??= await read_current_branch_id(tx);
      // 前置校验排在这里而不是本事务之外：外面那一版留下一个「校验通过到真正切换」的窗口，
      // 窗口里的一次写能让刚判过的「工作树干净」变成假的，而切换照样完成。
      // 抛出即整次回滚——此刻一行都还没动，连触发器都还在。
      await prepare({ executor: tx, targetBranchId }).catch((error: unknown) => {
        prepareRejected = true;
        throw error;
      });
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
      // 避免“数据已提交但触发器缺失 / activated 未更新”的损坏中间态。
      //
      // 逐条执行而不是拼成一段：熄灭与点亮两条 `RETURNING` 拼在一起时，oo1 的 `db.exec()`
      // 只收第一条有结果列的语句的行，点亮那条的行会被静默丢掉（详见
      // {@link generateSwitchBranchStatements}）。这里两侧的行都要用来派发事件。
      for (const statement of generateSwitchBranchStatements(adapter, targetBranchId)) {
        const executed = await tx.execute(statement);
        if (executed) branchSwitchResults.push(executed);
      }
    }, false);

    // 提交成功后派发事件
    const branchRows: InstanceType<typeof RxDBBranch>[] = [];
    for (const executed of branchSwitchResults) {
      branchRows.push(...(await transaction_sqlite_result(adapter, RxDBBranch, executed, true)));
    }
    _dispatch_branch_update_event(adapter, getEntityMetadata(RxDBBranch), branchRows);

    if (switchAction) {
      await dispatch_switch_events(adapter, switchAction);
    }
  } catch (error) {
    // `prepare` 的拒绝是**调用方的领域错误**（工作树不干净、凭据过期……），调用方按类型接住它。
    // 包进 RxDBAdapterSqliteError 会把类型抹平成「适配器出错」，`instanceof WorkingTreeDirtyError`
    // 这类判断随之全部失效——而这条路径上一行都没动过，本来就不是适配器的故障。
    if (prepareRejected) throw error;
    throw new RxDBAdapterSqliteError(`switch branch ${targetBranchId ?? '<current>'} failed`, { cause: error });
  }
};
