import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { dashboardActivitySql, decodeDashboardActivities } from './dashboard-activity-query';
import { normalizeDashboardChanges, type DashboardChange } from './dashboard-model';

const databases: DatabaseSync[] = [];
type Change = DashboardChange & { branchId: string };

function change(id: number, extra: Partial<Change> = {}): Change {
  return {
    id,
    namespace: 'assets',
    entity: 'AssetCategory',
    type: 'INSERT',
    createdAt: new Date(1_700_000_000_000 + id),
    branchId: 'branch-a',
    ...extra
  };
}

function query(changes: readonly Change[], branchId = 'branch-a') {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(`CREATE TABLE changes (id INTEGER PRIMARY KEY, namespace TEXT, entity TEXT, type TEXT,
    transactionId TEXT, createdAt TEXT, revertChangeId INTEGER, redoInvalidatedAt TEXT, branchId TEXT)`);
  const insert = db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const row of changes) {
    insert.run(
      row.id,
      row.namespace,
      row.entity,
      row.type,
      row.transactionId ?? null,
      row.createdAt.toISOString(),
      row.revertChangeId ?? null,
      row.redoInvalidatedAt?.toISOString() ?? null,
      row.branchId
    );
  }
  const statement = db.prepare(dashboardActivitySql('changes'));
  const columns = statement.columns().map(column => column.name);
  return decodeDashboardActivities({
    columns,
    rows: statement
      .all(branchId, 'assets', 'AssetCategory', 'Asset', 'AssetEvent')
      .map(row => columns.map(column => row[column])),
    rowsAffected: 0
  });
}

afterEach(() => databases.splice(0).forEach(db => db.close()));

describe('Dashboard SQLite 操作单元聚合', () => {
  it('空库返回空活动', () => expect(query([])).toEqual([]));

  it('完整保留超过五条、跨常规分页边界的事务及其撤销和失效状态', () => {
    const rows = Array.from({ length: 513 }, (_, index) => change(index + 1, { transactionId: 'large-transaction' }));
    rows[0] = change(1, { transactionId: 'large-transaction', revertChangeId: 999, redoInvalidatedAt: new Date() });
    rows.push(...Array.from({ length: 6 }, (_, index) => change(514 + index)));
    const expected = normalizeDashboardChanges(rows);
    expect(query(rows)).toEqual(expected);
    const transaction = query(rows.slice(0, 517)).find(row => row.type === 'TRANSACTION');
    expect(transaction).toMatchObject({ changeId: 513, count: 513, reverted: true, redoInvalidated: true });
    expect(transaction?.fingerprint.split(':')).toHaveLength(514);
  });

  it('只聚合过滤后连续的相同非空事务，保留首条实体与时间', () => {
    const rows = [
      change(1, { transactionId: 'reused', createdAt: new Date('2030-01-01') }),
      change(2, { transactionId: 'reused', entity: 'Asset' }),
      change(3, { transactionId: '' }),
      change(4),
      change(5, { transactionId: 'reused' }),
      change(6, { transactionId: 'reused', namespace: 'other' }),
      change(7, { transactionId: 'reused', entity: 'AssetEvent' })
    ];
    expect(query(rows)).toEqual(normalizeDashboardChanges(rows.filter(row => row.namespace === 'assets')));
    expect(query(rows).find(row => row.changeId === 7)).toMatchObject({ count: 2, entity: 'AssetEvent' });
    expect(query(rows).find(row => row.changeId === 2)?.createdAt).toEqual(rows[1]?.createdAt);
  });

  it('按时间再按 ID 排序，不能按日志 ID 提前停止；隔离分支和实体', () => {
    const rows = Array.from({ length: 20 }, (_, index) => change(index + 1));
    rows.push(
      change(21, { createdAt: new Date('2000-01-01') }),
      change(22, { branchId: 'branch-b' }),
      change(23, { entity: 'Other' })
    );
    rows[0] = change(1, { createdAt: new Date('2030-01-01') });
    rows[1] = change(2, { createdAt: new Date('2030-01-01') });
    expect(query(rows).map(row => row.changeId)).toEqual([2, 1, 20, 19, 18]);
    expect(query(rows, 'branch-b').map(row => row.changeId)).toEqual([22]);
  });

  it('混合日志语料与既有 JS 归一化结果逐字段一致', () => {
    const rows = Array.from({ length: 2000 }, (_, index) =>
      change(index + 1, {
        branchId: index % 19 === 0 ? 'branch-b' : 'branch-a',
        entity: index % 11 === 0 ? 'Other' : ['Asset', 'AssetCategory', 'AssetEvent'][index % 3]!,
        transactionId: index % 8 < 6 ? `transaction-${Math.floor(index / 8)}` : null,
        createdAt: new Date(1_700_000_000_000 + ((index * 37) % 211)),
        type: ['INSERT', 'UPDATE', 'DELETE'][index % 3] as Change['type'],
        revertChangeId: index % 13 === 0 ? 3000 + index : null,
        redoInvalidatedAt: index % 17 === 0 ? new Date() : null
      })
    );
    const expected = normalizeDashboardChanges(
      rows.filter(row => row.branchId === 'branch-a' && row.entity !== 'Other')
    );
    expect(query(rows)).toEqual(expected);
  });
});
