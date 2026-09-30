import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import { readCurrentBranchId as readCurrentBranchIdWith } from './read_current_branch_id.js';
import { generateSwitchBranchSql } from './switch_branch.js';

/**
 * 能直发 SQL 的事务门面。
 *
 * @remarks
 * 只声明 `execute` 而不收整个 `SqliteTransactionExecutor`：这里需要的全部能力就是
 * 「在**当前**事务连接上发一条 SQL」，收窄到这一个方法让测试可以传最小替身。
 */
export type SqlExecutor = {
  execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult>;
};

/**
 * 读当前分支 id（activated 优先，否则 main），供重建触发器使用。
 *
 * @param tx - 当前事务的执行器
 * @returns 当前活跃分支 id
 * @throws {@link RxDBAdapterSqliteError} 元数据缺列或读不到任何分支时抛出，让事务回滚
 *
 * @remarks
 * **不能**走 `versionManager.getCurrentBranch()`：
 * C2 下仓库读写经真实适配器会重新入队（并发度 1）。`pullRepository` 在外层
 * `adapter.transaction` 里调 `executor.mergeChanges(..., disableTriggers=true)` 时，
 * 队列槽位仍被外层事务占用；再入队读分支会排在自己身后永久挂起。
 * 这里经当前事务 executor 直发 SQL。
 *
 * 判定本身在 `read_current_branch_id.ts`，本函数只把 `execute` 的结果形状
 * （包在 `results[0]` 里）摊成那一份要的扁平形状：两份各写一遍的时候，`?? 'id'` 兜底的
 * 那次删除只落在了其中一份上。
 */
export function readCurrentBranchId(tx: SqlExecutor): Promise<string> {
  return readCurrentBranchIdWith(async (sql, params) => {
    const result = await tx.execute(sql, params);
    const first = result.results[0];
    return { columns: first?.columns ?? [], rows: first?.rows ?? [] };
  });
}

/**
 * 在触发器停用的窗口内执行一段写入：删触发器 → 跑 `body` → 重建触发器。
 *
 * @param adapter - SQLite 适配器
 * @param tx - **当前**事务的执行器；三明治的三步必须落在同一事务里
 * @param body - 窗口内要执行的写入，返回值原样透传
 * @returns `body` 的返回值
 * @throws 原样重抛 `body` 的错误——`body` 抛错但触发器重建成功时
 * @throws {@link RxDBAdapterSqliteError} 触发器重建阶段读不到当前分支时抛出（不论 `body` 是否成功，见下）
 * @throws {@link AggregateError} `body` 与触发器重建**都**失败时抛出：`errors` 为
 * `[bodyError, restoreError]`，`cause` 为 `bodyError`
 *
 * @remarks
 * 用于「把远端副本抄进本地表」的路径：拉取回填与 QueryCache 的缓存写入都不是本地变更，
 * 不该进 `rxdb_change`。表上的 `AFTER INSERT/UPDATE/DELETE` 触发器不区分写入来源，
 * 唯一的抑制手段就是在写入期间把它们摘掉。
 *
 * **三步必须与写入同事务**：拆成两次 `runInTransaction` 会在 C2 嵌套事务下自死锁
 * （见 {@link readCurrentBranchId} 的说明），而且中间那个没有触发器的已提交窗口会对并发写敞开 ——
 * 那些写入的历史将永久丢失。
 *
 * 重建复用 {@link generateSwitchBranchSql}（"切到当前分支"），因此它捎带的分支表 UPDATE 是
 * 恒等写：`RxDBBranch` 自身 `log: false`，不会因此产生变更行。
 *
 * **重建触发器是「不论成功失败都必须跑」的收尾，且不用 `try/finally` 实现**：本函数的生产
 * 调用点都在 `this.transaction()` 里，`body` 抛错时整个事务连带回滚，中间那个「触发器已删、
 * 还没重建」的状态从未真正提交过；但本函数经 `src/index.ts` 公开导出，第三方在事务外调用、
 * `body` 抛错时，这个中间态是真实会提交的——库从此永久没有触发器，且没有任何报错提示。
 * 若改用 `try { ... } finally { await restoreTriggers(); }`，`finally` 块里一旦再抛错
 * （重建本身失败），会按 `no-unsafe-finally` 描述的语义吞掉 `try` 块的完成状态，
 * `body` 的原始错误就此彻底消失、无迹可寻。这里改用「先捕获 `body` 的结果，再无条件跑一遍
 * 收尾，最后按两者结果决定抛什么」的写法：与
 * `packages/rxdb-test/src/encrypted/temporary-value.ts` 的 `withTemporaryValue` 同构
 * ——该函数解决的是结构相同的问题（跑主操作 → 无条件跑一个「必须执行」的收尾 →
 * 两个都失败时用 `AggregateError` 保留两边），这里直接沿用同一套形状与措辞风格。
 *
 * @example
 * ```typescript
 * await adapter.runInTransaction(
 *   tx => withTriggersDisabled(adapter, tx, () => writeRemoteRows(tx, rows)),
 *   false
 * );
 * ```
 */
export async function withTriggersDisabled<T>(
  adapter: RxDBAdapterSqliteBase,
  tx: SqlExecutor,
  body: () => Promise<T>
): Promise<T> {
  const removeTriggers = remove_all_triggers_sql(adapter);
  if (removeTriggers) {
    await tx.execute(removeTriggers);
  }

  // 重建这一步无论 body 成功还是失败都要跑——收成局部函数供下面两条路径共用同一份实现，
  // 不各自抄一遍：判定逻辑分成两份时，其中一份漏改的问题在 `readCurrentBranchId` 上出现过
  // 一次（两边的列名解析各自漂移，见该函数 TSDoc），这里不重蹈。
  const restoreTriggers = (): Promise<unknown> =>
    readCurrentBranchId(tx).then(branchId => tx.execute(generateSwitchBranchSql(adapter, branchId)));

  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await body() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  let restoreFailure: { error: unknown } | undefined;
  try {
    await restoreTriggers();
  } catch (error) {
    restoreFailure = { error };
  }

  if (restoreFailure && !outcome.ok) {
    // 两个错误都不能丢：`cause` 指向 body 的业务错误（调用方多半只关心这一个），但重建失败
    // 意味着库此刻真的没有触发器——这个次生故障必须同样可见，否则排查会一直卡在
    // 「这张表的变更为什么没进 rxdb_change」上，看不到触发器早就没了。
    throw new AggregateError(
      [outcome.error, restoreFailure.error],
      'withTriggersDisabled: rebuilding triggers failed after body threw',
      { cause: outcome.error }
    );
  }
  if (restoreFailure) throw restoreFailure.error;
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
