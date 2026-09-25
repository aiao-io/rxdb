import {
  ACTIVE_BRANCH_KEY,
  EntityLocalUpdatedEvent,
  EntityMetadata,
  EntityType,
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
import { readCurrentBranchId } from './read_current_branch_id.js';
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
 * 生成「把变更日志触发器重挂到指定分支」的 SQL 语句
 *
 * 只重建触发器，**不动 `rxdb_branch` 表**。
 *
 * @param adapter - RxDB PGlite 适配器实例
 * @param branchId - 触发器要写入的目标分支 ID
 * @returns SQL 语句字符串，用 ---STATEMENT_SEPARATOR--- 分隔；无可挂载实体时为空串
 *
 * @remarks
 * 与 {@link generateSwitchBranchSql} 分开导出，是因为「重挂触发器」和「切换激活分支」
 * 的调用方并不总是同一批。测试清库（`cleanup_db`）在 TRUNCATE 并重新写入
 * `main(activated=TRUE)` 之后只需要前者：此时那条 UPDATE 在取值上已是空操作，
 * 却仍会触发行级 NOTIFY，异步派发成一条 `inversePatch:{}` 的裸 RxDBBranch UPDATE 事件，
 * 污染下一个用例的事件监听窗口。
 */
export const generateBranchTriggerSql = (adapter: RxDBAdapterPGlite, branchId: string): string =>
  generateBranchTriggerSqlFor(adapter, branchId, adapter.rxdb.config.entities);

/**
 * 同 {@link generateBranchTriggerSql}，但只重挂**指定的**那几个实体
 *
 * @param adapter - RxDB PGlite 适配器实例
 * @param branchId - 触发器要写入的目标分支 ID
 * @param EntityTypes - 要重挂的实体；只有 `log !== false` 的会产出语句
 * @returns SQL 语句字符串，用 ---STATEMENT_SEPARATOR--- 分隔；无可挂载实体时为空串
 *
 * @remarks
 * 建表路径（`RxDBAdapterPGlite.createTables`）必须收窄到本次建出来的那几张表，不能图省事
 * 走全量的 {@link generateBranchTriggerSql}：`RxDB.#ensureSystemTables` 那一趟补的是系统表，
 * 此时 `config.entities` 里的接入方实体表可能**还没建**，对它们下发 `CREATE TRIGGER`
 * 当场报 `relation … does not exist`，把整条 `connect()` 堵死。
 */
export const generateBranchTriggerSqlFor = (
  adapter: RxDBAdapterPGlite,
  branchId: string,
  EntityTypes: readonly EntityType[]
): string => {
  const sqlParts: string[] = [];

  // 遍历给定实体，为启用了日志功能的实体重新生成触发器
  EntityTypes.forEach(EntityType => {
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

  return sqlParts.join('\n---STATEMENT_SEPARATOR---\n');
};

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
 *
 * **另一个后端有一份平行实现**（`packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts`）。
 * 两端的**机制已经一致**（都是「先熄灭、后点亮」两条带 `RETURNING` 的 UPDATE，理由见上），
 * 剩下的分歧只在**语句收集协议**：sqlite 侧交出语句数组（要行的调用方逐条执行，不要行的才用
 * `join('')` 的那个变体），pglite 侧交出一整段 `---STATEMENT_SEPARATOR---` 分隔的字符串。
 * 合一的前提是先统一这个协议，而两个适配器互不依赖、公共层该落在哪个包本身未定——
 * 与 `version/switch-result.utils.ts` 的判定是同一件事（那两份文件的 `@fileoverview` 里写了
 * 「抽完只剩壳」的具体理由）。顺延记录见 `requirements/roadmap.md` 的「epic-006 评审顺延的架构项」。
 *
 * 在合一之前，这两条 UPDATE 的**任何**改动都必须两端同改：`activeKey` 的唯一索引是
 * 「至多一条激活分支」的唯一机械保证（口径见 `packages/rxdb/src/system/branch.ts`），
 * 而 `RETURNING` 少一条就意味着那一侧翻转过的行不进事件派发。
 */
export const generateSwitchBranchSql = (adapter: RxDBAdapterPGlite, branchId: string): string => {
  const triggerSql = generateBranchTriggerSql(adapter, branchId);

  // 获取分支表的元数据和表名
  const metadata = getEntityMetadata(RxDBBranch);
  const tableName = getTableNameByMetadata(metadata);

  // 转义分支 ID 中的单引号，防止 SQL 注入
  const escapedBranchId = branchId.replace(/'/g, "''");

  // 生成更新分支状态的 SQL：熄灭旧的 active 行，再点亮目标分支
  // PostgreSQL 使用 TRUE/FALSE 代替 1/0
  //
  // 熄灭与点亮是**两条**语句，不是一条 `SET activated = CASE ... END`。
  // `activeKey` 的唯一索引是逐行立即检查的（`SET CONSTRAINTS ALL DEFERRED` 对普通唯一索引
  // 无效），在同一条语句里把哨兵值从 A 行搬到 B 行，会按行处理顺序瞬时撞上自己。
  // 先熄灭再点亮，哨兵值在任何一个时刻都只被一行持有。
  //
  // `updatedAt` 只在**真正翻转**的行上推进这一既有语义保持不变（两处 inversePatch 依赖它）：
  // 熄灭那条的 WHERE 已经把没翻转的行排除干净，所以无条件推进；点亮那条会扫到
  // 「本来就是当前分支」的行，条件必须留着。
  //
  // 两条都带 RETURNING：少一条，那一侧翻转过的行就不进事件派发。
  const deactivateSql = `
    UPDATE ${tableName}
    SET
      activated = FALSE,
      "activeKey" = NULL,
      "updatedAt" = NOW()
    WHERE activated = TRUE AND id != '${escapedBranchId}'
    RETURNING *`;
  const activateSql = `
    UPDATE ${tableName}
    SET
      activated = TRUE,
      "activeKey" = '${ACTIVE_BRANCH_KEY}',
      "updatedAt" = CASE WHEN activated = FALSE THEN NOW() ELSE "updatedAt" END
    WHERE id = '${escapedBranchId}'
    RETURNING *`;
  const branchUpdateSql = `${deactivateSql}\n---STATEMENT_SEPARATOR---\n${activateSql}`;

  return triggerSql ? `${triggerSql}\n---STATEMENT_SEPARATOR---\n${branchUpdateSql}` : branchUpdateSql;
};

/**
 * 切换到指定分支
 *
 * @param adapter - PGlite 适配器实例
 * @param options - 分支切换选项；省略 `branchId` 即「留在当前激活分支」，仅套用 actions
 */
export const switch_branch = async (adapter: RxDBAdapterPGlite, options: SwitchBranchOptions) => {
  const { branchId, actions, prepare } = options;

  const switchAction = actions && (await convertSwitchResultToSql(adapter, actions));
  let branchSwitchResult: Results<Record<string, unknown>> | undefined;
  let targetBranchId = branchId;
  // 前置校验被拒是一条日常路径，不是适配器故障；下面的 catch 靠它决定包不包。
  let prepareRejected = false;

  try {
    // switch_branch 自管触发器和变更日志，跳过事务日志以免重复
    branchSwitchResult = await adapter.transaction(async executor => {
      const sink = (executor as PGliteTransactionExecutor).adapter;
      // 省略 branchId = 「作用于当前激活分支」，必须在本事务内解析：在事务外采样再传进来，
      // 采样与提交之间的一次真实切换会让这条调用把 activated 与全部触发器倒回旧分支。
      targetBranchId ??= await readCurrentBranchId(sink);
      // 前置校验排在这里而不是本事务之外：外面那一版留下一个「校验通过到真正切换」的窗口，
      // 窗口里的一次写能让刚判过的「工作树干净」变成假的，而切换照样完成。
      // 抛出即整次回滚——此刻一行都还没动，连触发器都还在。
      await prepare({ executor, targetBranchId }).catch((error: unknown) => {
        prepareRejected = true;
        throw error;
      });
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
      // is_called=true：下一次 nextval() 返回 updateRxDBChangeSequence + 1
      //（契约：值 = 最后已用 id，与 SQLite 端 sqlite_sequence 语义一致）。
      // 用 false 会让 undo 后首个新写入拿到的 id 恰好等于 redo 失效水位，被误判为迟到通知。
      if (actions?.updateRxDBChangeSequence !== undefined) {
        await executor.query('SELECT setval($1::regclass, $2, true)', [
          'rxdb.rxdb_change_id_seq',
          actions.updateRxDBChangeSequence
        ]);
      }

      // 恢复 trigger 和更新分支状态必须与数据变更共用同一事务，失败时整体回滚。
      return executeSwitchStatements(sink, generateSwitchBranchSql(adapter, targetBranchId));
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
    // `prepare` 的拒绝是**调用方的领域错误**（工作树不干净、凭据过期……），调用方按类型接住它。
    // 包进 RxdbAdapterPGliteError 会把类型抹平成「适配器出错」，`instanceof WorkingTreeDirtyError`
    // 这类判断随之全部失效——而这条路径上一行都没动过，本来就不是适配器的故障。
    if (prepareRejected) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    const originalError = cause instanceof Error ? cause : new Error(message, { cause });
    throw new RxdbAdapterPGliteError(
      `switch branch ${targetBranchId ?? '<current>'} failed: ${message}`,
      undefined,
      originalError
    );
  }
};
