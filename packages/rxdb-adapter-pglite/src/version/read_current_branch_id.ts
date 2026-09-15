import { getEntityMetadata, RxDBBranch } from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';

import { getTableNameByMetadata, quoteIdentifier, RxdbAdapterPGliteError } from '../pglite.utils.js';

/**
 * 能在**当前**事务连接上直发 SQL 的最小门面。
 *
 * @remarks
 * 只声明 `query` 而不收整个 `PGliteTransactionExecutor`：这里需要的全部能力就是「在当前事务上
 * 发一条 SELECT」，收窄到这一个方法让测试可以传最小替身。事务内的适配器门面
 * （`PGliteTransactionExecutor.adapter`）与 executor 自己都满足它。
 */
export type PGliteRowReader = {
  query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>>;
};

/**
 * 读当前分支 id（`activated` 优先，否则 `main`），供重建触发器使用
 *
 * @param tx - 当前事务的直发门面
 * @returns 当前活跃分支 id
 * @throws {@link RxdbAdapterPGliteError} 读不到任何分支时抛出，让事务回滚
 *
 * @remarks
 * **不能**走 `versionManager.getCurrentBranch()`：那一份的热路径用绑在**真实适配器**上的仓库
 * 去读，而适配器的 `query()` 会重新入队（`#queue` 并发度 1）。`pull-batch` 在外层
 * `adapter.transaction` 里调 `executor.mergeChanges(..., disableTriggers=true)` 时，槽位正被
 * 外层事务占着——再入队等于排在自己身后，永久挂起。这里经当前事务直发 SQL，与 sqlite 侧的
 * 同名函数（`with_triggers_disabled.ts`）同口径；两包是仅有的两处 `transaction()` 实现，
 * 语义分叉会让共享契约套件在其中一边悄悄失效。
 *
 * 读不到分支就无法重建触发器，此时必须抛让事务回滚，否则会提交一个永久没有触发器的库。
 */
export async function readCurrentBranchId(tx: PGliteRowReader): Promise<string> {
  const metadata = getEntityMetadata(RxDBBranch);
  const table = getTableNameByMetadata(metadata);
  const idColumnName = metadata.propertyMap?.get('id')?.columnName ?? 'id';
  const activatedColumnName = metadata.propertyMap?.get('activated')?.columnName ?? 'activated';
  const idColumn = quoteIdentifier(idColumnName);
  const activatedColumn = quoteIdentifier(activatedColumnName);

  const readId = async (whereSql: string, params?: unknown[]): Promise<string | undefined> => {
    const result = await tx.query<Record<string, unknown>>(
      `SELECT ${idColumn} FROM ${table} WHERE ${whereSql} LIMIT 1`,
      params
    );
    const value = result.rows[0]?.[idColumnName];
    return typeof value === 'string' ? value : undefined;
  };

  const branchId = (await readId(`${activatedColumn} IS TRUE`)) ?? (await readId(`${idColumn} = $1::text`, ['main']));
  if (branchId === undefined) {
    throw new RxdbAdapterPGliteError('currentBranch is undefined! Cannot rebuild triggers after disableTriggers.');
  }
  return branchId;
}
