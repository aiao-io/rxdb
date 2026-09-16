import { getEntityMetadata, RxDBBranch } from '@aiao/rxdb';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata, quote_sql_identifier, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import type { SqliteTransactionExecutor } from '../transaction/SqliteTransactionExecutor.js';

/**
 * 在给定事务内读出当前激活的分支 id。
 *
 * @remarks
 * 语义对齐 `VersionManager.getCurrentBranch()`：先取 `activated` 的分支，没有则回退 `main`。
 *
 * 必须经 `executor` 读，且读点必须落在使用它的那个事务内部——分支 id 一旦在事务外采样，
 * 采样与使用之间的任何一次真实分支切换都会让调用方拿着过期 id 重建触发器 / 改写 `activated`。
 *
 * 直发 SQL 而不经仓库：仓库的 `addQueryCache` 要做实体水合（需要 entityManager），
 * 而这里只要一个 id。少一层依赖，也让适配器单测不必搭出完整的 RxDB。
 *
 * @param executor - 当前事务的执行器
 * @returns 当前分支 id
 * @throws {RxDBAdapterSqliteError} 既没有激活分支也没有 `main` 时
 */
export const read_current_branch_id = async (executor: SqliteTransactionExecutor): Promise<string> => {
  const metadata = getEntityMetadata(RxDBBranch);
  const table = quote_sql_identifier(get_table_name_by_metadata(metadata));
  const idColumn = quote_sql_identifier(metadata.propertyMap?.get('id')?.columnName ?? 'id');
  const activatedColumn = quote_sql_identifier(metadata.propertyMap?.get('activated')?.columnName ?? 'activated');

  const readId = async (whereSql: string, params: SQLiteCompatibleType[]): Promise<string | undefined> => {
    const result = await executor.query(`SELECT ${idColumn} FROM ${table} WHERE ${whereSql} LIMIT 1;`, params);
    const columnIndex = Math.max(0, result.columns.indexOf(idColumn.replaceAll('"', '')));
    const value = result.rows[0]?.[columnIndex];
    return typeof value === 'string' ? value : undefined;
  };

  const activated = await readId(`${activatedColumn} = ?`, [1]);
  if (activated !== undefined) return activated;

  const main = await readId(`${idColumn} = ?`, ['main']);
  if (main !== undefined) return main;

  throw new RxDBAdapterSqliteError('currentBranch is undefined! Cannot start transaction with logging.');
};
