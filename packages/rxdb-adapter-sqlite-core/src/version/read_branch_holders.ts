/**
 * @fileoverview 一批分支此刻被哪套可写检出位的影子表持有（US-314 B2.3）：变更行派实体事件时按它打上表集标记。
 *
 * @remarks
 * 变更行只记了分支，没记写在哪套表上。一条分支至多被一套表持有（设计指点 2），所以「分支此刻被谁持有」就是
 * 「这行写在哪套表上」。按派事件那一刻的持有者认：变更行提交之后、事件派出之前持有者换了（检出位刚切走），
 * 事件会落到新持有者那边——那套表随即按切换重跑活查询，多收一条只是多一次合并，与今天的时序同口径。
 */

import { getEntityMetadata, RxDBBranch, WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';

/**
 * 读这批分支里被可写检出位持有的那几条：分支 id → 持有它的那套表的后缀。
 *
 * @param adapter - SQLite 适配器
 * @param branchIds - 变更行上的分支 id，可以重复；没有分支的跳过
 * @returns 被影子表集持有的分支；主检出位持有的、没人持有的、不存在的都不在里面
 */
export const read_branch_holder_suffixes = async (
  adapter: RxDBAdapterSqliteBase,
  branchIds: Iterable<string | undefined>
): Promise<Map<string, string>> => {
  const ids = [...new Set([...branchIds].filter(id => id !== undefined))];
  const holders = new Map<string, string>();
  if (ids.length === 0) return holders;
  const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBBranch), WorktreeTableSet.MAIN));
  const result = await adapter.query(
    `SELECT id, activeKey FROM ${table} WHERE activeKey IS NOT NULL AND id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  for (const [id, activeKey] of result.results.flatMap(item => item.rows)) {
    const suffix = typeof activeKey === 'string' ? WorktreeTableSet.suffixOfHolderKey(activeKey) : null;
    if (suffix !== null) holders.set(String(id), suffix);
  }
  return holders;
};
