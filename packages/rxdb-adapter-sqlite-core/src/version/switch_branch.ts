import {
  ACTIVE_BRANCH_KEY,
  EntityLocalUpdatedEvent,
  EntityMetadata,
  getEntityMetadata,
  RxDBBranch,
  RxDBChange,
  RxDBEntityLocalUpdatedEventData,
  SwitchBranchOptions,
  WorktreeBranchHeldError,
  WorktreeTableSet
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from '../sqlite-core.interface.js';
import {
  build_set_sequence_statements,
  get_sql_value,
  quote_sql_identifier,
  ROWID,
  RxDBAdapterSqliteError,
  SQLITE_NOW_ISO_SQL
} from '../sqlite-core.utils.js';
import { get_table_name_by_entity_type, get_table_name_by_metadata } from '../table-name-resolver.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import { generate_table_set_trigger_sql } from '../table/trigger_sql.js';
import type { SqliteTransactionExecutor } from '../transaction/SqliteTransactionExecutor.js';
import { transaction_sqlite_result } from '../transaction_sqlite_result.js';
import { applySwitchActions, dispatch_switch_events } from './execute_switch_actions.js';
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
  // 不吞异常：任一实体的触发器生成失败都必须让整个切换回滚。
  // 否则该表会在无触发器的状态下继续接受 CRUD，静默丢掉历史、undo/redo 与同步。
  const sql = generate_table_set_trigger_sql(adapter, adapter.tableSet, branchId);

  const metadata = getEntityMetadata(RxDBBranch);
  const tableName = get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN);

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
      updatedAt = ${SQLITE_NOW_ISO_SQL}
    WHERE activated = 1 AND id != ${branchIdSql}
    RETURNING rowid as ${ROWID},*;
    `;
  const activateSql = `
    UPDATE ${quote_sql_identifier(tableName)}
    SET
      activated = 1,
      activeKey = ${activeKeySql},
      updatedAt = CASE WHEN activated = 0 THEN ${SQLITE_NOW_ISO_SQL} ELSE updatedAt END
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
 * 理由见 {@link generateSwitchBranchStatements}。要行就逐条执行。 *
 * **另一个后端有一份平行实现**（`packages/rxdb-adapter-pglite/src/version/switch_branch.ts`）。
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
export const generateSwitchBranchSql = (adapter: RxDBAdapterSqliteBase, branchId: string): string =>
  generateSwitchBranchStatements(adapter, branchId).join('');

/**
 * 切到 `branchId` 之前的检查：它在别人手里就抛（主检出位 US-314 B1.2，可写检出位 B2.2）。
 *
 * @param executor - 切换事务的执行器
 * @param branchId - 目标分支
 * @param tableSet - 本实例挂的那套表：主检出位的哨兵对可写检出位来说也是「别人」
 * @throws {@link WorktreeBranchHeldError} 目标分支被别的检出位持有时（主检出位切过去时是可写检出位的持有键，
 *   可写检出位切过去时还包括主检出位的哨兵）
 *
 * @remarks
 * 唯一索引兜不住这一条：点亮那条 UPDATE 写的是哨兵，正好把持有键覆盖掉，索引里始终只有一个哨兵。
 * 只能在点亮之前读一次，而且必须在切换事务里读——在事务外读，读与点亮之间写下的持有键照样会被覆盖。
 * 列名与下面熄灭、点亮两条语句同写字面量：三处指的必须是同一列。走 `execute` 而不是 `query`，
 * 与本函数所在事务里的其它语句同一个入口。
 *
 * **另一个后端有一份同样的检查**（`packages/rxdb-adapter-pglite/src/version/switch_branch.ts`），
 * 判定本身在核心（`WorktreeBranchHeldError.throwIfHeld`），两端各自只剩读那一格的 SQL。
 */
const assertBranchNotHeld = async (
  executor: SqliteTransactionExecutor,
  branchId: string,
  tableSet: WorktreeTableSet
): Promise<void> => {
  const tableName = get_table_name_by_metadata(getEntityMetadata(RxDBBranch), WorktreeTableSet.MAIN);
  const result = await executor.execute(`SELECT activeKey FROM ${quote_sql_identifier(tableName)} WHERE id = ?`, [
    branchId
  ]);
  const activeKey = result.results.flatMap(item => item.rows)[0]?.[0];
  WorktreeBranchHeldError.throwIfHeld(branchId, typeof activeKey === 'string' ? activeKey : null, tableSet.holderKey);
};

/**
 * 可写检出位里切分支的三段 SQL（US-314 B2.2）：按目标分支重挂这套表的触发器、放开原来持有的分支、持有目标分支。
 *
 * @param adapter - SQLite 适配器
 * @param tableSet - 本实例挂的那套影子表
 * @param branchId - 目标分支
 * @returns 三段语句；这套表没有成员时没有触发器那一段
 *
 * @remarks
 * 主检出位那一行（`activated` 与哨兵）一格不动：可写检出位持有分支只写 `activeKey`，`activated` 恒为假。
 * 先放后拿：`activeKey` 的唯一索引逐行立即检查，同一个持有键在两行上同时出现一瞬就撞。
 * 拿的那条只认 `activated = 0` 且没人持有（或已是自己）的行：切换事务前面已经按持有键拒过被占的分支，
 * 这里再钉一次，索引之外多一道「不覆盖别人的键」。`updatedAt` 只在真正翻转的行上推进，与主检出位那两条同口径。
 * 两条都带 `RETURNING`，行要用来刷缓存、派事件；分开执行的理由见 {@link generateSwitchBranchStatements}。
 */
const generateCheckoutSwitchStatements = (
  adapter: RxDBAdapterSqliteBase,
  tableSet: WorktreeTableSet,
  branchId: string
): { triggers: string; release: string; hold: string } => {
  const tableName = quote_sql_identifier(
    get_table_name_by_metadata(getEntityMetadata(RxDBBranch), WorktreeTableSet.MAIN)
  );
  const branchIdSql = get_sql_value(branchId);
  const holderSql = get_sql_value(tableSet.holderKey);
  return {
    triggers: generate_table_set_trigger_sql(adapter, tableSet, branchId),
    release: `
    UPDATE ${tableName}
    SET activeKey = NULL, updatedAt = ${SQLITE_NOW_ISO_SQL}
    WHERE activeKey = ${holderSql} AND id != ${branchIdSql}
    RETURNING rowid as ${ROWID},*;
    `,
    hold: `
    UPDATE ${tableName}
    SET
      activeKey = ${holderSql},
      updatedAt = CASE WHEN activeKey IS NULL THEN ${SQLITE_NOW_ISO_SQL} ELSE updatedAt END
    WHERE id = ${branchIdSql} AND activated = 0 AND (activeKey IS NULL OR activeKey = ${holderSql})
    RETURNING rowid as ${ROWID},*;
    `
  };
};

/**
 * 在切换事务里让可写检出位持有目标分支（US-314 B2.2），见 {@link generateCheckoutSwitchStatements}。
 *
 * @param tx - 切换事务的执行器
 * @param adapter - SQLite 适配器
 * @param tableSet - 本实例挂的那套影子表
 * @param branchId - 目标分支
 * @returns 放开与持有两条语句交回的结果，用来刷缓存、派事件
 * @throws {@link RxDBAdapterSqliteError} 目标分支没持有到（分支不在）时，整笔回滚
 */
const switchCheckoutBranch = async (
  tx: SqliteTransactionExecutor,
  adapter: RxDBAdapterSqliteBase,
  tableSet: WorktreeTableSet,
  branchId: string
): Promise<SqliteSuccessResult[]> => {
  const { triggers, release, hold } = generateCheckoutSwitchStatements(adapter, tableSet, branchId);
  if (triggers) await tx.execute(triggers);
  const released = await tx.execute(release);
  const held = await tx.execute(hold);
  if (held.results.flatMap(result => result.rows).length !== 1) {
    throw new RxDBAdapterSqliteError(`表集 ${tableSet.suffix} 持有不了分支 ${branchId}：分支不在`);
  }
  return [released, held];
};

/**
 * 派发 RxDBBranch 表的 UPDATE 事件。
 * inversePatch 记录切换翻转的那一格的逆向值，供撤销/回滚消费者还原前一状态：
 * 主检出位翻的是 `activated`，可写检出位翻的是自己的持有键（US-314 B2.2）。
 */
const _dispatch_branch_update_event = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  result: InstanceType<typeof RxDBBranch>[],
  tableSet: WorktreeTableSet
): void => {
  if (result.length === 0) return;
  const events: RxDBEntityLocalUpdatedEventData[] = result.map(entity => ({
    namespace: metadata.namespace,
    entity: metadata.name,
    type: 'UPDATE',
    id: entity.id,
    patch: { ...entity },
    // inversePatch 反映切换前那一格（activated 0↔1，或持有键 ↔ NULL），使 undo/redo 消费者可正确还原
    inversePatch:
      tableSet.isMain ?
        { ...entity, activated: entity.activated ? 0 : 1 }
      : { ...entity, activeKey: entity.activeKey ? null : tableSet.holderKey },
    recordAt: entity.updatedAt || entity.createdAt || new Date()
  }));
  adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
};

/**
 * 切换当前活跃分支并应用所需的数据迁移。
 *
 * 整个流程在单事务内完成：解析目标分支 → 目标分支没被可写检出位持有 →
 * {@link SwitchBranchOptions.prepare} 前置校验 → 移除触发器 → 数据迁移 → 更新 RxDBChange 序列 →
 * 重建触发器 + 更新 activated 标志，保证原子性；事件在提交成功后派发。
 *
 * 省略 `branchId`（留在当前分支，只套用 actions）时不查持有、不写分支表，只按当前分支重挂触发器。
 *
 * @param adapter - SQLite 适配器
 * @param options - 包含可选的目标 branchId（省略即「留在当前激活分支」）与 SwitchVersionActions
 * @throws {@link WorktreeBranchHeldError} 目标分支在可写检出位手里时；原样抛出，一行都没动
 * @throws 任意事务内 SQL 错误（触发回滚）
 */
export const switch_branch = async (adapter: RxDBAdapterSqliteBase, options: SwitchBranchOptions) => {
  const { branchId, actions, prepare } = options;
  // 本实例挂的那套表：增量落在它里面，切分支时主检出位熄灭、点亮那一行，可写检出位放开、持有自己的键（US-314 B2.2）
  const tableSet = adapter.tableSet;

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
      targetBranchId ??= await read_current_branch_id(tx, tableSet);
      // 目标分支在可写检出位手里就拒。排在前置校验之前，与 git 同序：先答「这条分支能不能检出」，
      // 再问「工作树干不干净」；也排在动第一行之前，被拒时连触发器都还在。留在当前分支时没有要拿下的分支，不查。
      if (branchId !== undefined) await assertBranchNotHeld(tx, targetBranchId, tableSet);
      // 前置校验排在这里而不是本事务之外：外面那一版留下一个「校验通过到真正切换」的窗口，
      // 窗口里的一次写能让刚判过的「工作树干净」变成假的，而切换照样完成。
      // 抛出即整次回滚——此刻一行都还没动，连触发器都还在。
      await prepare({ executor: tx, targetBranchId }).catch((error: unknown) => {
        prepareRejected = true;
        throw error;
      });
      // 移除所有表触发器，避免触发器在批量操作时干扰数据
      const remove_all_triggers = remove_all_triggers_sql(adapter, tableSet);
      if (remove_all_triggers) {
        await tx.execute(remove_all_triggers);
      }
      // 执行切换分支的操作（与 undo / redo 同一份执行顺序，见 applySwitchActions）
      if (switchAction) {
        await applySwitchActions(tx, switchAction);
      }

      // 更新 RxDBChange 序列号（如果提供）——走 tx 保持原子，不旁路 #internal_exec
      if (actions?.updateRxDBChangeSequence !== undefined) {
        const seqTable = get_table_name_by_entity_type(RxDBChange, WorktreeTableSet.MAIN);
        for (const stmt of build_set_sequence_statements(seqTable, actions.updateRxDBChangeSequence)) {
          await tx.execute(stmt.sql, stmt.params);
        }
      }

      // 留在当前分支（撤销 / 重做、重做栈失效）只重挂本实例这套表的触发器，不写分支表：从前也照跑熄灭 + 点亮，
      // 点亮那条的 RETURNING 行还派出一条「activated 翻转了」的假事件（US-314 B1.3）。
      if (branchId === undefined) {
        const rebuildTriggers = generate_table_set_trigger_sql(adapter, tableSet, targetBranchId);
        if (rebuildTriggers) await tx.execute(rebuildTriggers);
        return;
      }

      // 触发器重建 + activated 更新纳入同一事务（SQLite 支持事务内 drop+create 触发器），
      // 避免“数据已提交但触发器缺失 / activated 未更新”的损坏中间态。
      //
      // 逐条执行而不是拼成一段：熄灭与点亮两条 `RETURNING` 拼在一起时，oo1 的 `db.exec()`
      // 只收第一条有结果列的语句的行，点亮那条的行会被静默丢掉（详见
      // {@link generateSwitchBranchStatements}）。这里两侧的行都要用来派发事件。
      // 可写检出位那一支只动自己的持有键（US-314 B2.2）。
      if (!tableSet.isMain) {
        branchSwitchResults.push(...(await switchCheckoutBranch(tx, adapter, tableSet, targetBranchId)));
        return;
      }
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
    _dispatch_branch_update_event(adapter, getEntityMetadata(RxDBBranch), branchRows, tableSet);

    if (switchAction) {
      await dispatch_switch_events(adapter, switchAction);
    }
  } catch (error) {
    // `prepare` 的拒绝是**调用方的领域错误**（工作树不干净、凭据过期……），调用方按类型接住它。
    // 包进 RxDBAdapterSqliteError 会把类型抹平成「适配器出错」，`instanceof WorkingTreeDirtyError`
    // 这类判断随之全部失效——而这条路径上一行都没动过，本来就不是适配器的故障。
    // 目标分支被可写检出位持有同理。
    if (prepareRejected || error instanceof WorktreeBranchHeldError) throw error;
    throw new RxDBAdapterSqliteError(`switch branch ${targetBranchId ?? '<current>'} failed`, { cause: error });
  }
};
