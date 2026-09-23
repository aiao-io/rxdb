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
 * @throws {@link RxDBAdapterSqliteError} 重建阶段读不到当前分支时抛出
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

  const result = await body();

  await tx.execute(generateSwitchBranchSql(adapter, await readCurrentBranchId(tx)));
  return result;
}
