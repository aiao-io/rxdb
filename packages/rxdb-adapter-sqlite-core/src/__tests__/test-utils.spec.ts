import { ACTIVE_BRANCH_KEY, type RxDB } from '@aiao/rxdb';
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
  const savedRows: { id: string }[] = [];
  const adapter = {
    rxdb: {
      config: { entities: [] },
      // `instantiate` 今天没有调用点（初始行随插件走了），留着是为了让回归**以断言的形式**
      // 显形：谁再把 `createWorkingTreeCommitsInitialRows` 接回来，下面那条 `savedRows` 断言
      // 会给出一份行 id 的 diff；删掉它则只剩一句 `instantiate is not a function`。
      // 返回裸对象是因为真实实体类的构造器带 `need init rxdb` 门禁，而初始行工厂只往返回值上赋字段。
      entityManager: { cleanAllCache: vi.fn(), instantiate: () => ({}) },
      versionManager: { resetSessionState: vi.fn() }
    } as unknown as RxDB,
    encryptionContext: { resolveEntityMetadata: undefined },
    cleanAllCache: vi.fn(),
    query: vi.fn().mockResolvedValue(emptyResult()),
    transaction: async <T>(
      callback: (tx: {
        execute: (sql: string) => Promise<SqliteSuccessResult>;
        saveMany: (rows: { id: string }[]) => Promise<{ id: string }[]>;
      }) => Promise<T>
    ) =>
      await callback({
        execute: async (sql: string) => {
          executedSql.push(sql.trim());
          return sql.includes('sqlite_master') ? tableResult(tables) : emptyResult();
        },
        saveMany: async (rows: { id: string }[]) => {
          savedRows.push(...rows);
          return rows;
        }
      })
  } as unknown as RxDBAdapterSqliteBase;
  return { adapter, executedSql, savedRows };
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

  // 清库要回到的是**新库形态**。对一个没装 `@aiao/rxdb-plugin-working-tree` 的库而言，
  // 新库形态就是「main 分支行 + 它的激活态哨兵」，一行不多。两者必须同进同出：
  // 只补 `id='main'` 会留下一条谁也没激活的分支，`resolveCurrentBranch()` 当场读不到激活行。
  it('把 main 分支行连同激活态哨兵一并补回', async () => {
    const { adapter, executedSql } = createCleanupAdapter([['public$todos', 'CREATE TABLE "public$todos" (...)']]);

    await cleanup_db(adapter);

    expect(executedSql).toContain(
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES ('main',1,'${ACTIVE_BRANCH_KEY}',NULL,1,0);`
    );
  });

  // 工作树/提交侧那十张表只存在于 `use(rxDBPluginWorkingTree)` 过的库里，而 `cleanup_db` 的
  // 八套调用点一个都没装插件。在这里补它们的初始行不是「多写几行」而是**当场抛错**：
  // 实体没注册，`instantiate()` 找不到元数据。这条断言盯的就是那次回归。
  it('不补工作树/提交侧的初始行：那十张表不在未装插件的库里', async () => {
    const { adapter, savedRows } = createCleanupAdapter([['public$todos', 'CREATE TABLE "public$todos" (...)']]);

    await cleanup_db(adapter);

    expect(savedRows).toEqual([]);
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
