import { RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from '../sqlite-core.interface.js';
import { cleanup_db } from './test-utils.js';

const emptyResult = (): SqliteSuccessResult => ({ sql: '', rowsAffected: 0, elapsed: 0, results: [] });

const tableResult = (rows: [string, string][]): SqliteSuccessResult => ({
  sql: '',
  rowsAffected: 0,
  elapsed: 0,
  results: [{ columns: ['name', 'sql'], rows }]
});

/**
 * 造一个只实现 `cleanup_db` 所需接口的假适配器，并记录它执行过的每一条 SQL。
 *
 * `entities` 留空即可：`remove_all_triggers_sql` / `generateSwitchBranchSql` 都按实体列表
 * 生成触发器 SQL，空列表下只剩分支表语句，正好把断言聚焦在「清哪些表」上。
 */
const createCleanupAdapter = (tables: [string, string][]) => {
  const executedSql: string[] = [];
  const adapter = {
    rxdb: {
      config: { entities: [] },
      entityManager: { cleanAllCache: vi.fn() },
      versionManager: { resetSessionState: vi.fn() }
    } as unknown as RxDB,
    encryptionContext: { resolveEntityMetadata: undefined },
    cleanAllCache: vi.fn(),
    query: vi.fn().mockResolvedValue(emptyResult()),
    transaction: async <T>(callback: (tx: { execute: (sql: string) => Promise<SqliteSuccessResult> }) => Promise<T>) =>
      await callback({
        execute: async (sql: string) => {
          executedSql.push(sql.trim());
          return sql.includes('sqlite_master') ? tableResult(tables) : emptyResult();
        }
      })
  } as unknown as RxDBAdapterSqliteBase;
  return { adapter, executedSql };
};

describe('cleanup_db', () => {
  it('清空业务表与系统表', async () => {
    const { adapter, executedSql } = createCleanupAdapter([
      ['public$todos', 'CREATE TABLE "public$todos" (...)'],
      ['rxdb$rxdb_change', 'CREATE TABLE "rxdb$rxdb_change" (...)']
    ]);

    await cleanup_db(adapter);

    expect(executedSql).toContain('DELETE FROM "public$todos";');
    expect(executedSql).toContain('DELETE FROM "rxdb$rxdb_change";');
  });

  // SQLite 的内部表不属于「测试数据」。尤其是 `sqlite_sequence`：`rxdb$rxdb_change.id` 是
  // `INTEGER PRIMARY KEY AUTOINCREMENT`，产品语义是**全局单调、删行也不回收**；重置序列会让
  // 每个测试的变更 id 都从 1 重来。上一个测试的变更事件是异步投递的，它可能在 cleanAllCache()
  // 之后才把 RxDBChange#1 水合回身份缓存，于是下一个测试查到的第 1 条变更行会命中那个
  // **别的记录**的缓存实体（identity map 按 id 认实体），读出上一个测试的 entityId。
  it('不碰 SQLite 内部表：重置 sqlite_sequence 会让 AUTOINCREMENT 主键在测试间被回收', async () => {
    const { adapter, executedSql } = createCleanupAdapter([
      ['sqlite_sequence', 'CREATE TABLE sqlite_sequence(name,seq)'],
      ['sqlite_stat1', 'CREATE TABLE sqlite_stat1(tbl,idx,stat)'],
      ['public$todos', 'CREATE TABLE "public$todos" (...)']
    ]);

    await cleanup_db(adapter);

    expect(executedSql.filter(sql => sql.includes('sqlite_sequence'))).toEqual([]);
    expect(executedSql.filter(sql => sql.includes('sqlite_stat1'))).toEqual([]);
  });
});
