import { buildParentsOfItemsSql, type BomSqlDialect } from './bom-sql.js';
import type { ResolutionContext } from './resolution.js';
import { columnIndexOf, normalizeDate, type BomQueryExecutor } from './resolver.js';

type UsageSnapshot = Awaited<ReturnType<BomQueryExecutor['query']>>;

const mergeUsageSnapshots = (snapshots: readonly UsageSnapshot[]): UsageSnapshot => {
  const columns = snapshots[0].columns;
  const occurrence = columnIndexOf(columns, 'occurrenceId');
  const lineNo = columnIndexOf(columns, 'lineNo');
  const effectiveFrom = columnIndexOf(columns, 'effectiveFrom');
  const effectiveFromOrder = columnIndexOf(columns, 'effectiveFromOrder');
  const rows = new Map(snapshots.flatMap(snapshot => snapshot.rows).map(row => [String(row[occurrence]), row]));
  return {
    columns,
    rows: [...rows.values()].sort(
      (left, right) =>
        Number(left[lineNo]) - Number(right[lineNo]) ||
        normalizeDate(left[effectiveFrom])!.getTime() - normalizeDate(right[effectiveFrom])!.getTime() ||
        String(left[effectiveFromOrder]).localeCompare(String(right[effectiveFromOrder])) ||
        String(left[occurrence]).localeCompare(String(right[occurrence]))
    )
  };
};

const rememberUsageSnapshot = (
  cache: Map<string, UsageSnapshot>,
  itemIds: readonly string[],
  result: UsageSnapshot
) => {
  const child = columnIndexOf(result.columns, 'childItemId');
  const line = columnIndexOf(result.columns, 'lineId');
  const lines = new Map(itemIds.map(itemId => [itemId, new Set<string>()]));
  const rowsByLine = new Map<string, unknown[][]>();
  for (const row of result.rows) {
    const lineId = String(row[line]);
    const rows = rowsByLine.get(lineId) ?? [];
    rows.push(row);
    rowsByLine.set(lineId, rows);
    lines.get(String(row[child]))?.add(lineId);
  }
  for (const itemId of itemIds)
    cache.set(itemId, {
      columns: result.columns,
      rows: [...lines.get(itemId)!].flatMap(lineId => rowsByLine.get(lineId)!)
    });
};

/**
 * 在同一读事务内按物料复用使用方原始候选，保留同行候选与原查询顺序。
 *
 * @param query - 绑定当前事务的只读查询
 * @param dialect - 当前后端方言
 * @param context - 本次反查固定的解析上下文
 * @returns 仅查询尚未读取物料的快照读取器；下次事务须重新创建
 */
export const createUsageSnapshotReader = (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext
) => {
  const cache = new Map<string, UsageSnapshot>();
  return async (itemIds: readonly string[]): Promise<UsageSnapshot> => {
    const missing = itemIds.filter(itemId => !cache.has(itemId));
    if (missing.length > 0) {
      const built = buildParentsOfItemsSql(dialect, {
        asOfDate: context.asOfDate,
        bomType: context.bomType,
        orgId: context.orgId,
        itemIds: missing,
        includeLineCandidates: true
      });
      rememberUsageSnapshot(cache, missing, await query(built.sql, built.params));
    }
    return mergeUsageSnapshots(itemIds.map(itemId => cache.get(itemId)!));
  };
};

/** 单次反查事务的使用方原始候选读取器。 */
export type UsageSnapshotReader = ReturnType<typeof createUsageSnapshotReader>;
