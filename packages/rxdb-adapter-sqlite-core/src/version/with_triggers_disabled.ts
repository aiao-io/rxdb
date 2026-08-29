import { getEntityMetadata, RxDBBranch } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata, quote_sql_identifier, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
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
 * @throws {@link RxDBAdapterSqliteError} 读不到任何分支时抛出，让事务回滚
 *
 * @remarks
 * **不能**走 `versionManager.getCurrentBranch()`：
 * C2 下仓库读写经真实适配器会重新入队（并发度 1）。`pullRepository` 在外层
 * `adapter.transaction` 里调 `executor.mergeChanges(..., disableTriggers=true)` 时，
 * 队列槽位仍被外层事务占用；再入队读分支会排在自己身后永久挂起。
 * 这里经当前事务 executor 直发 SQL，与 `RxDBAdapterSqliteBase.#readCurrentBranchId` 同口径。
 */
export async function readCurrentBranchId(tx: SqlExecutor): Promise<string> {
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
