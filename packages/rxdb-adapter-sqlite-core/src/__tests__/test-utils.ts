import { expectObservableSequence } from '@aiao/rxdb-test';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { remove_all_triggers_sql } from '../table/remove_trigger_sql.js';
import { generateSwitchBranchSql } from '../version/switch_branch.js';

/** fts5 为每张虚拟表生成的影子表后缀 */
const FTS5_SHADOW_SUFFIXES = ['_data', '_idx', '_content', '_docsize', '_config'] as const;

/**
 * 把表名分成「虚拟表」「影子表」「普通表」三类。
 *
 * fts5 虚拟表在 `sqlite_master` 里和它的影子表并列出现。若按 `sqlite_master` 的返回顺序
 * 直接逐表 `DELETE`，影子表 `<vt>_config` 可能先被清空，之后 `DELETE FROM <vt>` 就会报
 * `invalid fts5 file format (found 0, expected 4 or 5)`。删虚拟表本身即可连带清干净影子表，
 * 所以影子表必须整体跳过。
 */
const classifyTables = (rows: readonly (readonly unknown[])[]) => {
  const virtualTables: string[] = [];
  const allNames: string[] = [];
  for (const row of rows) {
    const name = String(row[0]);
    const sql = row[1] == null ? '' : String(row[1]);
    allNames.push(name);
    if (/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(sql)) virtualTables.push(name);
  }
  const shadowNames = new Set(
    virtualTables.flatMap(virtualTable => FTS5_SHADOW_SUFFIXES.map(suffix => `${virtualTable}${suffix}`))
  );
  return {
    virtualTables,
    plainTables: allNames.filter(name => !shadowNames.has(name) && !virtualTables.includes(name))
  };
};

/**
 * 清理数据库中的所有数据
 */
export const cleanup_db = async (adapter: RxDBAdapterSqliteBase) => {
  adapter.rxdb.entityManager.cleanAllCache();
  adapter.cleanAllCache();
  await adapter.transaction(async tx => {
    const remove_trigger_sql = remove_all_triggers_sql(adapter);
    await tx.execute(remove_trigger_sql);
    const tableNameResult = await tx.execute(`SELECT name, sql FROM sqlite_master WHERE type='table';`);
    const { virtualTables, plainTables } = classifyTables(tableNameResult.results[0].rows);
    // 先清虚拟表：此时它的影子表还完好，fts5 能正常读到自己的 config
    for (const tableName of virtualTables) {
      await tx.execute(`DELETE FROM ${quote_sql_identifier(tableName)};`);
    }
    for (const tableName of plainTables) {
      await tx.execute(`DELETE FROM ${quote_sql_identifier(tableName)};`);
    }
    await tx.execute(`DELETE FROM sqlite_sequence;`);
    await tx.execute(
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,fromChangeId,local,remote) VALUES ('main',1,NULL,1,0);`
    );
    const sql = generateSwitchBranchSql(adapter, 'main');
    await tx.execute(sql);
  }, false);

  adapter.rxdb.versionManager.resetSessionState();
  await Promise.resolve();
  await adapter.query('SELECT 1;');
};

export const expect_observable_sequence = expectObservableSequence;

/**
 * 共享套件里「必须在期限内完成」的挂钟预算，单位毫秒。
 *
 * 这些 suite 会被 `coverage-acceptance` 以 `Promise.all` 并发起五份 chromium 同时跑
 * （见 `scripts/run-coverage-acceptance.mjs`），同一台 runner 上实测把单条用例压慢 3 倍以上。
 * 因此**任何 per-test 上限都不能低于 `vitest.coverage-acceptance.config.mts` 里的
 * `testTimeout: 30000`**——写小了不会让测试更严格，只会在 CI 上假红：
 * 拖过头本来就会被外层 30s 兜住，小上限唯一的作用是提前失败。
 *
 * 显式标注（而不是删掉上限直接继承配置）是必要的：各包 vite.config 的本地默认值只有 5s/10s，
 * 覆盖不掉的话这些偏重的用例在本地会脆。
 *
 * @remarks
 * 只适用于「等某件事发生」的**期限**。用来证明「某件事不发生」的**静默观察窗**
 * （如订阅后等 300ms 断言没有第二次回调）不属于此列，放大它只会拖慢套件而不改变结论。
 */
export const SUITE_DEADLINE_MS = 30_000;
