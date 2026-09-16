import { getEntityMetadata, RxDBBranch } from '@aiao/rxdb';
import { getTableNameByMetadata } from '../pglite.utils.js';
import type { PGliteTransactionExecutor } from '../transaction/PGliteTransactionExecutor.js';

/**
 * 在给定事务内读出当前激活的分支 id。
 *
 * @remarks
 * 语义对齐 `VersionManager.getCurrentBranch()`：先取 `activated` 的分支，没有则回退 `main`。
 *
 * 读点必须落在使用它的那个事务内部——分支 id 一旦在事务外采样，采样与使用之间的任何一次
 * 真实分支切换都会让调用方拿着过期 id 重建触发器 / 改写 `activated`。
 *
 * @param executor - 当前事务的执行器
 * @returns 当前分支 id
 */
export const read_current_branch_id = async (executor: PGliteTransactionExecutor): Promise<string> => {
  const metadata = getEntityMetadata(RxDBBranch);
  const result = await executor.queryRaw<{ id: string }>(
    `SELECT "id" FROM ${getTableNameByMetadata(metadata)} WHERE "activated" IS TRUE LIMIT 1`
  );
  return result.rows[0]?.id ?? 'main';
};
