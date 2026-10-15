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

/** 假贡献只需交出 `cleanup_db` 会调的那一个方法。 */
type SystemContributionLike = {
  createInitialRows: (entityManager: unknown, context: { branchIds: readonly string[] }) => { id: string }[];
};

/**
 * 造一个只实现 `cleanup_db` 所需接口的假适配器，并记录它执行过的每一条 SQL。
 *
 * `entities` 留空即可：`remove_all_triggers_sql` / `generateSwitchBranchSql` 都按实体列表
 * 生成触发器 SQL，空列表下只剩分支表语句，正好把断言聚焦在「清哪些表」上。
 *
 * `systemContributions` 默认给空数组而不是不写：真实 `RxDB` 上它是个**必然存在**的 getter，
 * 没装插件时返回 `[]`。写成缺省不存在会让「没装插件就不补行」变成 `undefined` 兜出来的巧合，
 * 而它应当是「贡献列表为空」直接得出的结论。
 */
const createCleanupAdapter = (
  tables: [string, string][],
  systemContributions: readonly SystemContributionLike[] = []
) => {
  const executedSql: string[] = [];
  const savedRows: { id: string }[] = [];
  const adapter = {
    rxdb: {
      config: { entities: [] },
      // `instantiate` 返回裸对象：真实实体类的构造器带 `need init rxdb` 门禁，而初始行工厂
      // 只往返回值上赋字段，所以假的 entityManager 交出一个空壳就够贡献函数用。
      entityManager: { cleanAllCache: vi.fn(), instantiate: () => ({}) },
      versionManager: { resetSessionState: vi.fn() },
      systemContributions
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
        // 往同一条流水里记一个标记：补初始行的**时机**和补了什么同样要紧，
        // 它必须夹在 main 分支行与触发器重装之间，分开记两份就断言不出这个夹缝。
        saveMany: async (rows: { id: string }[]) => {
          executedSql.push('<saveMany>');
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
  //
  // 夹具里必须真有 `rxdb$rxdb_branch`：补回这一行的前提是刚刚清空了它。库里没这张表却照样
  // INSERT 只会得到 `no such table`，所以补不补由「这次清理是否碰了分支表」决定，而不是无条件执行。
  it('把 main 分支行连同激活态哨兵一并补回', async () => {
    const { adapter, executedSql } = createCleanupAdapter([
      ['public$todos', 'CREATE TABLE "public$todos" (...)'],
      ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
    ]);

    await cleanup_db(adapter);

    expect(executedSql).toContain(
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES ('main',1,'${ACTIVE_BRANCH_KEY}',NULL,1,0);`
    );
  });

  // 没装插件的库里没有工作树/提交侧那十张表，也就没有初始行可补。这条**不是**「本功能默认关闭」，
  // 而是「贡献列表为空」的直接结果：一行都不用写时连 `saveMany` 都不该发。
  it('没有系统贡献的库：一行不补', async () => {
    const { adapter, savedRows, executedSql } = createCleanupAdapter([
      ['public$todos', 'CREATE TABLE "public$todos" (...)']
    ]);

    await cleanup_db(adapter);

    expect(savedRows).toEqual([]);
    expect(executedSql).not.toContain('<saveMany>');
  });

  // 清库要回到的是新库形态，而「新库形态」是 `RxDB` 建库时定下的：`main` 分支行 **加上**
  // 每个系统能力贡献的初始行（`RxDB.ts` 的 `createTables()` 就是这么拼的）。逐表 DELETE 把
  // 后半截一并清掉却不补，装了 `@aiao/rxdb-plugin-working-tree` 的库在清库后第一次
  // `createBranch()` 就会在发放分支代际时读不到激活态行直接抛错。
  //
  // 补法是回头调**同一个** `createInitialRows`，不是让调用方把行再写一遍：行的内容归贡献方
  // 定义，这里再抄一份就等于给它开了第二个定义处。本文件也因此不必 import 任何插件包。
  it('有系统贡献的库：按贡献重建初始行', async () => {
    const { adapter, savedRows } = createCleanupAdapter(
      [
        ['public$todos', 'CREATE TABLE "public$todos" (...)'],
        ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
      ],
      [
        {
          createInitialRows: (_entityManager, context) => context.branchIds.map(branchId => ({ id: `wt-${branchId}` }))
        },
        { createInitialRows: () => [{ id: 'commit-singleton' }] }
      ]
    );

    await cleanup_db(adapter);

    expect(savedRows).toEqual([{ id: 'wt-main' }, { id: 'commit-singleton' }]);
  });

  // 时机比内容更容易错，两头都不能挪：
  //
  // - 排在 main 分支行 INSERT **之后** —— 那些行按分支挂靠，main 还不存在时补它们是悬空外键；
  // - 排在切回 main 的 SQL **之前** —— 那段 SQL 顺带把各实体的触发器按 main 重新装配回去
  //   （本夹具 `entities` 为空，于是它退化成只剩两条分支表 UPDATE），触发器挂回去之后再写行，
  //   这批行会被记成一次用户编辑，清理动作自己就在下一个用例的 undo 栈里留下一格。
  //
  // 后一条也正是它必须走 `restoreInitialRows` 钩子、而不能在 `cleanupSqliteTestAdapter`
  // 返回后补写的原因：那个窗口只有清理事务内部拿得到。
  it('初始行夹在 main 分支行与切回 main 之间', async () => {
    const { adapter, executedSql } = createCleanupAdapter(
      [
        ['public$todos', 'CREATE TABLE "public$todos" (...)'],
        ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
      ],
      [{ createInitialRows: () => [{ id: 'wt-main' }] }]
    );

    await cleanup_db(adapter);

    const branchInsertIndex = executedSql.findIndex(sql => sql.startsWith('INSERT INTO "rxdb$rxdb_branch"'));
    const saveManyIndex = executedSql.indexOf('<saveMany>');
    const switchToMainIndex = executedSql.findIndex(sql => sql.startsWith('UPDATE "rxdb$rxdb_branch"'));
    expect(branchInsertIndex).toBeGreaterThanOrEqual(0);
    expect(saveManyIndex).toBeGreaterThan(branchInsertIndex);
    expect(switchToMainIndex).toBeGreaterThan(saveManyIndex);
  });

  // 逐表 DELETE 的顺序来自 `sqlite_master`，它与外键依赖顺序毫无关系：父表排在子表前面时，
  // 删父表当场撞 `FOREIGN KEY constraint failed`。`defer_foreign_keys` 把约束检查推迟到提交，
  // 于是「先删谁」不再需要拓扑排序。这条 PRAGMA 必须排在任何 DELETE 之前才有意义。
  it('先 defer 外键再逐表 DELETE：sqlite_master 的顺序不是拓扑序', async () => {
    const { adapter, executedSql } = createCleanupAdapter([
      ['public$todos', 'CREATE TABLE "public$todos" (...)'],
      ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
    ]);

    await cleanup_db(adapter);

    const pragmaIndex = executedSql.indexOf('PRAGMA defer_foreign_keys = ON;');
    const firstDeleteIndex = executedSql.findIndex(sql => sql.startsWith('DELETE FROM'));
    expect(pragmaIndex).toBeGreaterThanOrEqual(0);
    expect(pragmaIndex).toBeLessThan(firstDeleteIndex);
  });

  // 影子表由虚表自己维护，直接 DELETE 会损坏索引结构 —— 这一点对三族虚表一视同仁，
  // 不是 FTS5 的特权：RTree 的 `_node`/`_rowid`/`_parent` 与 FTS3-4 的 `_segments`/`_segdir`/`_stat`
  // 同样只能由虚表本身连带清理。反过来，后缀判定必须**精确**：与虚表同前缀的普通业务表
  // （`public$docs_audit`）不是影子表，跳过它就等于把上一个测试的数据留给下一个（RXT-005）。
  it('跳过三族虚表的影子表，但不放过同前缀的普通表', async () => {
    const { adapter, executedSql } = createCleanupAdapter([
      ['public$geo', 'CREATE VIRTUAL TABLE "public$geo" USING rtree(id, minX, maxX)'],
      ['public$geo_node', 'CREATE TABLE "public$geo_node"(nodeno INTEGER PRIMARY KEY, data)'],
      ['public$geo_rowid', 'CREATE TABLE "public$geo_rowid"(rowid INTEGER PRIMARY KEY, nodeno)'],
      ['public$geo_parent', 'CREATE TABLE "public$geo_parent"(nodeno INTEGER PRIMARY KEY, parentnode)'],
      ['public$docs', 'CREATE VIRTUAL TABLE "public$docs" USING fts4(body)'],
      ['public$docs_segments', 'CREATE TABLE "public$docs_segments"(blockid INTEGER PRIMARY KEY, block BLOB)'],
      ['public$docs_segdir', 'CREATE TABLE "public$docs_segdir"(level INTEGER, idx INTEGER)'],
      ['public$docs_stat', 'CREATE TABLE "public$docs_stat"(id INTEGER PRIMARY KEY, value BLOB)'],
      ['public$docs_audit', 'CREATE TABLE "public$docs_audit" (...)'],
      ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
    ]);

    await cleanup_db(adapter);

    const deleted = executedSql.filter(sql => sql.startsWith('DELETE FROM'));
    expect(deleted).toEqual([
      'DELETE FROM "public$geo";',
      'DELETE FROM "public$docs";',
      'DELETE FROM "public$docs_audit";',
      'DELETE FROM "rxdb$rxdb_branch";'
    ]);
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
