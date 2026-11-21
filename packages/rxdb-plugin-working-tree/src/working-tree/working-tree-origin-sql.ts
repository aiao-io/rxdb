import { getEntityMetadata, sqlStringLiteral } from '@aiao/rxdb';
import { createColumnOf } from '../entity-column.js';
import { WorkingTreeEntry } from './working-tree-entry.entity.js';

const columnOf = createColumnOf<'branchId' | 'origin'>('WorkingTreeEntry');

/**
 * 在同一遍扫描中统计本分支的两种来源，不读取条目正文。
 *
 * @param tableRef - 由执行器提供的物理表引用
 * @param branchId - 当前分支
 * @returns SQLite 与 PostgreSQL 共用的单条统计语句
 */
export const buildWorkingTreeOriginCountsSql = (tableRef: string, branchId: string): string => {
  const metadata = getEntityMetadata(WorkingTreeEntry);
  const origin = columnOf(metadata, 'origin');
  const counts = ['local', 'remote_sync'].map(
    value => `COUNT(CASE WHEN ${origin} = ${sqlStringLiteral(value)} THEN 1 END) AS ${value}_count`
  );
  return `SELECT ${counts.join(', ')} FROM ${tableRef} WHERE ${columnOf(metadata, 'branchId')} = ${sqlStringLiteral(branchId)}`;
};
