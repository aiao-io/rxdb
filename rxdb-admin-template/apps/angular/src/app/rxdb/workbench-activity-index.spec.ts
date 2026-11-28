// @vitest-environment node
import type { LocalRxDBAdapter } from '@aiao/rxdb';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { createWorkbenchDatabase } from './setup_rxdb';
import { workbenchActivityIndex } from './workbench-activity-index';

/** 一个登录账号的本机库身份：没有身份时工作台是不注册适配器的占位实例（ADMIN-US-222）。 */
const identity = { scope: 'https://project.supabase.co', subject: '0191b2c4-7f3a-7c1e-9d4b-2a6f8e1c5b30' };

it('连接后才安装日志覆盖索引，重复安装保留现有数据', async () => {
  const db = createWorkbenchDatabase(undefined, identity);
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, branchId TEXT, namespace TEXT,
    transactionId TEXT, createdAt TEXT, entity TEXT);
    INSERT INTO "rxdb$rxdb_change" VALUES (1, 'main', 'assets', NULL, '2026-01-01', 'Asset')`);
  const adapter = await db.getAdapter('sqlite-wasm');
  const query = vi.fn(async (sql: string) => {
    sqlite.exec(sql);
    return { rows: [], columns: [], rowsAffected: 0 };
  });
  type Executor = Parameters<Parameters<typeof adapter.bootstrapTransaction>[0]>[0];
  const executor = { query } as unknown as Executor;
  const transaction = vi
    .spyOn(adapter, 'bootstrapTransaction')
    .mockImplementation(async fun => (await fun(executor)) as Awaited<ReturnType<typeof fun>>);
  const raw = vi.spyOn(adapter, 'rawQuery').mockRejectedValue(new Error('安装索引不能等待 connect 自身'));
  const local = vi.spyOn(db, 'localAdapterSync', 'get').mockReturnValue(adapter as unknown as LocalRxDBAdapter);
  try {
    const plugin = workbenchActivityIndex(db);
    expect(plugin.inject).toEqual(['adapter:local']);
    expect(query).not.toHaveBeenCalled();
    await plugin.install();
    await plugin.install();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), false);
    expect(raw).not.toHaveBeenCalled();
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM "rxdb$rxdb_change"').get()?.['count']).toBe(1);
    const plan = sqlite
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id, transactionId, createdAt FROM "rxdb$rxdb_change"
      WHERE branchId = 'main' AND namespace = 'assets' AND entity = 'Asset' ORDER BY id DESC`
      )
      .all();
    expect(plan.map(row => row['detail']).join(' ')).toContain('USING COVERING INDEX');
  } finally {
    local.mockRestore();
    transaction.mockRestore();
    raw.mockRestore();
    sqlite.close();
    await db.destroy();
  }
});
