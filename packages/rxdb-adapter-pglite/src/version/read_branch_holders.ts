/**
 * @fileoverview 一批分支此刻被哪套可写检出位的影子表持有（US-314 B2.3）：变更行派实体事件时按它打上表集标记。
 *
 * @remarks
 * 与 sqlite-core 的同名实现同口径。变更行只记了分支，没记写在哪套表上；一条分支至多被一套表持有（设计指点 2），
 * 所以「分支此刻被谁持有」就是「这行写在哪套表上」。按派事件那一刻的持有者认：变更行提交之后、事件派出之前
 * 持有者换了（检出位刚切走），事件会落到新持有者那边——那套表随即按切换重跑活查询，多收一条只是多一次合并。
 */

import { getEntityMetadata, RxDBBranch, WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { getTableNameByMetadata } from '../table-name-resolver.js';

/**
 * 读这批分支里被可写检出位持有的那几条：分支 id → 持有它的那套表的后缀。
 *
 * @param adapter - PGlite 适配器
 * @param branchIds - 变更行上的分支 id，可以重复；没有分支的跳过
 * @returns 被影子表集持有的分支；主检出位持有的、没人持有的、不存在的都不在里面
 */
export const readBranchHolderSuffixes = async (
  adapter: RxDBAdapterPGlite,
  branchIds: Iterable<string | undefined>
): Promise<Map<string, string>> => {
  const ids = [...new Set([...branchIds].filter(id => id !== undefined))];
  const holders = new Map<string, string>();
  if (ids.length === 0) return holders;
  const table = getTableNameByMetadata(getEntityMetadata(RxDBBranch), WorktreeTableSet.MAIN);
  const result = await adapter.query<{ id: string; activeKey: string | null }>(
    `SELECT id, "activeKey" FROM ${table} WHERE "activeKey" IS NOT NULL AND id = ANY($1::text[])`,
    [ids]
  );
  for (const row of result.rows) {
    const suffix = row.activeKey === null ? null : WorktreeTableSet.suffixOfHolderKey(row.activeKey);
    if (suffix !== null) holders.set(row.id, suffix);
  }
  return holders;
};
