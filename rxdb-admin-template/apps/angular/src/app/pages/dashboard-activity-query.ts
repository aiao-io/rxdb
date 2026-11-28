import type { RawQueryResult } from '@aiao/rxdb';
import {
  DASHBOARD_ACTIVITY_LIMIT,
  DASHBOARD_METRICS,
  type DashboardActivity,
  type DashboardActivityType
} from './dashboard-model';

/** 先按 ID 连续性划分事务，再对完整操作单元排序；不读取业务 patch。 */
export function dashboardActivitySql(tableName: string): string {
  const table = `"${tableName.replaceAll('"', '""')}"`;
  const entityParameters = DASHBOARD_METRICS.map(() => '?').join(', ');
  return `WITH ordered AS (
    SELECT id, createdAt, transactionId,
      LAG(transactionId) OVER (ORDER BY id DESC) AS previousTransaction
    FROM ${table}
    WHERE branchId = ? AND namespace = ? AND entity IN (${entityParameters})
  ), boundaries AS (
    SELECT id AS changeId, createdAt, LEAD(id) OVER (ORDER BY id DESC) AS lowerId
    FROM ordered
    WHERE CASE WHEN transactionId <> '' AND transactionId = previousTransaction THEN 0 ELSE 1 END = 1
  ), latest AS (
    SELECT * FROM boundaries ORDER BY JULIANDAY(createdAt) DESC, changeId DESC
    LIMIT ${DASHBOARD_ACTIVITY_LIMIT}
  )
  SELECT latest.changeId, first.namespace, first.entity,
    CASE WHEN first.transactionId IS NOT NULL AND first.transactionId <> '' THEN 'TRANSACTION' ELSE first.type END AS type,
    COUNT(*) AS count, first.createdAt,
    MAX(member.revertChangeId IS NOT NULL) AS reverted,
    MAX(member.redoInvalidatedAt IS NOT NULL) AS redoInvalidated,
    GROUP_CONCAT(member.id, ':' ORDER BY member.id DESC) AS ids
  FROM latest JOIN ${table} AS first ON first.id = latest.changeId
    JOIN ${table} AS member ON member.id BETWEEN COALESCE(latest.lowerId + 1, -9223372036854775808) AND latest.changeId
  WHERE member.branchId = first.branchId AND member.namespace = first.namespace
    AND member.entity IN (${entityParameters})
  GROUP BY latest.changeId
  ORDER BY JULIANDAY(first.createdAt) DESC, latest.changeId DESC`;
}

/** SQLite 只返回五个完整操作单元，不把日志实例写入实体缓存。 */
export function decodeDashboardActivities(result: RawQueryResult): DashboardActivity[] {
  return result.rows.map(row => {
    const [changeId, namespace, entity, type, count, createdAt, reverted, redoInvalidated, ids] = row;
    return {
      changeId: changeId as number,
      namespace: namespace as string,
      entity: entity as string,
      type: type as DashboardActivityType,
      count: count as number,
      createdAt: new Date(createdAt as string),
      reverted: reverted === 1,
      redoInvalidated: redoInvalidated === 1,
      fingerprint: `${type}:${ids}`
    };
  });
}
